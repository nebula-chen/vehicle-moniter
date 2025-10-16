package handler

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"route-api/internal/logic"
	"route-api/internal/svc"
)

func GetRouteInfoHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := logic.NewGetRouteInfoLogic(r.Context(), svcCtx)
		resp, err := l.GetRouteInfo()
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
