package logic

import (
	"context"

	"route-api/internal/svc"
	"route-api/internal/types"

	"database/sql"
	"fmt"
	"route-api/internal/dao"

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
	// 1. 校验入参必须包含 routeId
	// 2. 调用 DAO 层更新数据库
	// 3. 根据 DAO 返回结果构造 BaseResp

	resp = &types.BaseResp{}

	if req == nil || req.RouteId == "" {
		resp.Code = 1
		resp.Msg = "routeId 不能为空"
		return resp, nil
	}

	// 调用 DAO 更新
	err = dao.UpdateRoute(l.svcCtx.DB, req)
	if err != nil {
		if err == dao.ErrNoUpdate {
			// 请求中没有任何字段需要更新 —— 不是错误，返回特定成功信息
			resp.Code = 0
			resp.Msg = "no fields updated"
			return resp, nil
		}
		if err == sql.ErrNoRows {
			// 未找到对应记录
			resp.Code = 1
			resp.Msg = fmt.Sprintf("route_id=%s 未找到", req.RouteId)
			return resp, nil
		}
		// 其他错误，如数据库错误
		l.Logger.Errorf("更新路线失败: %v", err)
		resp.Code = 1
		resp.Msg = err.Error()
		return resp, nil
	}

	// 成功
	resp.Code = 0
	resp.Msg = "ok"
	return resp, nil
}
