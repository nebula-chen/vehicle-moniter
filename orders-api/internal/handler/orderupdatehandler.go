package handler

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"orders-api/internal/logic"
	"orders-api/internal/svc"
	"orders-api/internal/types"
)

func OrderUpdateHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.OrderUpdateReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := logic.NewOrderUpdateLogic(r.Context(), svcCtx)
		resp, err := l.OrderUpdate(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
