package handler

import (
	"net/http"
	"strconv"

	"orders-api/internal/logic"
	"orders-api/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func OrderStatsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 解析查询参数：mode, limit, startTime, endTime
		q := r.URL.Query()
		mode := q.Get("mode")
		limit := 0
		if ls := q.Get("limit"); ls != "" {
			if v, err := strconv.Atoi(ls); err == nil {
				limit = v
			}
		}
		start := q.Get("startTime")
		end := q.Get("endTime")

		l := logic.NewOrderStatsLogic(r.Context(), svcCtx)
		opts := &logic.StatsOptions{
			Mode:      mode,
			Limit:     limit,
			StartTime: start,
			EndTime:   end,
		}
		resp, err := l.OrderStatsWithOptions(opts)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
