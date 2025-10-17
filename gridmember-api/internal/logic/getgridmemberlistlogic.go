package logic

import (
	"context"
	"fmt"

	"gridmenber-api/internal/svc"
	"gridmenber-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetGridMemberListLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetGridMemberListLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetGridMemberListLogic {
	return &GetGridMemberListLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetGridMemberListLogic) GetGridMemberList(req *types.GridMemberListReq) (resp *types.GridMemberListResp, err error) {
	resp = &types.GridMemberListResp{GridMembersList: []types.GridMemberInfoResp{}, Total: 0}

	if l.svcCtx == nil || l.svcCtx.MySQL == nil {
		return resp, fmt.Errorf("数据库未初始化")
	}

	startTime := ""
	endTime := ""
	status := ""
	isGridId := ""
	if req != nil {
		startTime = req.StartTime
		endTime = req.EndTime
		status = req.Status
		isGridId = req.IsGridId
	}

	rows, total, err := l.svcCtx.MySQL.GetGridMembers(startTime, endTime, status, isGridId)
	if err != nil {
		logx.Errorf("GetGridMembers error: %v", err)
		return resp, err
	}

	for _, m := range rows {
		item := types.GridMemberInfoResp{
			GridMemberId:    toString(m["gridMemberId"]),
			EntryTime:       toString(m["entryTime"]),
			GridMemberName:  toString(m["gridMemberName"]),
			GridMemberPhone: toString(m["gridMemberPhone"]),
			IsGridId:        toString(m["isGridId"]),
			Status:          toString(m["status"]),
			Note:            toString(m["note"]),
		}
		resp.GridMembersList = append(resp.GridMembersList, item)
	}
	resp.Total = total

	return resp, nil
}
