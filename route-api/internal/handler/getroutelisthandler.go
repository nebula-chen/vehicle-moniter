package handler

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"route-api/internal/logic"
	"route-api/internal/svc"
	"route-api/internal/types"
)

func GetRouteListHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.RouteListReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := logic.NewGetRouteListLogic(r.Context(), svcCtx)
		resp, err := l.GetRouteList(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
