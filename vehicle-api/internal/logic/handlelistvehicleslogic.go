package logic

import (
	"context"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleListVehiclesLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleListVehiclesLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleListVehiclesLogic {
	return &HandleListVehiclesLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *HandleListVehiclesLogic) HandleListVehicles() (*types.VehicleListResp, error) {
	if l.svcCtx.MySQLDao == nil {
		return &types.VehicleListResp{Vehicles: []types.VehicleInfo{}}, nil
	}
	rows, err := l.svcCtx.MySQLDao.ListVehicles()
	if err != nil {
		return nil, err
	}
	resp := &types.VehicleListResp{Vehicles: make([]types.VehicleInfo, 0, len(rows))}
	for _, r := range rows {
		vi := types.VehicleInfo{
			Id:            r["vehicleId"].(string),
			PlateNumber:   r["plateNumber"].(string),
			Type:          r["type"].(string),
			TotalCapacity: r["totalCapacity"].(string),
			Battery:       r["batteryInfo"].(string),
			Speed:         "-",
			Lng:           0,
			Lat:           0,
			Status:        r["status"].(string),
			Route:         r["routeId"].(string),
			CreatedAt:     r["createdAt"].(string),
			UpdatedAt:     r["updatedAt"].(string),
		}
		resp.Vehicles = append(resp.Vehicles, vi)
	}
	return resp, nil
}
