package logic

import (
	"context"

	"route-api/internal/svc"
	"route-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type RouteDeleteLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewRouteDeleteLogic(ctx context.Context, svcCtx *svc.ServiceContext) *RouteDeleteLogic {
	return &RouteDeleteLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *RouteDeleteLogic) RouteDelete(req *types.RouteDeleteReq) (resp *types.BaseResp, err error) {
	// todo: add your logic here and delete this line

	return
}
