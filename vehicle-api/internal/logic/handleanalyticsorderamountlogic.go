package logic

import (
	"context"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleAnalyticsOrderAmountLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleAnalyticsOrderAmountLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleAnalyticsOrderAmountLogic {
	return &HandleAnalyticsOrderAmountLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *HandleAnalyticsOrderAmountLogic) HandleAnalyticsOrderAmount(req *types.AnalyticsReq) (resp *types.TimeSeries, err error) {
	// todo: add your logic here and delete this line

	return
}
