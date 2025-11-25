package logic

import (
	"context"
	"fmt"
	"strings"

	"orders-api/internal/svc"
	"orders-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type OrderStatsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewOrderStatsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *OrderStatsLogic {
	return &OrderStatsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *OrderStatsLogic) OrderStats() (resp *types.StatsResp, err error) {
	// 把聚合下沉到 DAO 层，直接调用 OrderDAO.Stats() 获取预聚合结果
	if l.svcCtx == nil || l.svcCtx.Order == nil {
		l.Logger.Error("svcCtx or Order DAO is nil")
		return resp, fmt.Errorf("service context or order dao not initialized")
	}
	// 直接委托给 DAO 执行数据库层面的聚合统计
	return l.svcCtx.Order.Stats()
}

// StatsOptions 代表统计调用的可选参数
type StatsOptions struct {
	Mode      string // year|month|day 或 空 表示全部
	Limit     int    // 限制返回最近多少个时间桶（>0 生效）
	StartTime string // 可选，过滤起始时间（多种格式支持）
	EndTime   string // 可选，过滤结束时间
}

// OrderStatsWithOptions 使用传入的选项委托给 DAO 执行聚合统计
func (l *OrderStatsLogic) OrderStatsWithOptions(opts *StatsOptions) (resp *types.StatsResp, err error) {
	if l.svcCtx == nil || l.svcCtx.Order == nil {
		l.Logger.Error("svcCtx or Order DAO is nil")
		return resp, fmt.Errorf("service context or order dao not initialized")
	}
	mode := ""
	limit := 0
	start := ""
	end := ""
	if opts != nil {
		mode = strings.ToLower(strings.TrimSpace(opts.Mode))
		if mode != "year" && mode != "month" && mode != "day" {
			mode = ""
		}
		if opts.Limit > 0 {
			limit = opts.Limit
			// 为防止滥用，设置一个合理上限（例如 100）
			if limit > 100 {
				limit = 100
			}
		}
		start = strings.TrimSpace(opts.StartTime)
		end = strings.TrimSpace(opts.EndTime)
	}
	return l.svcCtx.Order.StatsWithOptions(mode, limit, start, end)
}
