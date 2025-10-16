package handler

import (
	"net/http"
	"strings"

	"github.com/zeromicro/go-zero/rest/httpx"
	"route-api/internal/logic"
	"route-api/internal/svc"
)

func GetRouteInfoHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := logic.NewGetRouteInfoLogic(r.Context(), svcCtx)
		// 从 URL 路径中提取 routeId（路径格式：/api/route/detail/:routeId）
		parts := strings.Split(r.URL.Path, "/")
		routeId := ""
		if len(parts) > 0 {
			routeId = parts[len(parts)-1]
		}
		resp, err := l.GetRouteInfo(routeId)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
