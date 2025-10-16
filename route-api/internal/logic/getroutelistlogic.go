package logic

import (
	"context"

	"route-api/internal/svc"
	"route-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetRouteListLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetRouteListLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetRouteListLogic {
	return &GetRouteListLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetRouteListLogic) GetRouteList(req *types.RouteListReq) (resp *types.RouteListResp, err error) {
	// todo: add your logic here and delete this line

	return
}
