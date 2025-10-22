package logic

import (
	"context"
	"time"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleCreateVehicleLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleCreateVehicleLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleCreateVehicleLogic {
	return &HandleCreateVehicleLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// HandleCreateVehicle 创建车辆静态信息
func (l *HandleCreateVehicleLogic) HandleCreateVehicle(req *types.CreateVehicleReq) error {
	if l.svcCtx.MySQLDao == nil {
		return nil
	}
	// 直接将 extra 字段透传为纯文本备注（保持原样）
	// 车辆编号 vehicleId 将由服务端自动生成，格式：VEH + yyyyMMdd + 4 位随机字母数字
	// 状态 status 默认置为 “空闲"
	extra := req.Extra
	// 生成 vehicleId
	vid := generateVehicleId()
	// 默认状态
	status := "空闲"
	return l.svcCtx.MySQLDao.InsertVehicle(vid, req.PlateNumber, req.Type, req.TotalCapacity, req.BatteryInfo, req.RouteId, status, extra)
}

// generateVehicleId 生成车辆编号，格式示例：VEH202510210aZ8
func generateVehicleId() string {
	// 使用当前日期 + 随机 4 位字母数字
	now := time.Now()
	date := now.Format("20060102")
	const letters = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
	b := make([]byte, 4)
	// 基于时间戳的简单伪随机
	seed := now.UnixNano()
	for i := 0; i < 4; i++ {
		idx := int(seed % int64(len(letters)))
		b[i] = letters[idx]
		seed = seed/7 + int64(i)*13 + 17
	}
	return "VEH" + date + string(b)
}
