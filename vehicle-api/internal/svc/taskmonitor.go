package svc

import (
	"context"
	"encoding/json"
	"math"
	"sync"

	"vehicle-api/internal/types"
	"vehicle-api/internal/websocket"

	"github.com/zeromicro/go-zero/core/logx"
)

// TaskInfo 保存任务相关的位置信息与已触发状态
type TaskInfo struct {
	TaskId          string
	OrderId         string
	Pickup          types.Position2D
	Destination     types.Position2D
	AssignedVehicle string // 可选：分配给该任务的 vehicleId
	ReachedPick     bool
	ReachedDest     bool
}

// vehicleTaskList 用于对单个 vehicleId 下的任务进行并发安全管理
type vehicleTaskList struct {
	mu    sync.RWMutex
	tasks map[string]*TaskInfo
}

func newVehicleTaskList() *vehicleTaskList {
	return &vehicleTaskList{tasks: make(map[string]*TaskInfo)}
}

func (v *vehicleTaskList) add(t *TaskInfo) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.tasks[t.TaskId] = t
}

func (v *vehicleTaskList) remove(taskId string) {
	v.mu.Lock()
	defer v.mu.Unlock()
	delete(v.tasks, taskId)
}

func (v *vehicleTaskList) snapshot() []*TaskInfo {
	v.mu.RLock()
	defer v.mu.RUnlock()
	out := make([]*TaskInfo, 0, len(v.tasks))
	for _, t := range v.tasks {
		out = append(out, t)
	}
	return out
}

// TaskMonitor 监听车辆位置事件并根据距离阈值触发到达事件
type TaskMonitor struct {
	tasks        sync.Map // key: taskId string, value: *TaskInfo
	vehicleIndex sync.Map // key: vehicleId string, value: *vehicleTaskList
	thrMeter     float64  // 距离阈值（米）
	hub          *websocket.Hub
	ctx          context.Context
	cancel       context.CancelFunc
}

// NewTaskMonitor 创建监控器并启动监听循环
func NewTaskMonitor(ctx context.Context, hub *websocket.Hub, thresholdMeters float64, vehicleEventChan <-chan *types.VehicleStateData) *TaskMonitor {
	if thresholdMeters <= 0 {
		thresholdMeters = 100.0 // 默认 100m
	}
	cctx, cancel := context.WithCancel(ctx)
	tm := &TaskMonitor{
		thrMeter: thresholdMeters,
		hub:      hub,
		ctx:      cctx,
		cancel:   cancel,
	}

	go tm.runListener(vehicleEventChan)
	logx.Infof("TaskMonitor 启动，thresholdMeters=%.1f", tm.thrMeter)
	return tm
}

// Register 注册一个需要监控的任务
func (tm *TaskMonitor) Register(t *TaskInfo) {
	if t == nil || t.TaskId == "" {
		return
	}
	tm.tasks.Store(t.TaskId, t)
	if t.AssignedVehicle != "" {
		v, _ := tm.vehicleIndex.LoadOrStore(t.AssignedVehicle, newVehicleTaskList())
		vtl := v.(*vehicleTaskList)
		vtl.add(t)
	}
}

// AssignVehicle 将任务与车辆关联（可在分配到车辆后调用）
func (tm *TaskMonitor) AssignVehicle(taskId, vehicleId string) {
	if taskId == "" || vehicleId == "" {
		return
	}
	v, ok := tm.tasks.Load(taskId)
	if !ok {
		return
	}
	ti := v.(*TaskInfo)
	ti.AssignedVehicle = vehicleId
	// 将任务加入 vehicleIndex
	vi, _ := tm.vehicleIndex.LoadOrStore(vehicleId, newVehicleTaskList())
	vi.(*vehicleTaskList).add(ti)
}

// Unregister 注销任务
func (tm *TaskMonitor) Unregister(taskId string) {
	if taskId == "" {
		return
	}
	v, ok := tm.tasks.Load(taskId)
	if ok {
		ti := v.(*TaskInfo)
		if ti.AssignedVehicle != "" {
			if vi, ok2 := tm.vehicleIndex.Load(ti.AssignedVehicle); ok2 {
				vi.(*vehicleTaskList).remove(taskId)
			}
		}
	}
	tm.tasks.Delete(taskId)
}

// Stop 停止监控器
func (tm *TaskMonitor) Stop() {
	tm.cancel()
}

// runListener 从 vehicleEventChan 接收位置并检查每个任务的到达条件
func (tm *TaskMonitor) runListener(vehicleEventChan <-chan *types.VehicleStateData) {
	for {
		select {
		case <-tm.ctx.Done():
			logx.Infof("TaskMonitor 停止")
			return
		case ev, ok := <-vehicleEventChan:
			if !ok {
				logx.Infof("vehicleEventChan 已关闭，TaskMonitor 退出")
				return
			}
			if ev == nil || ev.VehicleId == "" {
				continue
			}
			tm.handleEvent(ev)
		}
	}
}

func (tm *TaskMonitor) handleEvent(ev *types.VehicleStateData) {
	// 仅查找与该 vehicleId 相关的任务，避免遍历全部任务
	vi, ok := tm.vehicleIndex.Load(ev.VehicleId)
	if !ok {
		return
	}
	vtl := vi.(*vehicleTaskList)
	tasks := vtl.snapshot()
	for _, ti := range tasks {
		if ti == nil {
			continue
		}
		if !ti.ReachedPick {
			d := haversineMeters(ev.Lat, ev.Lon, ti.Pickup.Lat, ti.Pickup.Lon)
			if d <= tm.thrMeter {
				ti.ReachedPick = true
				tm.emitEvent("arrived_pickup", ti, ev)
			}
		}
		if !ti.ReachedDest {
			d2 := haversineMeters(ev.Lat, ev.Lon, ti.Destination.Lat, ti.Destination.Lon)
			if d2 <= tm.thrMeter {
				ti.ReachedDest = true
				tm.emitEvent("arrived_destination", ti, ev)
			}
		}
		// 如果任务的取货点和目的地都已到达，则注销任务并发送完成事件
		if ti.ReachedPick && ti.ReachedDest {
			tm.emitEvent("task_completed", ti, ev)
			tm.Unregister(ti.TaskId)
			logx.Infof("任务 %s 已完成并从监控中移除", ti.TaskId)
		}
	}
}

func (tm *TaskMonitor) emitEvent(evtType string, ti *TaskInfo, ev *types.VehicleStateData) {
	if tm.hub == nil {
		return
	}
	payload := map[string]interface{}{
		"type":      evtType,
		"taskId":    ti.TaskId,
		"orderId":   ti.OrderId,
		"vehicleId": ev.VehicleId,
		"timestamp": ev.Timestamp,
		"lon":       ev.Lon,
		"lat":       ev.Lat,
	}
	b, err := json.Marshal(payload)
	if err != nil {
		logx.Errorf("marshal task event failed: %v", err)
		return
	}
	// 定向广播到 orders 服务
	tm.hub.BroadcastToService("orders", b)
	logx.Infof("发出任务事件 type=%s taskId=%s vehicleId=%s", evtType, ti.TaskId, ev.VehicleId)
}

// haversineMeters 计算两点间距离（米）
func haversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000.0 // 地球半径 米
	toRad := func(d float64) float64 { return d * math.Pi / 180.0 }
	dLat := toRad(lat2 - lat1)
	dLon := toRad(lon2 - lon1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}
