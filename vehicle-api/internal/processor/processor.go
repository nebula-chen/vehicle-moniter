package processor

import (
	"fmt"
	"sync"
	"time"

	"vehicle-api/internal/dao"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

// Processor 负责处理来自VehicleState API的状态并将其持久化到数据库
type Processor interface {
	ProcessState(state *types.VehicleStateData) error
}

// DefaultProcessor 默认实现，使用 MySQLDao 进行写入
type DefaultProcessor struct {
	MySQL *dao.MySQLDao
	// per-vehicle 缓存最后一次状态，用于去重
	lastStates sync.Map // map[string]types.VehicleStateData
}

func NewDefaultProcessor(mysqlDao *dao.MySQLDao) *DefaultProcessor {
	return &DefaultProcessor{MySQL: mysqlDao}
}

// ProcessState 处理车辆状态数据
// 将车辆状态写入MySQL进行持久化
func (p *DefaultProcessor) ProcessState(state *types.VehicleStateData) error {
	if p == nil || p.MySQL == nil || state == nil {
		return nil
	}

	// 基本校验
	if state.VehicleId == "" {
		return fmt.Errorf("empty vehicle id")
	}

	// 记录接收的状态
	logx.Debugf("Processor 处理状态 vehicle=%s ts=%d lon=%.6f lat=%.6f speed=%.2f",
		state.VehicleId, state.Timestamp, state.Lon, state.Lat, state.Speed)

	// 检查是否为重复数据（用于去重）
	key := state.VehicleId
	if lastState, ok := p.lastStates.Load(key); ok {
		if last, ok := lastState.(types.VehicleStateData); ok {
			// 如果时间戳相同，说明是重复数据，跳过处理
			if last.Timestamp == state.Timestamp {
				logx.Debugf("跳过重复数据 vehicle=%s ts=%d", state.VehicleId, state.Timestamp)
				return nil
			}
		}
	}
	p.lastStates.Store(key, *state)

	// 将状态信息写入MySQL
	record := struct {
		VehicleId string
		Timestamp time.Time
		Lon       int64
		Lat       int64
		Velocity  int
	}{
		VehicleId: state.VehicleId,
		Timestamp: time.UnixMilli(int64(state.Timestamp)).UTC(),
		Lon:       int64(state.Lon * 1e7), // 转换为1e7倍数
		Lat:       int64(state.Lat * 1e7),
		Velocity:  int(state.Speed),
	}

	if err := p.MySQL.BatchInsertRecords([]struct {
		VehicleId string
		Timestamp time.Time
		Lon       int64
		Lat       int64
		Velocity  int
	}{record}); err != nil {
		logx.Errorf("保存状态记录失败 vehicle=%s: %v", state.VehicleId, err)
		return fmt.Errorf("save state failed: %w", err)
	}

	logx.Debugf("状态记录保存成功 vehicle=%s ts=%d", state.VehicleId, state.Timestamp)
	return nil
}
