package logic

import (
	"context"

	"vehicle-api/internal/svc"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleWebSocketLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleWebSocketLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleWebSocketLogic {
	return &HandleWebSocketLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *HandleWebSocketLogic) HandleWebSocket() error {
	// todo: add your logic here and delete this line

	return nil
}
