package logic

import (
	"context"

	"route-api/internal/svc"
	"route-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetRouteInfoLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetRouteInfoLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetRouteInfoLogic {
	return &GetRouteInfoLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetRouteInfoLogic) GetRouteInfo() (resp *types.RouteInfoResp, err error) {
	// todo: add your logic here and delete this line

	return
}
