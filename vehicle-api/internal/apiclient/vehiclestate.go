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
	// 简单重连策略：失败后等待一段时间再重连，直到 ctx 取消
	backoff := time.Second * 2
	for {
		select {
		case <-ctx.Done():
			logx.Infof("VEHState 客户端收到退出信号，准备退出")
			c.closeConn()
			return
		default:
		}

		if err := c.connectAndServe(ctx); err != nil {
			logx.Errorf("VEHState 客户端错误：%v，%s 后重连", err, backoff)
			select {
			case <-time.After(backoff):
				// 增长退避，但限制最大值
				if backoff < 30*time.Second {
					backoff *= 2
				}
				continue
			case <-ctx.Done():
				c.closeConn()
				return
			}
		} else {
			// 正常断开（例如主动关闭），退出循环
			c.closeConn()
			return
		}
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

func (c *VEHStateClient) connectAndServe(ctx context.Context) error {
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
	c.conn = conn
	defer func() {
		_ = conn.Close()
	}()

	// 设置读取超时、消息大小限制等（按需可扩展）
	conn.SetReadLimit(1024 * 1024)

	// 读取循环
	for {
		select {
		case <-ctx.Done():
			logx.Infof("VEHStateClient context cancelled, closing connection")
			return nil
		default:
		}

		_, msg, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("读取消息出错: %w", err)
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
