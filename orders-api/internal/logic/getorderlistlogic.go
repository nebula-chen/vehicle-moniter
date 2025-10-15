package logic

import (
	"context"
	"fmt"

	"orders-api/internal/svc"
	"orders-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

// 辅助函数：安全地将 interface{} 转为 string
func toStrSafe(v interface{}) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case []byte:
		return string(t)
	default:
		return fmt.Sprint(t)
	}
}

// 辅助函数：安全地将 interface{} 转为 int
func toIntSafe(v interface{}) int {
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
	case string:
		var i int
		_, err := fmt.Sscanf(t, "%d", &i)
		if err == nil {
			return i
		}
		return 0
	default:
		return 0
	}
}

type GetOrderListLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetOrderListLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetOrderListLogic {
	return &GetOrderListLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetOrderListLogic) GetOrderList(req *types.OrderListReq) (resp *types.OrderListResp, err error) {
	resp = &types.OrderListResp{OrdersList: []types.OrderInfoResp{}, Total: 0}

	// 构建 filters
	filters := map[string]string{}
	if req != nil {
		if req.Status != "" {
			filters["status"] = req.Status
		}
		if req.StartTime != "" {
			filters["startTime"] = req.StartTime
		}
		if req.EndTime != "" {
			filters["endTime"] = req.EndTime
		}
		if req.StationId != "" {
			filters["stationId"] = req.StationId
		}
		if req.VehicleId != "" {
			filters["vehicleId"] = req.VehicleId
		}
		if req.RouteId != "" {
			filters["routeId"] = req.RouteId
		}
		if req.GridMemberId != "" {
			filters["gridMemberId"] = req.GridMemberId
		}
	}

	rows, err := l.svcCtx.Order.ListOrders(filters)
	if err != nil {
		l.Logger.Errorf("ListOrders error: %v", err)
		return resp, nil
	}

	for _, r := range rows {
		oi := types.OrderInfoResp{
			OrderId:        toStrSafe(r["orderId"]),
			Type:           toStrSafe(r["type"]),
			Weight:         toIntSafe(r["weight"]),
			Sender:         toStrSafe(r["sender"]),
			SenderPhone:    toStrSafe(r["senderPhone"]),
			SenderAddress:  toStrSafe(r["senderAddress"]),
			Addressee:      toStrSafe(r["addressee"]),
			AddresseePhone: toStrSafe(r["addresseePhone"]),
			Address:        toStrSafe(r["address"]),
			StartTime:      toStrSafe(r["startTime"]),
			EndTime:        toStrSafe(r["endTime"]),
			Status:         toStrSafe(r["status"]),
			Note:           toStrSafe(r["note"]),
		}
		if ps, ok := r["passStations"].([]string); ok {
			oi.PassStations = ps
		}
		if pv, ok := r["passVehicle"].([]string); ok {
			oi.PassVehicle = pv
		}
		if pr, ok := r["passRoute"].([]string); ok {
			oi.PassRoute = pr
		}
		if pg, ok := r["passGridMember"].([]string); ok {
			oi.PassGridMember = pg
		}
		resp.OrdersList = append(resp.OrdersList, oi)
	}
	resp.Total = len(resp.OrdersList)
	return resp, nil
}
