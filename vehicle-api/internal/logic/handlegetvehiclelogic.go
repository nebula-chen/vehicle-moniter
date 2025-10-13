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
		Id:            m["vehicleId"].(string),
		PlateNumber:   m["plateNumber"].(string),
		Type:          m["type"].(string),
		TotalCapacity: m["totalCapacity"].(string),
		Battery:       m["batteryInfo"].(string),
		Route:         m["routeId"].(string),
		Speed:         "-",
		Lng:           0,
		Lat:           0,
		Status:        m["status"].(string),
		CreatedAt:     m["createdAt"].(string),
		UpdatedAt:     m["updatedAt"].(string),
	}
	extraMap := make(map[string]string)
	if extra, ok := m["extra"].(string); ok && extra != "" {
		extraMap["raw"] = extra
	}
	return &types.VehicleDetailResp{Vehicle: vi, Extra: extraMap}, nil
}
