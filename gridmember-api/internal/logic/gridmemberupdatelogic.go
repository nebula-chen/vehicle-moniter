package logic

import (
	"context"

	"gridmenber-api/internal/svc"
	"gridmenber-api/internal/types"

	"strings"

	"github.com/zeromicro/go-zero/core/logx"
)

type GridMemberUpdateLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGridMemberUpdateLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GridMemberUpdateLogic {
	return &GridMemberUpdateLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GridMemberUpdateLogic) GridMemberUpdate(req *types.GridMemberUpdateReq) (resp *types.BaseResp, err error) {
	resp = &types.BaseResp{Code: 0, Msg: "success"}

	// 基本校验
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

	// 调用 DAO 更新，DAO 会忽略空字段
	if err := l.svcCtx.MySQL.UpdateGridMemberByID(req.GridMemberId, req.Status, req.GridMemberPhone, req.IsGridId, req.Note); err != nil {
		resp.Code = 4
		resp.Msg = "数据库错误: " + err.Error()
		logx.Errorf("UpdateGridMemberByID error: %v", err)
		return resp, nil
	}

	return resp, nil
}
