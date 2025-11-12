package vehiclestate

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sync"
	"time"

	"vehicle-api/internal/types"

	"github.com/gorilla/websocket"
	"github.com/zeromicro/go-zero/core/logx"
)

// Client 用于连接和通信外部开放API的WebSocket接口
type Client struct {
	URL          string                              // WebSocket连接URL
	Conn         *websocket.Conn                     // WebSocket连接
	Send         chan *types.VehicleStateReq         // 发送消息通道
	Recv         chan *types.VehicleStateResp        // 接收消息通道
	Done         chan struct{}                       // 关闭信号
	OnMessage    func(*types.VehicleStateResp) error // 消息处理回调
	OnError      func(error)                         // 错误处理回调
	OnClose      func()                              // 关闭回调
	mu           sync.Mutex
	connected    bool
	reconnect    bool
	reconnectNum int
	logger       logx.Logger
}

// NewClient 创建新的开放API客户端
func NewClient(url string, onMessage func(*types.VehicleStateResp) error, onError func(error), onClose func()) *Client {
	return &Client{
		URL:       url,
		Send:      make(chan *types.VehicleStateReq, 10),
		Recv:      make(chan *types.VehicleStateResp, 10),
		Done:      make(chan struct{}),
		OnMessage: onMessage,
		OnError:   onError,
		OnClose:   onClose,
		reconnect: true,
		logger:    logx.WithContext(context.Background()),
	}
}

// Connect 建立WebSocket连接
func (c *Client) Connect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.connected {
		return fmt.Errorf("already connected")
	}

	// 解析URL
	if _, err := url.Parse(c.URL); err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	// 建立连接
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}
	conn, _, err := dialer.DialContext(ctx, c.URL, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to openapi: %w", err)
	}

	c.Conn = conn
	c.connected = true
	c.reconnectNum = 0
	c.logger.Infof("Successfully connected to OpenAPI: %s", c.URL)

	return nil
}

// Close 关闭WebSocket连接
func (c *Client) Close() error {
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
func (c *Client) SendRequest(req *types.VehicleStateReq) error {
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
func (c *Client) Run(ctx context.Context) {
	go c.writePump()
	go c.readPump()
}

// writePump 处理发送消息
func (c *Client) writePump() {
	defer c.handleClose()

	for {
		select {
		case <-c.Done:
			c.mu.Lock()
			if c.Conn != nil {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
			}
			c.mu.Unlock()
			return

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
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))

			data, err := json.Marshal(msg)
			if err != nil {
				c.mu.Unlock()
				if c.OnError != nil {
					c.OnError(fmt.Errorf("failed to marshal request: %w", err))
				}
				continue
			}

			err = c.Conn.WriteMessage(websocket.TextMessage, data)
			c.mu.Unlock()

			if err != nil {
				if c.OnError != nil {
					c.OnError(fmt.Errorf("failed to write message: %w", err))
				}
				c.handleReconnect()
				return
			}

			c.logger.Debugf("Sent request to OpenAPI: %s", string(data))
		}
	}
}

// readPump 处理接收消息
func (c *Client) readPump() {
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
					c.OnError(fmt.Errorf("websocket error: %w", err))
				}
			}
			c.handleReconnect()
			return
		}

		// 解析响应
		var resp types.VehicleStateResp
		if err := json.Unmarshal(data, &resp); err != nil {
			if c.OnError != nil {
				c.OnError(fmt.Errorf("failed to unmarshal response: %w", err))
			}
			continue
		}

		c.logger.Debugf("Received response from OpenAPI: %+v", resp)

		// 调用消息处理回调
		if c.OnMessage != nil {
			if err := c.OnMessage(&resp); err != nil {
				if c.OnError != nil {
					c.OnError(fmt.Errorf("failed to process message: %w", err))
				}
			}
		}
	}
}

// handleReconnect 处理重新连接逻辑
func (c *Client) handleReconnect() {
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
		c.logger.Infof("Attempting to reconnect to OpenAPI in %v (attempt %d/%d)", backoff, c.reconnectNum+1, maxRetries)

		select {
		case <-time.After(backoff):
			if err := c.Connect(context.Background()); err != nil {
				c.reconnectNum++
				c.logger.Errorf("Failed to reconnect: %v", err)
				if c.OnError != nil {
					c.OnError(err)
				}
				continue
			}
			// 成功连接，重新启动读写循环
			go c.writePump()
			go c.readPump()
			return
		case <-c.Done:
			return
		}
	}

	c.logger.Errorf("Failed to reconnect after %d attempts", maxRetries)
	if c.OnClose != nil {
		c.OnClose()
	}
}

// handleClose 处理关闭
func (c *Client) handleClose() {
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
}
