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

func (l *GetRouteInfoLogic) GetRouteInfo(routeId string) (resp *types.RouteInfoResp, err error) {
	// 1. 校验 routeId
	// 2. 调用 DAO 查询
	// 3. 将结果直接返回

	resp = &types.RouteInfoResp{}
	if routeId == "" {
		return nil, nil
	}

	r, err := dao.GetRouteByID(l.svcCtx.DB, routeId)
	if err != nil {
		if err == sql.ErrNoRows {
			// 未找到，返回 nil 响应（handler 层可决定如何返回）
			return nil, nil
		}
		l.Logger.Errorf("GetRouteByID error: %v", err)
		return nil, fmt.Errorf("查询路线失败: %w", err)
	}

	return r, nil
}
