package logic

import (
	"context"
	"fmt"
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

// HandleCreateVehicle 内部自动化程序：从外部API拉取车辆信息，进行MySQL匹配，持久化到MySQL
// 该方法已改为内部自动化程序，不再对外开放HTTP接口
func (l *HandleCreateVehicleLogic) HandleCreateVehicle(req *types.CreateVehicleReq) error {
	l.Infof("========== 开始车辆同步程序 ==========")
	l.Infof("程序启动时间: %v", time.Now().Format("2006-01-02 15:04:05"))

	// 检查依赖
	l.Debugf("检查服务依赖...")
	if l.svcCtx.MySQLDao == nil {
		l.Errorf("❌ MySQL DAO 未初始化")
		return fmt.Errorf("MySQL DAO not initialized")
	}
	l.Debugf("✓ MySQL DAO 初始化成功")

	if l.svcCtx.VEHInfoClient == nil {
		l.Errorf("❌ 车辆信息API客户端未初始化")
		return fmt.Errorf("Vehicle API client not initialized")
	}
	l.Debugf("✓ 车辆信息API客户端已就绪")

	// 从外部API拉取车辆信息
	l.Infof("========== 开始从外部API拉取车辆信息 ==========")
	l.Infof("准备调用车辆信息API (categoryCode=nil)...")

	vehicles, err := l.svcCtx.VEHInfoClient.GetAllVehicles(nil)
	if err != nil {
		l.Errorf("❌ 从API拉取车辆信息失败: %v", err)
		return err
	}

	l.Infof("✓ 成功从API拉取车辆信息，共 %d 辆车", len(vehicles))
	if len(vehicles) == 0 {
		l.Infof("⚠ 警告: API返回的车辆列表为空")
	}

	// 打印车辆列表摘要（用于测试验证）
	for i, v := range vehicles {
		l.Debugf("  [%d] vehicleId=%s, plateNo=%s, categoryCode=%v, brand=%s",
			i+1, v.VehicleId, v.PlateNo, v.CategoryCode, v.Brand)
	}

	// 遍历车辆列表，进行MySQL匹配和持久化
	l.Infof("========== 开始持久化车辆到MySQL ==========")
	l.Infof("准备处理 %d 辆车的持久化操作...", len(vehicles))

	successCount := 0
	failCount := 0

	for i, vehicle := range vehicles {
		l.Debugf("[%d/%d] 正在处理车辆: vehicleId=%s, plateNo=%s", i+1, len(vehicles), vehicle.VehicleId, vehicle.PlateNo)
		if err := l.svcCtx.MySQLDao.InsertOrUpdateVehicleFromAPI(&vehicle); err != nil {
			l.Errorf("  ❌ 车辆持久化失败 [索引:%d, vehicleId:%s]: %v", i, vehicle.VehicleId, err)
			failCount++
		} else {
			l.Infof("  ✓ 车辆持久化成功: vehicleId=%s, plateNo=%s", vehicle.VehicleId, vehicle.PlateNo)
			successCount++
		}
	}

	// 输出同步结果摘要
	l.Infof("========== 车辆同步完成 ==========")
	l.Infof("总计处理车辆数: %d", len(vehicles))
	l.Infof("成功持久化: %d ✓", successCount)
	l.Infof("持久化失败: %d ❌", failCount)
	l.Infof("成功率: %.2f%%", float64(successCount)/float64(len(vehicles))*100)
	l.Infof("程序结束时间: %v", time.Now().Format("2006-01-02 15:04:05"))

	if failCount > 0 {
		l.Infof("⚠ 同步过程中出现 %d 个失败，请检查日志", failCount)
		return fmt.Errorf("vehicle synchronization completed with %d failures", failCount)
	}

	l.Infof("========== 车辆同步成功完成 ==========")
	return nil
}
