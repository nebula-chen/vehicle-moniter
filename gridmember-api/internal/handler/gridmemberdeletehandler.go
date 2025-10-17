package handler

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"gridmenber-api/internal/logic"
	"gridmenber-api/internal/svc"
	"gridmenber-api/internal/types"
)

func GridMemberDeleteHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.GridMemberDeleteReq
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := logic.NewGridMemberDeleteLogic(r.Context(), svcCtx)
		resp, err := l.GridMemberDelete(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
