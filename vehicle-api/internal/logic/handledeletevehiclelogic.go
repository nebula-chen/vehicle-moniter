package logic

import (
	"context"

	"vehicle-api/internal/svc"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleDeleteVehicleLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleDeleteVehicleLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleDeleteVehicleLogic {
	return &HandleDeleteVehicleLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *HandleDeleteVehicleLogic) HandleDeleteVehicle(vehicleId string) error {
	if l.svcCtx.MySQLDao == nil {
		return nil
	}
	return l.svcCtx.MySQLDao.DeleteVehicle(vehicleId)
}
