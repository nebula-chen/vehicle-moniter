package handler

import (
	"net/http"
	"strconv"

	"vehicle-api/internal/logic"
	"vehicle-api/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func VehicleOnlineHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 解析查询参数：支持 categoryCode（整数，可选）和 mode/internal 标识是否内部调用
		q := r.URL.Query()
		categoryCode := 0
		if v := q.Get("categoryCode"); v != "" {
			// 尝试解析为整数（忽略错误，保留默认0）
			if n, err := strconv.Atoi(v); err == nil {
				categoryCode = n
			}
		}
		// internal 模式：用于服务内部调用，返回在线车辆ID列表以便订阅
		internalMode := false
		if m := q.Get("mode"); m == "internal" {
			internalMode = true
		}
		if iv := q.Get("internal"); iv == "1" || iv == "true" {
			internalMode = true
		}

		l := logic.NewVehicleOnlineLogic(r.Context(), svcCtx)
		resp, err := l.VehicleOnline(categoryCode, internalMode)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
