package handler

import (
	"net/http"

	"orders-api/internal/logic"
	"orders-api/internal/svc"
	"orders-api/internal/types"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func OrderCreateHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.OrderCreateInfo
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := logic.NewOrderCreateLogic(r.Context(), svcCtx)
		resp, err := l.OrderCreate(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
