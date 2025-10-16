package logic

import (
	"context"

	"route-api/internal/svc"
	"route-api/internal/types"

	"net/http"
	"route-api/internal/dao"

	"github.com/zeromicro/go-zero/core/logx"
)

type RouteCreateLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewRouteCreateLogic(ctx context.Context, svcCtx *svc.ServiceContext) *RouteCreateLogic {
	return &RouteCreateLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *RouteCreateLogic) RouteCreate(req *types.RouteCreateInfo) (resp *types.BaseResp, err error) {
	resp = &types.BaseResp{Code: 0, Msg: "ok"}

	// 简单的参数校验：起点和终点必填
	if req == nil || req.StartStation == "" || req.EndStation == "" {
		resp.Code = http.StatusBadRequest
		resp.Msg = "startStation 和 endStation 为必填项"
		return resp, nil
	}

	// 调用 DAO 插入数据库
	svcCtx := l.svcCtx
	if svcCtx == nil || svcCtx.DB == nil {
		resp.Code = http.StatusInternalServerError
		resp.Msg = "数据库未初始化"
		logx.Error("service context or db is nil")
		return resp, nil
	}

	routeId, err := dao.CreateRoute(svcCtx.DB, req)
	if err != nil {
		logx.Errorf("创建路线失败: %v", err)
		resp.Code = http.StatusInternalServerError
		resp.Msg = "创建路线失败"
		return resp, nil
	}

	resp.Code = 0
	resp.Msg = routeId
	return resp, nil
}
