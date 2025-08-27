package logic

import (
	"context"
	"errors"
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
	// validate required fields
	if req.StartUtc == "" || req.EndUtc == "" {
		return nil, errors.New("startUtc and endUtc are required and must be RFC3339 UTC timestamps, e.g. 2006-01-02T15:04:05Z")
	}

	// parse RFC3339 UTC times from request
	start, err := time.Parse(time.RFC3339, req.StartUtc)
	if err != nil {
		return nil, err
	}
	end, err := time.Parse(time.RFC3339, req.EndUtc)
	if err != nil {
		return nil, err
	}

	pts, err := l.svcCtx.Dao.QueryPositions(req.VehicleId, start, end)
	if err != nil {
		return nil, err
	}

	// pts returned from DAO already have RFC3339 UTC timestamp strings
	return &types.TrajectoryResp{Trajectory: pts}, nil
}
