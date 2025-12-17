package handler

import (
	"net/http"

	"vehicle-api/internal/svc"
	ws "vehicle-api/internal/websocket"

	"github.com/zeromicro/go-zero/rest/httpx"
)

// HandleWebSocketHandler 直接在 handler 层完成 websocket 握手与 client 注册，
// 将连接交给 hub 管理并启动读写协程。
// 这样当 TCP 上报调用 ServiceContext.ProcessState 广播消息时，hub 会把消息转发到所有已注册的客户端。
func HandleWebSocketHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if svcCtx == nil || svcCtx.WSHub == nil {
			httpx.ErrorCtx(r.Context(), w, http.ErrServerClosed)
			return
		}

		// 使用封装的 Upgrader（在 internal/websocket 包中定义，允许跨域）
		conn, err := ws.Upgrader.Upgrade(w, r, nil)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		// 从查询参数读取可选的 serviceId，用于定向广播
		svcId := r.URL.Query().Get("serviceId")
		// 创建 client 并注册到 hub
		client := &ws.Client{Conn: conn, Send: make(chan []byte, 256), ServiceId: svcId}
		svcCtx.WSHub.Register <- client

		// 启动写读协程：写协程负责把 hub.Broadcast 的消息写回客户端，读协程用于处理客户端消息（目前仅打印）
		go client.WritePump()
		go client.ReadPump(svcCtx.WSHub)
	}
}
