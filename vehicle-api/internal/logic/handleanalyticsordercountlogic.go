package logic

import (
	"context"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleAnalyticsOrderCountLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleAnalyticsOrderCountLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleAnalyticsOrderCountLogic {
	return &HandleAnalyticsOrderCountLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *HandleAnalyticsOrderCountLogic) HandleAnalyticsOrderCount(req *types.AnalyticsReq) (resp *types.TimeSeries, err error) {
	// todo: add your logic here and delete this line

	return
}
