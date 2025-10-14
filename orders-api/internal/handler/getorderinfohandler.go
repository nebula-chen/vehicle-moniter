package handler

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"orders-api/internal/logic"
	"orders-api/internal/svc"
)

func GetOrderInfoHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := logic.NewGetOrderInfoLogic(r.Context(), svcCtx)
		resp, err := l.GetOrderInfo()
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
