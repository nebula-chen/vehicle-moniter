package logic

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type VehicleDispatchLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewVehicleDispatchLogic(ctx context.Context, svcCtx *svc.ServiceContext) *VehicleDispatchLogic {
	return &VehicleDispatchLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *VehicleDispatchLogic) VehicleDispatch(req *types.DispatchReq) (resp *types.DispatchResp, err error) {
	// 1) 生成内部 taskId
	taskId := fmt.Sprintf("task-%d", time.Now().UnixNano())

	// 2) TODO: 在这里调用外部调度平台的 API 进行派单。
	// 由于外部平台接口尚未确定，先预留该调用位置（占位）。
	// 例如: platformResp, err := l.svcCtx.Platform.AssignTask(...)
	// 如果成功会返回 platformTaskId / assignedVehicleId 等信息。

	// 3) 初始持久化/记录（如果 MySQL 已配置，可在此处保存 task 记录）
	if l.svcCtx != nil && l.svcCtx.MySQLDao != nil {
		// TODO: 调用 MySQLDao 的方法持久化任务，这里仅记录日志作为占位
		l.Logger.Infof("[dispatch] create task %s for order %s (持久化占位)", taskId, req.OrderId)
	} else {
		l.Logger.Infof("[dispatch] create task %s for order %s", taskId, req.OrderId)
	}

	// 4) 组装响应（当前仅返回内部 taskId 与基础状态，后续可扩展 platformTaskId/vehicleId/status/pushAck）
	resp = &types.DispatchResp{
		Code:    0,
		Message: "task created",
		TaskId:  taskId,
		// VehicleId 先留空，待外部平台分配后回填
		VehicleId: "",
		Status:    0,
	}

	// 5) 向订阅的 ws 客户端推送初始派单事件（定向到 orders 服务的 websocket 客户端）
	if l.svcCtx != nil && l.svcCtx.WSHub != nil {
		// 事件结构示例：{type: "dispatch_created", taskId, orderId, timestamp}
		evt := map[string]interface{}{
			"type":      "dispatch_created",
			"taskId":    taskId,
			"orderId":   req.OrderId,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		}
		if b, jerr := json.Marshal(evt); jerr == nil {
			// 优先定向广播到 orders 服务的客户端
			l.svcCtx.WSHub.BroadcastToService("orders", b)
		} else {
			l.Logger.Errorf("marshal dispatch event failed: %v", jerr)
		}
	}

	// 6) 若后续需要监听车辆状态并把与本 task 相关的状态更新广播出去，可在此处注册一个临时监听器。
	// 当前我们没有 assignedVehicleId（因外部平台未调用），因此只在未来实现时才会注册精确匹配过滤器。
	// 将任务注册到 ServiceContext 的 TaskMonitor 中：当车辆接近 pickup/destination 时自动生成到达事件并推送给 orders
	if l.svcCtx != nil {
		// assignedVehicleId 目前未知，传入空字符串
		l.svcCtx.RegisterTaskForMonitor(taskId, req.OrderId, req.Pickup, req.Destination, "")
	}

	go func(localTaskId string) {
		// 如果没有事件通道或 hub，则无需监听
		if l.svcCtx == nil || l.svcCtx.VehicleEventChan == nil || l.svcCtx.WSHub == nil {
			return
		}

		// 简单示例：监听一段时间内的车辆事件并把原始事件包装后转发到 orders 服务。
		// 真实实现应根据 platformTaskId/assignedVehicleId/metadata 做过滤并长期订阅。
		timeout := time.NewTimer(5 * time.Minute)
		defer timeout.Stop()

		for {
			select {
			case <-timeout.C:
				// 超时退出监听
				l.Logger.Infof("dispatch listener for task %s timeout exit", localTaskId)
				return
			case ev := <-l.svcCtx.VehicleEventChan:
				if ev == nil {
					continue
				}
				// 将接收到的车辆状态包装为带 taskId 的消息并转发给 orders 客户端
				wrapper := map[string]interface{}{
					"type":        "vehicle_state",
					"taskId":      localTaskId,
					"vehicleId":   ev.VehicleId,
					"status":      "unknown",
					"timestamp":   ev.Timestamp,
					"vehicleData": ev,
				}
				if b, jerr := json.Marshal(wrapper); jerr == nil {
					l.svcCtx.WSHub.BroadcastToService("orders", b)
				}
			}
		}
	}(taskId)

	return resp, nil
}
