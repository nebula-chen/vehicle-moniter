package processor

import (
	"fmt"
	"vehicle-api/internal/dao"
	"vehicle-api/internal/types"
)

// Processor 负责处理来自设备的状态并将其持久化到数据库
type Processor interface {
	ProcessState(state *types.VEH2CLOUD_STATE) error
}

// DefaultProcessor 默认实现，使用 MySQLDao 进行写入
type DefaultProcessor struct {
	MySQL *dao.MySQLDao
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

	// NOTE: 已移除 vehicle_positions 与 vehicle_tasks 的写入逻辑和内存任务追踪。
	// 为了避免误写入数据库，当前 Processor 只保留必要的校验，具体的持久化请通过 ServiceContext 的 Dao 或其他明确的路径实现。

	return nil
}
