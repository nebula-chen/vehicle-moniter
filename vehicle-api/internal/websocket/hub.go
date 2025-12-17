package websocket

import (
	"fmt"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

// 允许所有连接上来, prod 应该有限制
var Upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

type Client struct {
	Conn *websocket.Conn
	Send chan []byte
	// ServiceId 可选，标识该连接属于哪个上层服务（例如: "orders"）
	ServiceId string
}

type Hub struct {
	Clients map[*Client]bool
	// ClientsByService: 按 serviceId 分组的客户端集合，便于定向广播
	ClientsByService map[string]map[*Client]bool
	Broadcast        chan []byte
	Register         chan *Client
	Unregister       chan *Client
	mu               sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		Clients:          make(map[*Client]bool),
		ClientsByService: make(map[string]map[*Client]bool),
		Broadcast:        make(chan []byte),
		Register:         make(chan *Client),
		Unregister:       make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.Clients[client] = true
			// 如果 client 的 ServiceId 已设置，则加入按服务映射
			if client != nil && client.ServiceId != "" {
				set, ok := h.ClientsByService[client.ServiceId]
				if !ok {
					set = make(map[*Client]bool)
				}
				set[client] = true
				h.ClientsByService[client.ServiceId] = set
			}
			h.mu.Unlock()

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				// 如果 client 有 ServiceId，从对应集合移除
				if client != nil && client.ServiceId != "" {
					if set, ok := h.ClientsByService[client.ServiceId]; ok {
						if _, ok2 := set[client]; ok2 {
							delete(set, client)
						}
						if len(set) == 0 {
							delete(h.ClientsByService, client.ServiceId)
						} else {
							h.ClientsByService[client.ServiceId] = set
						}
					}
				}
				close(client.Send)
			}
			h.mu.Unlock()

		case message := <-h.Broadcast:
			h.mu.Lock()
			for client := range h.Clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.Clients, client)
				}
			}
			h.mu.Unlock()
		}
	}
}

// BroadcastToService 向指定 serviceId 的所有客户端广播消息
func (h *Hub) BroadcastToService(serviceId string, message []byte) {
	if serviceId == "" || message == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if set, ok := h.ClientsByService[serviceId]; ok {
		for client := range set {
			select {
			case client.Send <- message:
			default:
				close(client.Send)
				delete(set, client)
				delete(h.Clients, client)
			}
		}
		h.ClientsByService[serviceId] = set
	}
}

// 客户端消息读写函数
func (c *Client) WritePump() {
	defer c.Conn.Close()
	for message := range c.Send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
			return
		}
	}
}

func (c *Client) ReadPump(hub *Hub) {
	defer func() {
		hub.Unregister <- c
		c.Conn.Close()
	}()
	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}
		// hub.Broadcast <- message
		fmt.Printf("recv: %v\n", message)
	}
}
