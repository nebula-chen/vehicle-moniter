package logic

import (
	"context"
	"time"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleVehicleStatusLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleVehicleStatusLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleVehicleStatusLogic {
	return &HandleVehicleStatusLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *HandleVehicleStatusLogic) HandleVehicleStatus(req *types.VEH2CLOUD_STATE) (resp *types.VehicleStatusResp, err error) {
	// 简单实现：记录日志并更新在线车辆列表（使用新的字段名）
	l.Logger.Infof("recv vehicle status vehicleId=%s messageId=%x velocity=%v lon=%d lat=%d", req.VehicleId, req.MessageId, req.Velocity, req.Position.Longitude, req.Position.Latitude)

	// 标记为在线
	if l.svcCtx != nil {
		l.svcCtx.OnlineDrones.Store(req.VehicleId, time.Now())
	}

	resp = &types.VehicleStatusResp{
		Code:     "0",
		ErrorMsg: false,
	}
	return resp, nil
}
