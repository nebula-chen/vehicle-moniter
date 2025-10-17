package logic

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
	"time"

	"gridmenber-api/internal/svc"
	"gridmenber-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GridMemberCreateLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGridMemberCreateLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GridMemberCreateLogic {
	return &GridMemberCreateLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GridMemberCreateLogic) GridMemberCreate(req *types.GridMemberCreateInfo) (resp *types.BaseResp, err error) {
	// 返回结果初始化
	resp = &types.BaseResp{Code: 0, Msg: "success"}

	// 简单字段校验
	if req.GridMemberName == "" {
		resp.Code = 1
		resp.Msg = "请录入网格员姓名"
		return resp, nil
	}
	if req.GridMemberPhone == "" {
		resp.Code = 1
		resp.Msg = "请录入网格员联系方式"
		return resp, nil
	}

	// 生成 gridMemberId: GM-yyyymmdd-6位随机码
	now := time.Now()
	date := now.Format("20060102")
	randSuffix := func(n int) string {
		const letters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
		var sb strings.Builder
		for i := 0; i < n; i++ {
			idx, _ := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
			sb.WriteByte(letters[idx.Int64()])
		}
		return sb.String()
	}(6)
	gridMemberId := fmt.Sprintf("GM-%s-%s", date, randSuffix)

	// 如果没有指定 isGridId/status/note，使用空字符串
	isGridId := req.IsGridId
	status := req.Status
	if status == "" {
		status = "在职/正常"
	}
	note := req.Note

	// 必须有 svcCtx 的 MySQL 支持
	if l.svcCtx == nil || l.svcCtx.MySQL == nil {
		resp.Code = 2
		resp.Msg = "数据库未配置或未初始化"
		return resp, nil
	}

	// 调用 DAO 插入数据
	if err := l.svcCtx.MySQL.InsertGridMember(gridMemberId, req.GridMemberName, req.GridMemberPhone, isGridId, status, note); err != nil {
		// 判断是否为 MySQL 重复键错误（1062）
		if merr := parseMySQLError(err); merr != nil && merr.Number == 1062 {
			resp.Code = 3
			resp.Msg = "网格员已存在（重复）"
			return resp, nil
		}
		// 回传数据库错误
		resp.Code = 4
		resp.Msg = "数据库错误: " + err.Error()
		logx.Errorf("InsertGridMember error: %v", err)
		return resp, nil
	}

	return resp, nil
}

// mysqlError 是对驱动 MySQL 错误的简化包装，用于提取错误码
// Try to parse common *mysql.MySQLError if available
func parseMySQLError(err error) *struct {
	Number uint16
	Msg    string
} {
	if err == nil {
		return nil
	}
	// 如果标准库的 sql 包直接返回错误则无法解析，这里尝试通过字符串判断
	if strings.Contains(err.Error(), "Error 1062") || strings.Contains(err.Error(), "Duplicate entry") {
		return &struct {
			Number uint16
			Msg    string
		}{Number: 1062, Msg: err.Error()}
	}
	return nil
}
