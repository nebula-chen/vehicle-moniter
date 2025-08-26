package handler

import (
	"net/http"

	"vehicle-api/internal/logic"
	"vehicle-api/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func HandleWebSocketHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := logic.NewHandleWebSocketLogic(r.Context(), svcCtx)
		err := l.HandleWebSocket()
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.Ok(w)
		}
	}
}
