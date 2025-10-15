package logic

import (
	"context"

	"orders-api/internal/svc"
	"orders-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type OrderDeleteLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewOrderDeleteLogic(ctx context.Context, svcCtx *svc.ServiceContext) *OrderDeleteLogic {
	return &OrderDeleteLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *OrderDeleteLogic) OrderDelete(req *types.OrderDeleteReq) (resp *types.BaseResp, err error) {
	resp = &types.BaseResp{Code: 0, Msg: "ok"}
	if req == nil || req.OrderId == "" {
		resp.Code = 1
		resp.Msg = "请求参数缺失 orderId"
		return resp, nil
	}

	rows, err := l.svcCtx.Order.DeleteOrder(req.OrderId)
	if err != nil {
		l.Logger.Errorf("DeleteOrder error: %v", err)
		resp.Code = 2
		resp.Msg = "删除失败"
		return resp, nil
	}
	if rows == 0 {
		resp.Code = 3
		resp.Msg = "未找到对应订单"
		return resp, nil
	}
	resp.Code = 0
	resp.Msg = "删除成功"
	return resp, nil
}
