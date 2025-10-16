package logic

import (
	"context"
	"fmt"

	"route-api/internal/dao"
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
	// 1. 调用 DAO 层进行查询
	// 2. 将查询结果封装为 types.RouteListResp

	resp = &types.RouteListResp{}
	list, err := dao.ListRoutes(l.svcCtx.DB, req)
	if err != nil {
		l.Logger.Errorf("ListRoutes error: %v", err)
		return nil, fmt.Errorf("查询路线列表失败: %w", err)
	}

	resp.RouteList = list
	return resp, nil
}
