package logic

import (
	"context"

	"route-api/internal/svc"
	"route-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type RouteUpdateLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewRouteUpdateLogic(ctx context.Context, svcCtx *svc.ServiceContext) *RouteUpdateLogic {
	return &RouteUpdateLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *RouteUpdateLogic) RouteUpdate(req *types.RouteUpdateReq) (resp *types.BaseResp, err error) {
	// todo: add your logic here and delete this line

	return
}
