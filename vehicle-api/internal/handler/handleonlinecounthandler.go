package handler

import (
	"net/http"

	"vehicle-api/internal/logic"
	"vehicle-api/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func HandleOnlineCountHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := logic.NewHandleOnlineCountLogic(r.Context(), svcCtx)
		resp, err := l.HandleOnlineCount()
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
