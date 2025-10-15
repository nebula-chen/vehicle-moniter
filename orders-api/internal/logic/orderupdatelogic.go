package logic

import (
	"context"

	"orders-api/internal/svc"
	"orders-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type OrderUpdateLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewOrderUpdateLogic(ctx context.Context, svcCtx *svc.ServiceContext) *OrderUpdateLogic {
	return &OrderUpdateLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *OrderUpdateLogic) OrderUpdate(req *types.OrderUpdateReq) (resp *types.BaseResp, err error) {
	resp = &types.BaseResp{Code: 0, Msg: "ok"}

	if req == nil || req.OrderId == "" {
		resp.Code = 1
		resp.Msg = "请求参数缺失 orderId"
		return resp, nil
	}

	updates := map[string]interface{}{}
	if req.Status != "" {
		updates["status"] = req.Status
	}
	if req.EndTime != "" {
		updates["endTime"] = req.EndTime
	}
	if req.PassStations != nil {
		updates["passStations"] = req.PassStations
	}
	if req.PassVehicle != nil {
		updates["passVehicle"] = req.PassVehicle
	}
	if req.PassRoute != nil {
		updates["passRoute"] = req.PassRoute
	}
	if req.PassGridMember != nil {
		updates["passGridMember"] = req.PassGridMember
	}
	if req.Note != "" {
		updates["note"] = req.Note
	}

	if len(updates) == 0 {
		resp.Code = 0
		resp.Msg = "无更新字段"
		return resp, nil
	}

	rows, err := l.svcCtx.Order.UpdateOrder(req.OrderId, updates)
	if err != nil {
		l.Logger.Errorf("UpdateOrder error: %v", err)
		resp.Code = 2
		resp.Msg = "更新失败"
		return resp, nil
	}
	if rows == 0 {
		resp.Code = 3
		resp.Msg = "未找到对应订单"
		return resp, nil
	}

	resp.Code = 0
	resp.Msg = "更新成功"
	return resp, nil
}
