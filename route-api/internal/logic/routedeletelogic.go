package logic

import (
	"context"
	"database/sql"
	"fmt"

	"route-api/internal/dao"
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
	resp = &types.BaseResp{}
	if req == nil || req.RouteId == "" {
		resp.Code = 1
		resp.Msg = "routeId 不能为空"
		return resp, nil
	}

	err = dao.DeleteRoute(l.svcCtx.DB, req.RouteId)
	if err != nil {
		if err == sql.ErrNoRows {
			resp.Code = 1
			resp.Msg = fmt.Sprintf("route_id=%s 未找到", req.RouteId)
			return resp, nil
		}
		l.Logger.Errorf("DeleteRoute error: %v", err)
		resp.Code = 1
		resp.Msg = err.Error()
		return resp, nil
	}

	resp.Code = 0
	resp.Msg = "ok"
	return resp, nil
}
