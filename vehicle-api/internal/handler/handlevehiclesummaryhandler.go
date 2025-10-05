package handler

import (
	"net/http"

	"vehicle-api/internal/logic"
	"vehicle-api/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func HandleVehiclesSummaryHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := logic.NewHandleVehiclesSummaryLogic(r.Context(), svcCtx)
		resp, err := l.HandleVehiclesSummary()
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}
