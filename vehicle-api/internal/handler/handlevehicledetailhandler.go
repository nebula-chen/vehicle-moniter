package handler

import (
	"fmt"
	"net/http"
	"strings"

	"vehicle-api/internal/logic"
	"vehicle-api/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func HandleVehicleDetailHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 优先读取 query 参数
		id := r.URL.Query().Get("id")
		if id == "" {
			// 尝试从路径中提取，例如 /api/vehicles/{id}
			p := strings.TrimPrefix(r.URL.Path, "/api/vehicles/")
			id = strings.Trim(p, "/")
		}
		if id == "" {
			httpx.ErrorCtx(r.Context(), w, fmt.Errorf("vehicle id is required"))
			return
		}

		l := logic.NewHandleVehicleDetailLogic(r.Context(), svcCtx)
		resp, err := l.HandleVehicleDetail(id)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}
