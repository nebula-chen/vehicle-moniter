package logic

import (
	"context"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleVehiclesListLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleVehiclesListLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleVehiclesListLogic {
	return &HandleVehiclesListLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *HandleVehiclesListLogic) HandleVehiclesList() (*types.VehicleListResp, error) {
	// 查询所有车辆的最新状态并组装为 VehicleListResp
	states, err := l.svcCtx.Dao.QueryAllVehiclesLatest()
	if err != nil {
		return nil, err
	}
	resp := &types.VehicleListResp{Vehicles: make([]types.VehicleInfo, 0, len(states))}
	for _, s := range states {
		vi := types.VehicleInfo{
			Id:        s.VehicleId,
			Type:      "unknown",
			Capacity:  "-",
			Battery:   "-",
			Speed:     "-",
			Lng:       int64(s.Position.Longitude),
			Lat:       int64(s.Position.Latitude),
			Status:    "unknown",
			Route:     "-",
			UpdatedAt: "",
		}
		// derive status
		if s.Velocity > 0 || s.VelocityGNSS > 0 {
			vi.Status = "in_transit"
		} else {
			vi.Status = "idle"
		}
		resp.Vehicles = append(resp.Vehicles, vi)
	}
	return resp, nil
}
