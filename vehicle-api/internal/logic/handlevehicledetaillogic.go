package logic

import (
	"context"
	"time"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleVehicleDetailLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleVehicleDetailLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleVehicleDetailLogic {
	return &HandleVehicleDetailLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// HandleVehicleDetail 返回车辆的最新状态和简要信息
func (l *HandleVehicleDetailLogic) HandleVehicleDetail(vehicleId string) (*types.VehicleInfo, error) {
	s, err := l.svcCtx.Dao.QueryLatestStatus(vehicleId)
	if err != nil {
		return nil, err
	}
	vi := &types.VehicleInfo{
		Id:        s.VehicleId,
		Type:      "unknown",
		Capacity:  "-",
		Battery:   "-",
		Speed:     "-",
		Lng:       int64(s.Position.Longitude),
		Lat:       int64(s.Position.Latitude),
		Status:    "unknown",
		Route:     "-",
		UpdatedAt: time.UnixMilli(int64(s.TimestampGNSS)).UTC().Format(time.RFC3339),
	}
	if s.Velocity > 0 || s.VelocityGNSS > 0 {
		vi.Status = "in_transit"
	} else {
		vi.Status = "idle"
	}
	return vi, nil
}
