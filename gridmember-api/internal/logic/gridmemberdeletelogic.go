package logic

import (
	"context"
	"strings"

	"gridmenber-api/internal/svc"
	"gridmenber-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GridMemberDeleteLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGridMemberDeleteLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GridMemberDeleteLogic {
	return &GridMemberDeleteLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GridMemberDeleteLogic) GridMemberDelete(req *types.GridMemberDeleteReq) (resp *types.BaseResp, err error) {
	resp = &types.BaseResp{Code: 0, Msg: "success"}

	if req == nil || strings.TrimSpace(req.GridMemberId) == "" {
		resp.Code = 1
		resp.Msg = "gridMemberId 不能为空"
		return resp, nil
	}

	if l.svcCtx == nil || l.svcCtx.MySQL == nil {
		resp.Code = 2
		resp.Msg = "数据库未初始化"
		return resp, nil
	}

	if err := l.svcCtx.MySQL.DeleteGridMemberByID(req.GridMemberId); err != nil {
		resp.Code = 4
		resp.Msg = "数据库错误: " + err.Error()
		logx.Errorf("DeleteGridMemberByID error: %v", err)
		return resp, nil
	}

	return resp, nil
}
