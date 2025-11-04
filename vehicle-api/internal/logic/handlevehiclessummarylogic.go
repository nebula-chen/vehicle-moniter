package logic

import (
	"context"
	"strings"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleVehiclesSummaryLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleVehiclesSummaryLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleVehiclesSummaryLogic {
	return &HandleVehiclesSummaryLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// HandleVehiclesSummary 通过统计每辆车的最新状态返回简要汇总
func (l *HandleVehiclesSummaryLogic) HandleVehiclesSummary() (*types.VehicleSummaryResp, error) {
	// 本方法应结合静态车辆列表（MySQL）与时序数据（Influx）来产生汇总。
	// 场景：有些车辆存在于静态表但短期内未上报时序数据（因此不会出现在 Influx 的查询结果中），
	// 我们仍然希望统计中包含这些车辆（通常视为 idle/空闲）。

	// 1) 查询 Influx 中最近的各车状态（仅包含有上报数据的车辆）
	influxList, err := l.svcCtx.Dao.QueryAllVehiclesLatest()
	if err != nil {
		return nil, err
	}

	// 把 Influx 返回的状态按 vehicleId 建立索引，便于合并
	influxMap := make(map[string]types.VEH2CLOUD_STATE)
	for _, s := range influxList {
		if s.VehicleId == "" {
			continue
		}
		influxMap[s.VehicleId] = s
	}

	// 2) 查询 MySQL 静态车辆列表（如果可用），优先使用静态列表作为总车辆集合
	ids := make(map[string]struct{})
	// 建立 MySQL 映射以便在没有 Influx 数据时可以参考静态状态字段（例如充电/异常标记）
	mysqlMap := make(map[string]map[string]interface{})
	if l.svcCtx.MySQLDao != nil {
		if rows, err := l.svcCtx.MySQLDao.ListVehicles(); err == nil {
			for _, r := range rows {
				if vidRaw, ok := r["vehicleId"]; ok {
					if vid, ok2 := vidRaw.(string); ok2 && vid != "" {
						ids[vid] = struct{}{}
						mysqlMap[vid] = r
					}
				}
			}
		}
	}

	// 3) 如果 Influx 中存在但 MySQL 中没有的车辆，也一并包含（防止遗漏）
	for vid := range influxMap {
		ids[vid] = struct{}{}
	}

	// 4) 遍历所有车辆 id，基于 Influx 的最新状态判断当前分类；若无 Influx 数据则视为空闲（idle）
	resp := &types.VehicleSummaryResp{}
	resp.Total = len(ids)
	for vid := range ids {
		if s, ok := influxMap[vid]; ok {
			// 根据速度判断是否在途（优先使用 VelocityGNSS/Velocity）
			if s.VelocityGNSS > 0 || s.Velocity > 0 {
				resp.InTransit++
				continue
			}
			// TODO: 如果上报了 driveMode 或其他字段可用于识别充电/异常，可在此扩展判断
			resp.Idle++
		} else {
			// 没有时序上报数据，尝试使用 MySQL 的静态 status 字段进行补充判断
			if mr, ok := mysqlMap[vid]; ok {
				if statusRaw, exists := mr["status"]; exists {
					if statusStr, ok2 := statusRaw.(string); ok2 {
						if statusStr != "" {
							// 简单关键字匹配：包含“充电”视为 charging，包含“异常”视为 abnormal
							if containsIgnoreCase(statusStr, "充电") || containsIgnoreCase(statusStr, "charging") {
								resp.Charging++
								continue
							}
							if containsIgnoreCase(statusStr, "异常") || containsIgnoreCase(statusStr, "error") {
								resp.Abnormal++
								continue
							}
						}
					}
				}
			}
			// 默认认为空闲
			resp.Idle++
		}
	}

	// charging 与 abnormal 暂时无法仅靠现有时序字段可靠判定，保持为 0（如需可基于额外字段扩展）
	resp.Charging = 0
	resp.Abnormal = 0
	return resp, nil
}

// containsIgnoreCase 判断字符串 s 是否包含子串 sub（不区分大小写）
func containsIgnoreCase(s, sub string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(sub))
}
