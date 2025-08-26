package logic

import (
	"context"
	"time"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleGetTrajectoryLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleGetTrajectoryLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleGetTrajectoryLogic {
	return &HandleGetTrajectoryLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *HandleGetTrajectoryLogic) HandleGetTrajectory(req *types.TrajectoryReq) (resp *types.TrajectoryResp, err error) {
	// validate and convert times
	start := time.UnixMilli(req.StartMs)
	end := time.UnixMilli(req.EndMs)

	pts, err := l.svcCtx.Dao.QueryPositions(req.VehicleId, start, end)
	if err != nil {
		return nil, err
	}

	return &types.TrajectoryResp{Trajectory: pts}, nil
}
