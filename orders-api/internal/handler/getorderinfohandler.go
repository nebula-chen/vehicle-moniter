package handler

import (
	"net/http"
	"strings"

	"orders-api/internal/logic"
	"orders-api/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func GetOrderInfoHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := logic.NewGetOrderInfoLogic(r.Context(), svcCtx)
		// 从 URL 路径中提取 orderId（路径格式：/api/order/detail/:orderId）
		parts := strings.Split(r.URL.Path, "/")
		orderId := ""
		if len(parts) > 0 {
			orderId = parts[len(parts)-1]
		}
		resp, err := l.GetOrderInfo(orderId)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
