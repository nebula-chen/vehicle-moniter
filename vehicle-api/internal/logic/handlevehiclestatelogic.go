package logic

import (
	"context"
	"sync"
	"time"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleVehicleStateLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleVehicleStateLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleVehicleStateLogic {
	return &HandleVehicleStateLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// GetVehicleState 从车辆状态服务获取指定车辆的实时状态
func (l *HandleVehicleStateLogic) GetVehicleState(req *types.VehicleStateReq) (*types.VehicleStateResp, error) {
	if l.svcCtx.VEHStateClient == nil {
		l.Errorf("VEHState client not initialized")
		return &types.VehicleStateResp{
			Code:    -1,
			Message: "VEHState client not available",
		}, nil
	}

	// 创建响应通道和锁用于获取响应
	respChan := make(chan *types.VehicleStateResp, 1)
	mu := &sync.Mutex{}
	var responseReceived bool

	// 暂时替换消息处理回调以捕获响应
	originalCallback := l.svcCtx.VEHStateClient.OnMessage
	l.svcCtx.VEHStateClient.OnMessage = func(resp *types.VehicleStateResp) error {
		mu.Lock()
		defer mu.Unlock()

		// 检查是否是对当前请求的响应
		if !responseReceived && resp != nil && (resp.Data.VehicleId == req.VehicleId || req.VehicleId == "") {
			responseReceived = true
			select {
			case respChan <- resp:
			default:
			}
		}

		// 恢复原始回调
		if originalCallback != nil {
			return originalCallback(resp)
		}
		return nil
	}

	// 发送请求
	if err := l.svcCtx.VEHStateClient.SendRequest(req); err != nil {
		l.Errorf("Failed to send request: %v", err)
		// 恢复原始回调
		l.svcCtx.VEHStateClient.OnMessage = originalCallback
		return &types.VehicleStateResp{
			Code:    -1,
			Message: err.Error(),
		}, nil
	}

	// 等待响应，设置超时为10秒
	select {
	case resp := <-respChan:
		// 恢复原始回调
		l.svcCtx.VEHStateClient.OnMessage = originalCallback
		return resp, nil
	case <-l.ctx.Done():
		l.Errorf("Request cancelled")
		l.svcCtx.VEHStateClient.OnMessage = originalCallback
		return &types.VehicleStateResp{
			Code:    -1,
			Message: "Request cancelled",
		}, nil
	case <-time.After(10 * time.Second):
		l.Errorf("Request timeout")
		l.svcCtx.VEHStateClient.OnMessage = originalCallback
		return &types.VehicleStateResp{
			Code:    -1,
			Message: "Request timeout",
		}, nil
	}
}
