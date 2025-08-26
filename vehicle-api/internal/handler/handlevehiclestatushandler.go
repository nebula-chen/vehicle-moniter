package handler

import (
	"net/http"

	"vehicle-api/internal/logic"
	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func HandleVehicleStatusHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.VEH2CLOUD_STATE
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := logic.NewHandleVehicleStatusLogic(r.Context(), svcCtx)
		resp, err := l.HandleVehicleStatus(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
