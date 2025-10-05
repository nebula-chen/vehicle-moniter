package handler

import (
	"net/http"

	"vehicle-api/internal/logic"
	"vehicle-api/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func HandleVehiclesListHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := logic.NewHandleVehiclesListLogic(r.Context(), svcCtx)
		resp, err := l.HandleVehiclesList()
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}
