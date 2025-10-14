package handler

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"orders-api/internal/logic"
	"orders-api/internal/svc"
	"orders-api/internal/types"
)

func OrderDeleteHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.OrderDeleteReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := logic.NewOrderDeleteLogic(r.Context(), svcCtx)
		resp, err := l.OrderDelete(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
