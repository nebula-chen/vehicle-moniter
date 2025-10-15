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

// UpdateOrder 根据 order_id 更新订单的可变字段
// 支持更新：status、end_time、pass_stations、pass_vehicle、pass_route、pass_grid_member、note
func (d *OrderDAO) UpdateOrder(orderId string, updates map[string]interface{}) (rowsAffected int64, err error) {
	if orderId == "" {
		return 0, fmt.Errorf("orderId 为空")
	}

	setParts := []string{}
	args := []interface{}{}

	if v, ok := updates["status"]; ok {
		setParts = append(setParts, "status = ?")
		args = append(args, toString(v))
	}
	if v, ok := updates["endTime"]; ok {
		setParts = append(setParts, "end_time = ?")
		args = append(args, toString(v))
	}
	if v, ok := updates["passStations"]; ok {
		b, _ := json.Marshal(v)
		setParts = append(setParts, "pass_stations = ?")
		args = append(args, string(b))
	}
	if v, ok := updates["passVehicle"]; ok {
		b, _ := json.Marshal(v)
		setParts = append(setParts, "pass_vehicle = ?")
		args = append(args, string(b))
	}
	if v, ok := updates["passRoute"]; ok {
		b, _ := json.Marshal(v)
		setParts = append(setParts, "pass_route = ?")
		args = append(args, string(b))
	}
	if v, ok := updates["passGridMember"]; ok {
		b, _ := json.Marshal(v)
		setParts = append(setParts, "pass_grid_member = ?")
		args = append(args, string(b))
	}
	if v, ok := updates["note"]; ok {
		setParts = append(setParts, "note = ?")
		args = append(args, toString(v))
	}

	if len(setParts) == 0 {
		return 0, nil // 无更新字段
	}

	args = append(args, orderId)
	updateSQL := fmt.Sprintf("UPDATE orders SET %s WHERE order_id = ?", strings.Join(setParts, ", "))
	res, err := d.db.Exec(updateSQL, args...)
	if err != nil {
		return 0, err
	}
	ra, _ := res.RowsAffected()
	return ra, nil
}

// GetOrderByID 根据 order_id 查询订单详情，返回一个 map 表示原始字段
func (d *OrderDAO) GetOrderByID(orderId string) (map[string]interface{}, error) {
	query := `SELECT order_id, type, weight, sender, sender_phone, sender_address,
		addressee, addressee_phone, address, start_time, end_time, status,
		pass_stations, pass_vehicle, pass_route, pass_grid_member, note, created_at, updated_at
		FROM orders WHERE order_id = ? LIMIT 1`

	row := d.db.QueryRow(query, orderId)
	var orderID, sType, sender, senderPhone, senderAddress string
	var addressee, addresseePhone, address, startTime, endTime, status, passStations, passVehicle, passRoute, passGridMember, note string
	var weight sql.NullInt64
	var createdAt, updatedAt sql.NullString

	err := row.Scan(&orderID, &sType, &weight, &sender, &senderPhone, &senderAddress,
		&addressee, &addresseePhone, &address, &startTime, &endTime, &status,
		&passStations, &passVehicle, &passRoute, &passGridMember, &note, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}

	out := map[string]interface{}{
		"orderId":        orderID,
		"type":           sType,
		"weight":         int(weight.Int64),
		"sender":         sender,
		"senderPhone":    senderPhone,
		"senderAddress":  senderAddress,
		"addressee":      addressee,
		"addresseePhone": addresseePhone,
		"address":        address,
		"startTime":      startTime,
		"endTime":        endTime,
		"status":         status,
		"note":           note,
	}

	// 反序列化 JSON 字段为 []string（容错）
	var tmp []string
	if passStations != "" {
		_ = json.Unmarshal([]byte(passStations), &tmp)
		out["passStations"] = tmp
	} else {
		out["passStations"] = []string{}
	}
	tmp = nil
	if passVehicle != "" {
		_ = json.Unmarshal([]byte(passVehicle), &tmp)
		out["passVehicle"] = tmp
	} else {
		out["passVehicle"] = []string{}
	}
	tmp = nil
	if passRoute != "" {
		_ = json.Unmarshal([]byte(passRoute), &tmp)
		out["passRoute"] = tmp
	} else {
		out["passRoute"] = []string{}
	}
	tmp = nil
	if passGridMember != "" {
		_ = json.Unmarshal([]byte(passGridMember), &tmp)
		out["passGridMember"] = tmp
	} else {
		out["passGridMember"] = []string{}
	}

	return out, nil
}

// ListOrders 简单实现按部分字段匹配的批量查询（不做分页，返回所有匹配结果）
// 支持 filters 中的：startTime、endTime、status、stationId、vehicleId、routeId、gridMemberId
func (d *OrderDAO) ListOrders(filters map[string]string) ([]map[string]interface{}, error) {
	// 基本查询
	base := `SELECT order_id, type, weight, sender, sender_phone, sender_address,
		addressee, addressee_phone, address, start_time, end_time, status,
		pass_stations, pass_vehicle, pass_route, pass_grid_member, note
		FROM orders`
	where := []string{}
	args := []interface{}{}

	if v, ok := filters["status"]; ok && v != "" {
		where = append(where, "status = ?")
		args = append(args, v)
	}
	if v, ok := filters["startTime"]; ok && v != "" {
		where = append(where, "start_time >= ?")
		args = append(args, v)
	}
	if v, ok := filters["endTime"]; ok && v != "" {
		where = append(where, "end_time <= ?")
		args = append(args, v)
	}
	// 对于 stationId/vehicleId/routeId/gridMemberId，因我们未在表中单独列出这些字段，
	// 我们使用 LIKE 匹配 pass_stations/pass_vehicle/pass_route/pass_grid_member
	if v, ok := filters["stationId"]; ok && v != "" {
		where = append(where, "pass_stations LIKE ?")
		args = append(args, "%"+v+"%")
	}
	if v, ok := filters["vehicleId"]; ok && v != "" {
		where = append(where, "pass_vehicle LIKE ?")
		args = append(args, "%"+v+"%")
	}
	if v, ok := filters["routeId"]; ok && v != "" {
		where = append(where, "pass_route LIKE ?")
		args = append(args, "%"+v+"%")
	}
	if v, ok := filters["gridMemberId"]; ok && v != "" {
		where = append(where, "pass_grid_member LIKE ?")
		args = append(args, "%"+v+"%")
	}

	final := base
	if len(where) > 0 {
		final = final + " WHERE " + strings.Join(where, " AND ")
	}

	rows, err := d.db.Query(final, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := []map[string]interface{}{}
	for rows.Next() {
		var orderID, sType, sender, senderPhone, senderAddress string
		var addressee, addresseePhone, address, startTime, endTime, status, passStations, passVehicle, passRoute, passGridMember, note string
		var weight sql.NullInt64
		if err := rows.Scan(&orderID, &sType, &weight, &sender, &senderPhone, &senderAddress,
			&addressee, &addresseePhone, &address, &startTime, &endTime, &status,
			&passStations, &passVehicle, &passRoute, &passGridMember, &note); err != nil {
			continue
		}

		out := map[string]interface{}{
			"orderId":        orderID,
			"type":           sType,
			"weight":         int(weight.Int64),
			"sender":         sender,
			"senderPhone":    senderPhone,
			"senderAddress":  senderAddress,
			"addressee":      addressee,
			"addresseePhone": addresseePhone,
			"address":        address,
			"startTime":      startTime,
			"endTime":        endTime,
			"status":         status,
			"note":           note,
		}

		var tmp []string
		if passStations != "" {
			_ = json.Unmarshal([]byte(passStations), &tmp)
			out["passStations"] = tmp
		} else {
			out["passStations"] = []string{}
		}
		tmp = nil
		if passVehicle != "" {
			_ = json.Unmarshal([]byte(passVehicle), &tmp)
			out["passVehicle"] = tmp
		} else {
			out["passVehicle"] = []string{}
		}
		tmp = nil
		if passRoute != "" {
			_ = json.Unmarshal([]byte(passRoute), &tmp)
			out["passRoute"] = tmp
		} else {
			out["passRoute"] = []string{}
		}
		tmp = nil
		if passGridMember != "" {
			_ = json.Unmarshal([]byte(passGridMember), &tmp)
			out["passGridMember"] = tmp
		} else {
			out["passGridMember"] = []string{}
		}

		results = append(results, out)
	}

	return results, nil
}

// DeleteOrder 根据 order_id 删除订单记录
func (d *OrderDAO) DeleteOrder(orderId string) (rowsAffected int64, err error) {
	if orderId == "" {
		return 0, fmt.Errorf("orderId 为空")
	}
	res, err := d.db.Exec("DELETE FROM orders WHERE order_id = ?", orderId)
	if err != nil {
		return 0, err
	}
	ra, _ := res.RowsAffected()
	return ra, nil
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
