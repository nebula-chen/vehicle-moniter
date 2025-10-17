package logic

import (
	"context"
	"fmt"
	"strings"

	"gridmenber-api/internal/svc"
	"gridmenber-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetGridMemberInfoLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetGridMemberInfoLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetGridMemberInfoLogic {
	return &GetGridMemberInfoLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetGridMemberInfoLogic) GetGridMemberInfo(gridMemberId string) (resp *types.GridMemberInfoResp, err error) {
	resp = &types.GridMemberInfoResp{}

	if strings.TrimSpace(gridMemberId) == "" {
		return nil, fmt.Errorf("gridMemberId 不能为空")
	}

	if l.svcCtx == nil || l.svcCtx.MySQL == nil {
		return nil, fmt.Errorf("数据库未初始化")
	}

	m, err := l.svcCtx.MySQL.GetGridMemberByID(gridMemberId)
	if err != nil {
		return nil, err
	}

	// map to resp
	resp.GridMemberId = toString(m["gridMemberId"])
	resp.EntryTime = toString(m["entryTime"])
	resp.GridMemberName = toString(m["gridMemberName"])
	resp.GridMemberPhone = toString(m["gridMemberPhone"])
	resp.IsGridId = toString(m["isGridId"])
	resp.Status = toString(m["status"])
	resp.Note = toString(m["note"])

	return resp, nil
}
