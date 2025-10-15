package dao

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// OrderDAO 提供订单数据的持久化操作
type OrderDAO struct {
	db *sql.DB
}

// NewOrderDAO 创建 OrderDAO 实例
func NewOrderDAO(db *sql.DB) *OrderDAO {
	return &OrderDAO{db: db}
}

// CreateTableIfNotExists 自动建表，返回错误（若有）
func (d *OrderDAO) CreateTableIfNotExists() error {
	// 使用较宽松的字段类型以兼容前端结构
	createSQL := `CREATE TABLE IF NOT EXISTS orders (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(64) NOT NULL UNIQUE,
        type VARCHAR(32),
        weight INT,
        sender VARCHAR(128),
        sender_phone VARCHAR(64),
        sender_address VARCHAR(256),
        addressee VARCHAR(128),
        addressee_phone VARCHAR(64),
        address VARCHAR(256),
        start_time VARCHAR(32),
        end_time VARCHAR(32),
        status VARCHAR(32),
        pass_stations TEXT,
        pass_vehicle TEXT,
        pass_route TEXT,
        pass_grid_member TEXT,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`

	_, err := d.db.Exec(createSQL)
	return err
}

// InsertOrder 将订单信息插入数据库
func (d *OrderDAO) InsertOrder(orderId string, raw map[string]interface{}) error {
	// 将复杂字段序列化为 JSON 存入 TEXT 字段
	passStations, _ := json.Marshal(raw["passStations"])
	passVehicle, _ := json.Marshal(raw["passVehicle"])
	passRoute, _ := json.Marshal(raw["passRoute"])
	passGridMember, _ := json.Marshal(raw["passGridMember"])

	// 提取常用字段（容错处理）
	sType := toString(raw["type"])
	weight := toInt(raw["weight"])
	sender := toString(raw["sender"])
	senderPhone := toString(raw["senderPhone"])
	senderAddress := toString(raw["senderAddress"])
	addressee := toString(raw["addressee"])
	addresseePhone := toString(raw["addresseePhone"])
	address := toString(raw["address"])
	startTime := toString(raw["startTime"])
	endTime := toString(raw["endTime"])
	status := toString(raw["status"])
	note := toString(raw["note"])

	insertSQL := `INSERT INTO orders (
        order_id, type, weight, sender, sender_phone, sender_address,
        addressee, addressee_phone, address, start_time, end_time, status,
        pass_stations, pass_vehicle, pass_route, pass_grid_member, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := d.db.Exec(insertSQL,
		orderId, sType, weight, sender, senderPhone, senderAddress,
		addressee, addresseePhone, address, startTime, endTime, status,
		string(passStations), string(passVehicle), string(passRoute), string(passGridMember), note,
	)
	return err
}

// 辅助函数：将 interface 转为 string
func toString(v interface{}) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case []byte:
		return string(t)
	default:
		// 其它类型使用 fmt 转换为字符串
		return strings.TrimSpace(fmt.Sprint(t))
	}
}

// 辅助函数：将 interface 转为 int
func toInt(v interface{}) int {
	if v == nil {
		return 0
	}
	switch t := v.(type) {
	case int:
		return t
	case int32:
		return int(t)
	case int64:
		return int(t)
	case float64:
		return int(t)
	case float32:
		return int(t)
	case string:
		// 尝试解析数字字符串
		var i int
		_, err := fmt.Sscanf(t, "%d", &i)
		if err == nil {
			return i
		}
		return 0
	default:
		return 0
	}
}
