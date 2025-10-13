package logic

import (
	"context"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleCreateVehicleLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleCreateVehicleLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleCreateVehicleLogic {
	return &HandleCreateVehicleLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// HandleCreateVehicle 创建车辆静态信息
func (l *HandleCreateVehicleLogic) HandleCreateVehicle(req *types.CreateVehicleReq) error {
	if l.svcCtx.MySQLDao == nil {
		return nil
	}
	// 直接将 extra 字段透传为 JSON 字符串（保持原样）
	extra := req.Extra
	return l.svcCtx.MySQLDao.InsertVehicle(req.VehicleId, req.PlateNumber, req.Type, req.TotalCapacity, req.BatteryInfo, req.RouteId, req.Status, extra)
}
