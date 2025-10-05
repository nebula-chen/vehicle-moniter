package logic

import (
	"context"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleVehiclesSummaryLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleVehiclesSummaryLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleVehiclesSummaryLogic {
	return &HandleVehiclesSummaryLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// HandleVehiclesSummary 通过统计每辆车的最新状态返回简要汇总
func (l *HandleVehiclesSummaryLogic) HandleVehiclesSummary() (*types.VehicleSummaryResp, error) {
	// 查询每辆车的最近最新状态
	list, err := l.svcCtx.Dao.QueryAllVehiclesLatest()
	if err != nil {
		return nil, err
	}
	resp := &types.VehicleSummaryResp{}
	resp.Total = len(list)
	for _, s := range list {
		// determine status roughly by DriveMode or other flags
		// DriveMode: 2 single auto, 4 cloud auto, etc. For now use simple heuristics
		if s.Velocity > 0 || s.VelocityGNSS > 0 {
			resp.InTransit++
		} else {
			resp.Idle++
		}
		// placeholder: charging and abnormal not derivable reliably here
	}
	return resp, nil
}
