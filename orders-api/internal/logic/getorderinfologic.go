package logic

import (
	"context"
	"fmt"

	"orders-api/internal/svc"
	"orders-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetOrderInfoLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetOrderInfoLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetOrderInfoLogic {
	return &GetOrderInfoLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetOrderInfoLogic) GetOrderInfo(orderId string) (resp *types.OrderInfoResp, err error) {
	resp = &types.OrderInfoResp{}
	if orderId == "" {
		return nil, nil
	}

	m, err := l.svcCtx.Order.GetOrderByID(orderId)
	if err != nil {
		l.Logger.Errorf("GetOrderByID error: %v", err)
		return nil, err
	}

	// 转换 map 到 types.OrderInfo
	resp.OrderId = toStr(m["orderId"])
	resp.Type = toStr(m["type"])
	resp.Weight = toIntFromInterface(m["weight"])
	resp.Sender = toStr(m["sender"])
	resp.SenderPhone = toStr(m["senderPhone"])
	resp.SenderAddress = toStr(m["senderAddress"])
	resp.Addressee = toStr(m["addressee"])
	resp.AddresseePhone = toStr(m["addresseePhone"])
	resp.Address = toStr(m["address"])
	resp.StartTime = toStr(m["startTime"])
	resp.EndTime = toStr(m["endTime"])
	resp.Status = toStr(m["status"])
	resp.Note = toStr(m["note"])

	if ps, ok := m["passStations"].([]string); ok {
		resp.PassStations = ps
	}
	if pv, ok := m["passVehicle"].([]string); ok {
		resp.PassVehicle = pv
	}
	if pr, ok := m["passRoute"].([]string); ok {
		resp.PassRoute = pr
	}
	if pg, ok := m["passGridMember"].([]string); ok {
		resp.PassGridMember = pg
	}

	return resp, nil
}

// 辅助转换函数
func toStr(v interface{}) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	default:
		return fmt.Sprint(t)
	}
}

func toIntFromInterface(v interface{}) int {
	if v == nil {
		return 0
	}
	switch t := v.(type) {
	case int:
		return t
	case int32:
		return int(t)
	case int64:
		return int(t)
	case float64:
		return int(t)
	default:
		return 0
	}
}
