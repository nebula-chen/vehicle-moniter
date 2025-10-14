package processor

import (
	"fmt"
	"math"
	"sync"
	"time"

	"vehicle-api/internal/dao"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

// Processor 负责处理来自设备的状态并将其持久化到数据库
type Processor interface {
	ProcessState(state *types.VEH2CLOUD_STATE) error
}

// DefaultProcessor 默认实现，使用 MySQLDao 进行写入
type DefaultProcessor struct {
	MySQL *dao.MySQLDao
	// per-vehicle buffers: key vehicleId -> slice of recent states
	buffers sync.Map // map[string][]types.VEH2CLOUD_STATE
	// 记录每个 vehicle 上一次成功保存的任务结束时间（UnixMilli）
	// 用于去重/抖动：当在短时间内再次收到到达目的地的上报且轨迹点很少时，认为是客户端退出时的重复上报，跳过保存
	lastSaved sync.Map // map[string]int64
}

func NewDefaultProcessor(mysqlDao *dao.MySQLDao) *DefaultProcessor {
	return &DefaultProcessor{MySQL: mysqlDao}
}

func (p *DefaultProcessor) ProcessState(r *types.VEH2CLOUD_STATE) error {
	if p == nil || p.MySQL == nil || r == nil {
		return nil
	}

	// minimal guard
	if r.VehicleId == "" {
		return fmt.Errorf("empty vehicle id")
	}

	// 基本校验
	if r.VehicleId == "" {
		return fmt.Errorf("empty vehicle id")
	}

	// 将点追加到缓冲中（按 vehicleId）
	key := r.VehicleId
	var buf []types.VEH2CLOUD_STATE
	if v, ok := p.buffers.Load(key); ok {
		buf = v.([]types.VEH2CLOUD_STATE)
	}
	// 限制缓冲大小，保存最近 1000 条（可根据需要调整）
	buf = append(buf, *r)
	if len(buf) > 1000 {
		buf = buf[len(buf)-1000:]
	}
	p.buffers.Store(key, buf)

	logx.Infof("Processor 收到状态 vehicle=%s ts=%d lon=%d lat=%d destLon=%d destLat=%d passNum=%d",
		r.VehicleId, r.TimestampGNSS, r.Position.Longitude, r.Position.Latitude, r.DestLocation.Longitude, r.DestLocation.Latitude, r.PassPointsNum)

	// 检测是否到达目的地：当车辆与 DestLocation 的距离 <= 2 米时认为到达
	// 如果当前点不到达则退出
	if !isAtDestination(r) {
		return nil
	}

	logx.Infof("Processor 检测到到达目的地 vehicle=%s ts=%d", r.VehicleId, r.TimestampGNSS)

	// 当前点被判断为到达，需从缓冲中找出本次任务的起点和终点
	// 策略：从缓冲末尾向前查找最近一次被判断为到达的索引（不包含当前），
	// 起点为上一次到达后的下一条记录；若没有上一次到达，则起点为缓冲开始
	lastIdx := -1
	for i := len(buf) - 2; i >= 0; i-- {
		if isAtDestination(&buf[i]) {
			lastIdx = i
			break
		}
	}
	startIdx := 0
	if lastIdx >= 0 {
		startIdx = lastIdx + 1
	}
	endIdx := len(buf) - 1 // 当前到达点

	if startIdx > endIdx {
		// 没有有效段
		return nil
	}

	segment := buf[startIdx : endIdx+1]

	// 回溯处理 PassPoints：如果上报中包含 PassPoints，尝试扩展起点到该任务的起始上报前一点
	// 这里采用简单策略：若 segment 第一个点包含 PassPoints 且数量>0，则尝试向前回退 N 条，N = len(PassPoints)
	// types.VEH2CLOUD_STATE 中的 PassPoints 以 Position2D 数组形式存在（如果有）
	// 兼容性：若没有该字段或为空则跳过
	// 注意：在 types 定义中，PassPoints 字段名为 PassPoints []Position2D
	// 反推起点
	if len(segment) > 0 {
		// 读取第一条原始记录的途经点数量
		// 由于 types.VEH2CLOUD_STATE 中未使用指针，直接访问
		passNum := int(segment[0].PassPointsNum)
		if passNum > 0 {
			// 向前回退 passNum 条（但不超过缓冲开始）
			extra := passNum
			newStart := startIdx - extra
			if newStart < 0 {
				newStart = 0
			}
			segment = buf[newStart : endIdx+1]
			startIdx = newStart
		}
	}

	// 去除 segment 开头经纬度均为 0 的无效点，避免保存起点为 0 的异常情况
	if len(segment) > 0 {
		found := false
		firstValid := 0
		for i, s := range segment {
			if s.Position.Longitude != 0 || s.Position.Latitude != 0 {
				firstValid = i
				found = true
				break
			}
		}
		if !found {
			// 全部点均为无效坐标，跳过保存并清理缓冲
			logx.Infof("Processor 跳过全部为0的轨迹 segment vehicle=%s len=%d", r.VehicleId, len(segment))
			if endIdx+1 < len(buf) {
				newBuf := buf[endIdx+1:]
				p.buffers.Store(key, newBuf)
			} else {
				p.buffers.Store(key, []types.VEH2CLOUD_STATE{})
			}
			return nil
		}
		if firstValid > 0 {
			segment = segment[firstValid:]
			startIdx = startIdx + firstValid
		}
	}

	// 构造要保存的 task 和 points
	// 生成 task id，可使用 vehicleId+start_unixnano
	// 去抖动/去重逻辑：如果上一次成功保存的任务刚刚发生（例如 5s 内），
	// 且当前 segment 极短（例如 <=2 条），则很可能是客户端到达后继续上报的重复点，跳过保存
	taskId := fmt.Sprintf("%s-%d", r.VehicleId, time.Now().UnixNano())
	if v, ok := p.lastSaved.Load(key); ok {
		if lastMs, ok2 := v.(int64); ok2 {
			// 当前 segment 的开始时间（ms）
			segStartMs := int64(segment[0].TimestampGNSS)
			// 如果距离上次保存结束时间小于 debounceWindow 且段长度小于等于 shortSegmentLen，则跳过
			const debounceWindow = int64(5000) // 5 秒
			const shortSegmentLen = 2          // 小段阈值，可根据需要调整
			if segStartMs-lastMs <= debounceWindow && len(segment) <= shortSegmentLen {
				// 跳过保存这次过短的重复任务
				logx.Infof("Processor 跳过短重复任务 vehicle=%s seg_len=%d since_last_save_ms=%d", r.VehicleId, len(segment), segStartMs-lastMs)
				return nil
			}
		}
	}
	logx.Infof("Processor 生成 taskId=%s vehicle=%s startIdx=%d endIdx=%d segment_len=%d", taskId, r.VehicleId, startIdx, endIdx, len(segment))
	t := struct {
		TaskId    string
		VehicleId string
		StartTime time.Time
		EndTime   time.Time
		StartLon  int64
		StartLat  int64
		EndLon    int64
		EndLat    int64
		Status    string
	}{
		TaskId:    taskId,
		VehicleId: r.VehicleId,
		StartTime: time.UnixMilli(int64(segment[0].TimestampGNSS)).UTC(),
		EndTime:   time.UnixMilli(int64(segment[len(segment)-1].TimestampGNSS)).UTC(),
		StartLon:  int64(segment[0].Position.Longitude),
		StartLat:  int64(segment[0].Position.Latitude),
		EndLon:    int64(segment[len(segment)-1].Position.Longitude),
		EndLat:    int64(segment[len(segment)-1].Position.Latitude),
		Status:    "completed",
	}

	pts := make([]struct {
		Timestamp time.Time
		Lon       int64
		Lat       int64
		Velocity  int
	}, 0, len(segment))
	for _, s := range segment {
		pts = append(pts, struct {
			Timestamp time.Time
			Lon       int64
			Lat       int64
			Velocity  int
		}{Timestamp: time.UnixMilli(int64(s.TimestampGNSS)).UTC(), Lon: int64(s.Position.Longitude), Lat: int64(s.Position.Latitude), Velocity: int(s.Velocity)})
	}

	// 持久化到 MySQL
	// 调用 MySQL 保存
	if err := p.MySQL.SaveTaskAndPoints(t, pts); err != nil {
		logx.Errorf("SaveTaskAndPoints 失败 taskId=%s vehicle=%s: %v", taskId, r.VehicleId, err)
		return fmt.Errorf("save task failed: %w", err)
	}
	logx.Infof("SaveTaskAndPoints 成功 taskId=%s vehicle=%s points=%d", taskId, r.VehicleId, len(pts))

	// 保存成功后记录本次任务的结束时间（ms），用于后续的去抖动判断
	endMs := int64(t.EndTime.UnixMilli())
	p.lastSaved.Store(key, endMs)

	// 将缓冲中已经保存的部分清理掉，保留从 endIdx+1 开始的点
	if endIdx+1 < len(buf) {
		newBuf := buf[endIdx+1:]
		p.buffers.Store(key, newBuf)
	} else {
		// 清空缓冲
		p.buffers.Store(key, []types.VEH2CLOUD_STATE{})
	}

	return nil
}

// isAtDestination 判断车辆记录是否到达目的地（<=2米）
func isAtDestination(r *types.VEH2CLOUD_STATE) bool {
	// 如果 DestLocation 中经纬度为异常值（0xFFFFFFFF / 4294967295），则认为不可判断
	if r == nil {
		return false
	}
	dstLon := float64(int64(r.DestLocation.Longitude)) / 1e7
	dstLat := float64(int64(r.DestLocation.Latitude)) / 1e7
	curLon := float64(int64(r.Position.Longitude)) / 1e7
	curLat := float64(int64(r.Position.Latitude)) / 1e7
	// 如果目的地坐标为0认为无效
	if dstLon == 0 && dstLat == 0 {
		return false
	}
	d := haversine(curLat, curLon, dstLat, dstLon)
	return d <= 2.0
}

// haversine 使用同样的球面距离计算（米）
func haversine(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371000.0
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLng := (lng2 - lng1) * math.Pi / 180.0
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1*math.Pi/180.0)*math.Cos(lat2*math.Pi/180.0)*math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}
