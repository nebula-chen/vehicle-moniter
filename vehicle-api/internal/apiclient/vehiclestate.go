package apiclient

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"vehicle-api/internal/types"

	"github.com/gorilla/websocket"
	"github.com/zeromicro/go-zero/core/logx"
)

// VEHStateClient 用于连接和通信外部开放API的WebSocket接口
type VEHStateClient struct {
	URL               string                              // WebSocket连接URL
	Conn              *websocket.Conn                     // WebSocket连接
	Send              chan *types.VehicleStateReq         // 发送消息通道
	Recv              chan *types.VehicleStateResp        // 接收消息通道
	Done              chan struct{}                       // 关闭信号
	OnMessage         func(*types.VehicleStateResp) error // 消息处理回调
	OnError           func(error)                         // 错误处理回调
	OnClose           func()                              // 关闭回调
	mu                sync.Mutex
	connected         bool
	reconnect         bool
	reconnectNum      int
	logger            logx.Logger
	closeOnce         sync.Once
	HeartbeatInterval int    // 心跳间隔（秒），0 表示不启用心跳
	AppId             string // 用于鉴权的 appId
	AppSecret         string // 用于签名的密钥

	subsMu             sync.Mutex
	subscribedGrades   map[int]struct{}
	subscribedVehicles map[string]struct{}
}

// NewClient 创建新的开放API客户端
// NewVEHStateClient 创建新的开放API客户端
// 参数说明：
// - url: WebSocket 基础地址（不一定包含鉴权参数）
// - appId/appSecret: 用于生成签名的凭据
// - onMessage/onError/onClose: 回调函数
func NewVEHStateClient(url string, appId string, appSecret string, heartbeatInterval int, onMessage func(*types.VehicleStateResp) error, onError func(error), onClose func()) *VEHStateClient {
	return &VEHStateClient{
		URL:                url,
		Send:               make(chan *types.VehicleStateReq, 10),
		Recv:               make(chan *types.VehicleStateResp, 10),
		Done:               make(chan struct{}),
		OnMessage:          onMessage,
		OnError:            onError,
		OnClose:            onClose,
		reconnect:          true,
		logger:             logx.WithContext(context.Background()),
		AppId:              appId,
		AppSecret:          appSecret,
		HeartbeatInterval:  heartbeatInterval,
		subscribedGrades:   make(map[int]struct{}),
		subscribedVehicles: make(map[string]struct{}),
	}
}

// Connect 建立WebSocket连接
func (c *VEHStateClient) Connect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.connected {
		return fmt.Errorf("已连接")
	}

	// 解析并构造带鉴权参数的 URL（timestamp, nonce, appId, sign）
	// 签名规则：sign = SHA-256(toString(data) + "_" + timestamp + "_" + appId + "_" + nonce + "_" + appSecret)
	u, err := url.Parse(c.URL)
	if err != nil {
		return fmt.Errorf("无效的 URL: %w", err)
	}

	// 生成 timestamp（毫秒）
	timestamp := time.Now().UnixNano() / int64(time.Millisecond)

	// 生成随机 nonce（16 个字符，字母数字）
	nonce := generateNonce(16)

	// 组合签名字符串并计算 SHA-256 十六进制字符串
	signString := fmt.Sprintf("%d_%s_%s_%s", timestamp, c.AppId, nonce, c.AppSecret)
	sum := sha256.Sum256([]byte(signString))
	sign := hex.EncodeToString(sum[:])

	// 在 URL 上追加 query 参数
	tsStr := strconv.FormatInt(timestamp, 10)
	u.RawQuery = fmt.Sprintf("timestamp=%s&nonce=%s&appId=%s&sign=%s",
		url.QueryEscape(tsStr), url.QueryEscape(nonce), url.QueryEscape(c.AppId), url.QueryEscape(sign))

	// 建立连接
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	// 为握手请求添加自定义 header，加入 X-Auth-Type: sign
	headers := http.Header{}
	headers.Set("X-Auth-Type", "sign")

	// 打印用于拨号的最终 URL（仅包含公共 query 参数，不包含 appSecret）便于调试
	c.logger.Infof("正在拨号 OpenAPI websocket: %s", u.String())

	conn, resp, err := dialer.DialContext(ctx, u.String(), headers)
	if err != nil {
		// 如果服务器返回了 HTTP 响应（非 101），尝试读取状态码和响应体帮助定位问题
		if resp != nil {
			body := ""
			if resp.Body != nil {
				// 读取响应体（最多读取 4KB，避免过大输出）
				buf, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
				body = string(buf)
				resp.Body.Close()
			}
			c.logger.Errorf("WebSocket 拨号失败：status=%s，body=%s", resp.Status, body)
		}
		return fmt.Errorf("连接 OpenAPI 失败: %w", err)
	}

	c.Conn = conn
	// 设置初始读取截止时间并注册 PongHandler，收到 pong 时延长读取截止时间
	// 使用 HeartbeatInterval 配置（如果为0则使用默认 30s/90s 策略）
	pingInterval := 30 * time.Second
	readDeadline := 90 * time.Second
	if c.HeartbeatInterval > 0 {
		pingInterval = time.Duration(c.HeartbeatInterval) * time.Second
		readDeadline = pingInterval * 3
	}

	c.Conn.SetReadDeadline(time.Now().Add(readDeadline))
	c.Conn.SetPongHandler(func(appData string) error {
		c.mu.Lock()
		defer c.mu.Unlock()
		if c.Conn != nil {
			_ = c.Conn.SetReadDeadline(time.Now().Add(readDeadline))
		}
		return nil
	})
	c.connected = true
	c.reconnectNum = 0
	c.logger.Infof("成功连接到 OpenAPI：%s", c.URL)

	return nil
}

// SubscribeCategory 向外部 WebSocket 服务订阅指定的 categoryCode（持续推送）
// 约定：通过发送 VehicleStateReq{CategoryCode: n, VehicleId: ""} 作为订阅请求。
// 注意：此处假设外部服务接受该格式作为订阅消息；如果外部有不同协议，请提供具体格式。
func (c *VEHStateClient) SubscribeCategory(category int) error {
	if category <= 0 {
		return fmt.Errorf("无效的 category: %d", category)
	}

	c.subsMu.Lock()
	if _, ok := c.subscribedGrades[category]; ok {
		c.subsMu.Unlock()
		return nil // 已订阅
	}
	c.subscribedGrades[category] = struct{}{}
	c.subsMu.Unlock()

	// 发送订阅请求（非阻塞）；SendRequest 会将请求放入发送队列
	req := &types.VehicleStateReq{
		CategoryCode: category,
		VehicleId:    "",
	}
	if err := c.SendRequest(req); err != nil {
		// 如果发送失败（例如未连接），仍返回 nil，因为订阅记录已保存，后续 reconnect 会重新订阅
		if c.OnError != nil {
			c.OnError(fmt.Errorf("订阅发送失败: %w", err))
		}
		return err
	}
	c.logger.Infof("已订阅分类=%d", category)
	return nil
}

// SubscribeVehicle 订阅指定 vehicleId 的车辆持续推送（CategoryCode 为空）
func (c *VEHStateClient) SubscribeVehicle(vehicleId string) error {
	if vehicleId == "" {
		return fmt.Errorf("vehicleId 不能为空")
	}

	c.subsMu.Lock()
	if _, ok := c.subscribedVehicles[vehicleId]; ok {
		c.subsMu.Unlock()
		return nil // 已订阅
	}
	c.subscribedVehicles[vehicleId] = struct{}{}
	c.subsMu.Unlock()

	req := &types.VehicleStateReq{
		VehicleId: vehicleId,
	}
	if err := c.SendRequest(req); err != nil {
		if c.OnError != nil {
			c.OnError(fmt.Errorf("订阅发送失败: %w", err))
		}
		return err
	}
	c.logger.Infof("已订阅 vehicleId=%s", vehicleId)
	return nil
}

// resubscribeAll 在重连成功并启动 writePump 后调用，重新发送所有订阅请求
func (c *VEHStateClient) resubscribeAll() {
	c.subsMu.Lock()
	defer c.subsMu.Unlock()
	for cat := range c.subscribedGrades {
		req := &types.VehicleStateReq{CategoryCode: cat, VehicleId: ""}
		// 尝试发送但不阻塞主流程
		_ = c.SendRequest(req)
		c.logger.Infof("已重新订阅分类=%d", cat)
	}
	for vid := range c.subscribedVehicles {
		req := &types.VehicleStateReq{VehicleId: vid}
		_ = c.SendRequest(req)
		c.logger.Infof("已重新订阅 vehicleId=%s", vid)
	}
}

// Close 关闭WebSocket连接
func (c *VEHStateClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected {
		return fmt.Errorf("not connected")
	}

	c.reconnect = false
	close(c.Done)
	if c.Conn != nil {
		c.connected = false
		return c.Conn.Close()
	}
	return nil
}

// SendRequest 发送请求到开放API
func (c *VEHStateClient) SendRequest(req *types.VehicleStateReq) error {
	c.mu.Lock()
	if !c.connected {
		c.mu.Unlock()
		return fmt.Errorf("not connected")
	}
	c.mu.Unlock()

	select {
	case c.Send <- req:
		return nil
	case <-c.Done:
		return fmt.Errorf("client closed")
	case <-time.After(5 * time.Second):
		return fmt.Errorf("send timeout")
	}
}

// Run 启动客户端的读写循环
func (c *VEHStateClient) Run(ctx context.Context) {
	go c.writePump()
	go c.readPump()
}

// writePump 处理发送消息
func (c *VEHStateClient) writePump() {
	defer c.handleClose()

	// 心跳 ping 定时器（定期向服务器发送 ping，保持连接活跃）
	var pingTicker *time.Ticker
	if c.HeartbeatInterval > 0 {
		pingTicker = time.NewTicker(time.Duration(c.HeartbeatInterval) * time.Second)
		defer pingTicker.Stop()
	} else {
		// 若未配置心跳（为0），仍采用默认 30s 心跳以提高兼容性
		pingTicker = time.NewTicker(30 * time.Second)
		defer pingTicker.Stop()
	}

	for {
		select {
		case <-c.Done:
			c.mu.Lock()
			if c.Conn != nil {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
			}
			c.mu.Unlock()
			return

		case <-pingTicker.C:
			c.mu.Lock()
			if !c.connected || c.Conn == nil {
				c.mu.Unlock()
				continue
			}
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			// 发送 ping 控制帧
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				c.mu.Unlock()
				if c.OnError != nil {
					c.OnError(fmt.Errorf("发送 ping 失败: %w", err))
				}
				c.handleReconnect()
				return
			}
			c.mu.Unlock()

		case msg, ok := <-c.Send:
			c.mu.Lock()
			if !ok {
				c.mu.Unlock()
				return
			}
			if !c.connected || c.Conn == nil {
				c.mu.Unlock()
				c.logger.Errorf("Connection lost, cannot send message")
				continue
			}

			// 设置写入超时
			c.Conn.SetWriteDeadline(time.Now().Add(5 * time.Second))

			data, err := json.Marshal(msg)
			if err != nil {
				c.mu.Unlock()
				if c.OnError != nil {
					c.OnError(fmt.Errorf("序列化请求失败: %w", err))
				}
				continue
			}

			err = c.Conn.WriteMessage(websocket.TextMessage, data)
			c.mu.Unlock()

			if err != nil {
				if c.OnError != nil {
					c.OnError(fmt.Errorf("发送消息失败: %w", err))
				}
				c.handleReconnect()
				return
			}

			c.logger.Debugf("已发送请求到 OpenAPI: %s", string(data))
		}
	}
}

// readPump 处理接收消息
func (c *VEHStateClient) readPump() {
	defer c.handleClose()

	for {
		select {
		case <-c.Done:
			return
		default:
		}

		c.mu.Lock()
		if !c.connected || c.Conn == nil {
			c.mu.Unlock()
			return
		}

		// 设置读取超时
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))

		_, data, err := c.Conn.ReadMessage()
		c.mu.Unlock()

		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				if c.OnError != nil {
					c.OnError(fmt.Errorf("WebSocket 异常关闭: %w", err))
				}
			}
			c.handleReconnect()
			return
		}

		// 解析响应
		var resp types.VehicleStateResp
		if err := json.Unmarshal(data, &resp); err != nil {
			if c.OnError != nil {
				c.OnError(fmt.Errorf("解析响应失败: %w", err))
			}
			continue
		}

		// 不直接处理，推入带缓冲的接收队列
		select {
		case c.Recv <- &resp:
		default:
			c.logger.Errorf("[ws状态] Recv 队列已满，丢弃消息 vehicle=%s ts=%d", resp.Data.VehicleId, resp.Data.Timestamp)
		}

		c.logger.Debugf("收到来自 OpenAPI 的响应: %+v", resp)

		// 调用消息处理回调
		if c.OnMessage != nil {
			if err := c.OnMessage(&resp); err != nil {
				if c.OnError != nil {
					c.OnError(fmt.Errorf("处理消息失败: %w", err))
				}
			}
		}
	}
}

// handleReconnect 处理重新连接逻辑
func (c *VEHStateClient) handleReconnect() {
	if !c.reconnect {
		return
	}

	c.mu.Lock()
	c.connected = false
	if c.Conn != nil {
		c.Conn.Close()
		c.Conn = nil
	}
	c.mu.Unlock()

	// 指数退避重连策略，最多重试5次
	maxRetries := 5
	for c.reconnectNum < maxRetries {
		backoff := time.Duration(1<<uint(c.reconnectNum)) * time.Second
		c.logger.Infof("将在 %v 后重连 OpenAPI（尝试 %d/%d）", backoff, c.reconnectNum+1, maxRetries)

		select {
		case <-time.After(backoff):
			if err := c.Connect(context.Background()); err != nil {
				c.reconnectNum++
				c.logger.Errorf("重连失败: %v", err)
				if c.OnError != nil {
					c.OnError(err)
				}
				continue
			}
			// 成功连接，重新启动读写循环
			go c.writePump()
			go c.readPump()
			// 重新订阅之前的所有分类
			c.resubscribeAll()
			return
		case <-c.Done:
			return
		}
	}

	c.logger.Errorf("重试 %d 次后仍无法重连", maxRetries)
	if c.OnClose != nil {
		c.OnClose()
	}
}

// handleClose 处理关闭
func (c *VEHStateClient) handleClose() {
	// 确保关闭逻辑和Onclose回调仅运行一次
	c.closeOnce.Do(func() {
		c.mu.Lock()
		defer c.mu.Unlock()

		c.connected = false
		if c.Conn != nil {
			c.Conn.Close()
			c.Conn = nil
		}

		if c.OnClose != nil {
			c.OnClose()
		}
	})
}

// generateNonce 生成一个指定长度的随机字符串，包含字母和数字
func generateNonce(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}
