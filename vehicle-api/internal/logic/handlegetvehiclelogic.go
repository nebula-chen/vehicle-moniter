package logic

import (
	"context"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleGetVehicleLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleGetVehicleLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleGetVehicleLogic {
	return &HandleGetVehicleLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *HandleGetVehicleLogic) HandleGetVehicle(vehicleId string) (*types.VehicleDetailResp, error) {
	if l.svcCtx.MySQLDao == nil {
		return nil, nil
	}
	m, err := l.svcCtx.MySQLDao.GetVehicleByID(vehicleId)
	if err != nil {
		return nil, err
	}
	vi := types.VehicleInfo{
		VehicleId:         m.VehicleId,
		PlateNo:           m.PlateNo,
		CategoryCode:      m.CategoryCode,
		CategoryName:      m.CategoryName,
		VinCode:           m.VinCode,
		VehicleFactory:    m.VehicleFactory,
		Brand:             m.Brand,
		Size:              m.Size,
		AutoLevel:         m.AutoLevel,
		VehicleCert:       m.VehicleCert,
		VehicleInspection: m.VehicleInspection,
		VehicleInvoice:    m.VehicleInvoice,
		OilConsumption:    m.OilConsumption,
		CreateTime:        m.CreateTime,
		CertNo:            m.CertNo,
	}

	return &types.VehicleDetailResp{Vehicle: vi}, nil
}
