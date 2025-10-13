package logic

import (
	"context"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleUpdateVehicleLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleUpdateVehicleLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleUpdateVehicleLogic {
	return &HandleUpdateVehicleLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *HandleUpdateVehicleLogic) HandleUpdateVehicle(req *types.UpdateVehicleReq) error {
	if l.svcCtx.MySQLDao == nil {
		return nil
	}
	if req == nil || req.VehicleId == "" {
		return nil
	}
	cols := make(map[string]interface{})
	if req.PlateNumber != nil {
		// 允许更新为空字符串的场景由调用方决定；这里如果传空字符串也会写入
		cols["plate_number"] = *req.PlateNumber
	}
	if req.Type != nil {
		cols["type"] = *req.Type
	}
	if req.TotalCapacity != nil {
		cols["total_capacity"] = *req.TotalCapacity
	}
	if req.BatteryInfo != nil {
		cols["battery_info"] = *req.BatteryInfo
	}
	if req.RouteId != nil {
		cols["route_id"] = *req.RouteId
	}
	if req.Status != nil {
		cols["status"] = *req.Status
	}
	if req.Extra != nil {
		cols["extra"] = *req.Extra
	}
	if len(cols) == 0 {
		// nothing to update
		return nil
	}
	return l.svcCtx.MySQLDao.UpdateVehiclePartial(req.VehicleId, cols)
}
