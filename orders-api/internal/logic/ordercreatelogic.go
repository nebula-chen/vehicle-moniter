package logic

import (
	"context"
	"fmt"
	"time"

	mysqldriver "github.com/go-sql-driver/mysql"

	"orders-api/internal/svc"
	"orders-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type OrderCreateLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewOrderCreateLogic(ctx context.Context, svcCtx *svc.ServiceContext) *OrderCreateLogic {
	return &OrderCreateLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *OrderCreateLogic) OrderCreate(req *types.OrderCreateInfo) (resp *types.BaseResp, err error) {
	resp = &types.BaseResp{Code: 0, Msg: "ok"}

	if req == nil {
		resp.Code = 1
		resp.Msg = "请求体为空"
		return resp, nil
	}

	// 生成12位时间戳（YYYYMMDDHHMM）和8位随机码（数字或字母）
	timestamp := time.Now().Format("200601021504")
	const letters = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
	b := make([]byte, 8)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
		time.Sleep(time.Nanosecond) // 保证每次取值不同
	}
	randomCode := string(b)
	orderId := fmt.Sprintf("%s-%s", timestamp, randomCode)

	// 注意：不再主动写入 startTime 字段（使用数据库的 created_at 作为订单创建时间）

	// 将 req 转为 map[string]interface{} 以便 DAO 序列化复杂字段
	raw := map[string]interface{}{
		"type":           req.Type,
		"weight":         req.Weight,
		"sender":         req.Sender,
		"senderPhone":    req.SenderPhone,
		"senderAddress":  req.SenderAddress,
		"addressee":      req.Addressee,
		"addresseePhone": req.AddresseePhone,
		"address":        req.Address,
		// 使用数据库的 created_at 作为持久化的创建时间，不在这里写入 startTime 字段
		"endTime":        nil,   // 新建订单无结束时间
		"status":         "配送中", // 新建订单默认状态为 配送中
		"passStations":   req.PassStations,
		"passVehicle":    req.PassVehicle,
		"passRoute":      req.PassRoute,
		"passGridMember": req.PassGridMember,
		"note":           req.Note,
	}

	// 为防止重复 orderId，若插入返回 MySQL duplicate 错误（1062），则重试生成新的 orderId
	const maxRetry = 5
	var lastErr error
	for i := 0; i < maxRetry; i++ {
		if i > 0 {
			// 重新生成随机码段（保证与上次不同）
			b := make([]byte, 8)
			for j := range b {
				b[j] = letters[time.Now().UnixNano()%int64(len(letters))]
				time.Sleep(time.Nanosecond)
			}
			randomCode = string(b)
			orderId = fmt.Sprintf("%s-%s", timestamp, randomCode)
		}

		lastErr = l.svcCtx.Order.InsertOrder(orderId, raw)
		if lastErr == nil {
			break
		}

		// 检查是否为 MySQL duplicate entry 错误
		if driverErr, ok := lastErr.(*mysqldriver.MySQLError); ok {
			if driverErr.Number == 1062 {
				l.Logger.Infof("orderId 冲突，重试(%d/%d): %s", i+1, maxRetry, orderId)
				continue
			}
		}
		// 其它错误直接退出重试
		l.Logger.Errorf("insert order failed: %v", lastErr)
		break
	}

	if lastErr != nil {
		resp.Code = 2
		resp.Msg = "写入数据库失败"
		return resp, nil
	}

	resp.Code = 0
	resp.Msg = "创建成功"
	return resp, nil
}
