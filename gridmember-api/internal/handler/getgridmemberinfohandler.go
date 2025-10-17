package handler

import (
	"net/http"
	"strings"

	"gridmenber-api/internal/logic"
	"gridmenber-api/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func GetGridMemberInfoHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 从 URL 路径中提取 gridMemberId（路径格式：/api/gridMember/detail/:gridMemberId）
		parts := strings.Split(r.URL.Path, "/")
		gridMemberId := ""
		if len(parts) > 0 {
			gridMemberId = parts[len(parts)-1]
		}

		l := logic.NewGetGridMemberInfoLogic(r.Context(), svcCtx)
		resp, err := l.GetGridMemberInfo(gridMemberId)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
