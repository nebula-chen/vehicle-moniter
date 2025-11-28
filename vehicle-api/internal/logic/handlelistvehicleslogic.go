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
	for _, m := range rows {
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
		resp.Vehicles = append(resp.Vehicles, vi)
	}
	return resp, nil
}
