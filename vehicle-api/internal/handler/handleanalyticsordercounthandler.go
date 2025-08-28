package handler

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"vehicle-api/internal/logic"
	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"
)

func HandleAnalyticsOrderCountHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.AnalyticsReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := logic.NewHandleAnalyticsOrderCountLogic(r.Context(), svcCtx)
		resp, err := l.HandleAnalyticsOrderCount(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
