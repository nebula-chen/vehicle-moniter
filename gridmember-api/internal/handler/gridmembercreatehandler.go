package handler

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"gridmenber-api/internal/logic"
	"gridmenber-api/internal/svc"
	"gridmenber-api/internal/types"
)

func GridMemberCreateHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.GridMemberCreateInfo
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := logic.NewGridMemberCreateLogic(r.Context(), svcCtx)
		resp, err := l.GridMemberCreate(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
