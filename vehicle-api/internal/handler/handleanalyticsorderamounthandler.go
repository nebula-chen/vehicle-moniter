package handler

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"vehicle-api/internal/logic"
	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"
)

func HandleAnalyticsOrderAmountHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.AnalyticsReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := logic.NewHandleAnalyticsOrderAmountLogic(r.Context(), svcCtx)
		resp, err := l.HandleAnalyticsOrderAmount(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
