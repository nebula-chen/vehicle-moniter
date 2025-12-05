package apiclient

import (
	"context"
	crand "crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/zeromicro/go-zero/core/logx"

	"vehicle-api/internal/config"
	"vehicle-api/internal/types"
)

// VEHStateClient 负责与外部车辆状态 WebSocket 服务保持连接并将收到的数据回调给上层处理函数
type VEHStateClient struct {
	cfg       config.VEHStateConfig
	appId     string
	appSecret string
	handle    func(*types.VehicleStateData) error

	// mu 用于保护 conn 的并发访问
	mu     sync.Mutex
	conn   *websocket.Conn
	closed chan struct{}
}

// NewVEHStateClient 创建新的客户端实例
func NewVEHStateClient(cfg config.VEHStateConfig, appId, appSecret string, handle func(*types.VehicleStateData) error) *VEHStateClient {
	return &VEHStateClient{
		cfg:       cfg,
		appId:     appId,
		appSecret: appSecret,
		handle:    handle,
		closed:    make(chan struct{}),
	}
}

// Start 启动客户端并在后台保持连接；在 ctx 取消或 Stop 被调用时返回
func (c *VEHStateClient) Start(ctx context.Context) {
	// 更健壮的重连逻辑：Dial 与读取在不同的 goroutine 中运行，
	// 并且 Dial 使用带超时的 Context 避免被长时间阻塞，从而保证当其它任务占用资源时仍能进行重连。
	backoff := 2 * time.Second
	maxBackoff := 30 * time.Second

	for {
		select {
		case <-ctx.Done():
			logx.Infof("VEHState 客户端收到退出信号，准备退出")
			c.closeConn()
			return
		default:
		}

		// 使用短超时的 context 来拨号，避免 Dial 被长期阻塞
		dialCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		err := c.dialAndServe(dialCtx)
		cancel()

		if err != nil {
			// 记录错误并按照指数退避重试
			logx.Errorf("VEHState 客户端错误：%v，%s 后重连", err, backoff)
			select {
			case <-time.After(backoff):
				if backoff < maxBackoff {
					backoff *= 2
				}
				continue
			case <-ctx.Done():
				c.closeConn()
				return
			}
		}

		// dialAndServe 正常返回（通常表示主动关闭），直接退出
		c.closeConn()
		return
	}
}

// dialAndServe 封装了拨号和读循环：拨号成功后在独立的读取 goroutine 中循环读取消息，
// 若读取出错则返回错误以触发重连。此函数假定传入的 ctx 是用于拨号的短超时 ctx。
func (c *VEHStateClient) dialAndServe(ctx context.Context) error {
	if c.cfg.URL == "" {
		return fmt.Errorf("VEHState 未配置 URL")
	}

	// 构造带鉴权参数的 URL（timestamp, nonce, appId, sign）
	u, err := url.Parse(c.cfg.URL)
	if err != nil {
		return fmt.Errorf("invalid VEHState URL: %w", err)
	}

	timestamp := time.Now().UnixNano() / int64(time.Millisecond)
	nonce := generateNonce(16)

	// 签名规则：sign = SHA-256(timestamp + "_" + appId + "_" + nonce + "_" + appSecret)
	signString := fmt.Sprintf("%d_%s_%s_%s", timestamp, c.appId, nonce, c.appSecret)
	sum := sha256.Sum256([]byte(signString))
	sign := hex.EncodeToString(sum[:])

	tsStr := strconv.FormatInt(timestamp, 10)
	q := u.Query()
	q.Set("timestamp", tsStr)
	q.Set("nonce", nonce)
	q.Set("appId", c.appId)
	q.Set("sign", sign)
	u.RawQuery = q.Encode()

	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	headers := http.Header{}
	headers.Set("X-Auth-Type", "sign")

	logx.Infof("正在拨号连接外部 VEHState WebSocket：%s", u.String())
	conn, resp, err := dialer.DialContext(ctx, u.String(), headers)
	if err != nil {
		if resp != nil {
			logx.Errorf("VEHState 握手失败 HTTP 状态：%s", resp.Status)
		}
		return err
	}

	// 成功建立连接，重置退避（由调用者控制），并启动读取协程
	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()

	// 使用 buffered chan 接收读取错误，避免 goroutine 泄漏
	errCh := make(chan error, 1)

	// 启动读取循环（在独立 goroutine 中运行，确保不会阻塞拨号逻辑）
	go func() {
		// 设置读取限制
		conn.SetReadLimit(1024 * 1024)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				errCh <- fmt.Errorf("读取消息出错: %w", err)
				return
			}

			var resp types.VehicleStateResp
			if err := json.Unmarshal(msg, &resp); err != nil {
				// 可能是心跳或其它格式，记录并继续
				logx.Errorf("解析 VEHState 消息失败: %v, raw=%s", err, string(msg))
				continue
			}

			// 期望 code==0 表示成功
			if resp.Code != 0 {
				logx.Infof("VEHState 返回 code=%d, message=%s", resp.Code, resp.Message)
				continue
			}

			if resp.Data.VehicleId == "" {
				// 空数据，跳过
				continue
			}

			// 回调上层处理函数（不会阻塞读取，如果处理较慢建议上层异步化）
			if c.handle != nil {
				if err := c.handle(&resp.Data); err != nil {
					logx.Errorf("处理 VEHState 数据出错：%v", err)
				}
			}
		}
	}()

	// 等待读取错误或上下文取消
	select {
	case <-ctx.Done():
		// 上层取消拨号（超时或主动取消），关闭连接并返回
		c.closeConn()
		return ctx.Err()
	case err := <-errCh:
		// 读取出错，需要重连
		c.closeConn()
		return err
	}
}

// Stop 主动关闭客户端
func (c *VEHStateClient) Stop() {
	c.closeConn()
}

func (c *VEHStateClient) closeConn() {
	if c.conn != nil {
		_ = c.conn.Close()
		c.conn = nil
	}
	select {
	case <-c.closed:
		// already closed
	default:
		close(c.closed)
	}
}

// generateNonce 生成随机字母数字串
func generateNonce(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	if _, err := crand.Read(b); err != nil {
		// fallback to time-based pseudo-random if crypto fails
		s := make([]byte, n)
		for i := range s {
			s[i] = letters[time.Now().UnixNano()%int64(len(letters))]
		}
		return string(s)
	}
	for i := range b {
		b[i] = letters[int(b[i])%len(letters)]
	}
	return string(b)
}
