package dao

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"orders-api/internal/types"
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
	endTime := toString(raw["endTime"])
	status := toString(raw["status"])
	note := toString(raw["note"])

	insertSQL := `INSERT INTO orders (
		order_id, type, weight, sender, sender_phone, sender_address,
		addressee, addressee_phone, address, end_time, status,
		pass_stations, pass_vehicle, pass_route, pass_grid_member, note
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := d.db.Exec(insertSQL,
		orderId, sType, weight, sender, senderPhone, senderAddress,
		addressee, addresseePhone, address, endTime, status,
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
		addressee, addressee_phone, address, end_time, status,
		pass_stations, pass_vehicle, pass_route, pass_grid_member, note, created_at, updated_at
		FROM orders WHERE order_id = ? LIMIT 1`

	row := d.db.QueryRow(query, orderId)
	var orderID, sType, sender, senderPhone, senderAddress string
	var addressee, addresseePhone, address, endTime, status, passStations, passVehicle, passRoute, passGridMember, note string
	var weight sql.NullInt64
	var createdAt, updatedAt sql.NullString

	err := row.Scan(&orderID, &sType, &weight, &sender, &senderPhone, &senderAddress,
		&addressee, &addresseePhone, &address, &endTime, &status,
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
		"endTime":        endTime,
		// createdAt 在数据库中为 TIMESTAMP 格式，返回给调用方作为 startTime 以便前端/统计使用
		"startTime": createdAt.String,
		"status":    status,
		"note":      note,
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
		addressee, addressee_phone, address, created_at, end_time, status,
		pass_stations, pass_vehicle, pass_route, pass_grid_member, note
		FROM orders`
	where := []string{}
	args := []interface{}{}

	if v, ok := filters["status"]; ok && v != "" {
		where = append(where, "status = ?")
		args = append(args, v)
	}
	if v, ok := filters["startTime"]; ok && v != "" {
		if ts, err := parseFlexibleTime(v); err == nil {
			where = append(where, "created_at >= ?")
			args = append(args, ts)
		}
	}
	if v, ok := filters["endTime"]; ok && v != "" {
		if ts, err := parseFlexibleTime(v); err == nil {
			where = append(where, "created_at <= ?")
			args = append(args, ts)
		}
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
		var addressee, addresseePhone, address, endTime, status, passStations, passVehicle, passRoute, passGridMember, note string
		var weight sql.NullInt64
		var createdAt sql.NullString
		if err := rows.Scan(&orderID, &sType, &weight, &sender, &senderPhone, &senderAddress,
			&addressee, &addresseePhone, &address, &createdAt, &endTime, &status,
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

// Stats 在数据库层进行聚合统计，返回按年/月/日的总量以及按类型分解的时间序列统计，实际实现委托给 StatsWithOptions（保留向后兼容）
func (d *OrderDAO) Stats() (*types.StatsResp, error) {
	return d.StatsWithOptions("", 0, "", "")
}

// StatsWithOptions 在数据库层执行聚合，支持：
// - mode: "year"|"month"|"day"（空表示返回所有三种）
// - limit: 当 limit>0 时，针对所选 mode 仅返回最近 limit 个时间桶（按时间降序选择），以减小返回量（适用于数据量大时）
// - start/end: 可选的时间窗口，支持多种时间格式（使用 parseFlexibleTime 解析），当非空时用于 WHERE created_at BETWEEN start AND end
func (d *OrderDAO) StatsWithOptions(mode string, limit int, start string, end string) (*types.StatsResp, error) {
	resp := &types.StatsResp{
		ZoneCountTable:     map[string]types.ZoneCount{},
		TotalCountWithTime: types.TimeSeriesStats{},
		TypeCount:          map[string]types.TimeSeriesStats{},
	}

	// 构建时间范围 WHERE 子句参数
	whereParts := []string{"created_at IS NOT NULL"}
	args := []interface{}{}
	if start != "" {
		if ts, err := parseFlexibleTime(start); err == nil {
			whereParts = append(whereParts, "created_at >= ?")
			args = append(args, ts)
		}
	}
	if end != "" {
		if ts, err := parseFlexibleTime(end); err == nil {
			whereParts = append(whereParts, "created_at <= ?")
			args = append(args, ts)
		}
	}
	whereBase := "WHERE " + strings.Join(whereParts, " AND ")

	// -----------------------------
	// 额外统计：总数 / 当日 / 快递 / 城配 / 按片区拆分的 ZoneCountTable
	// -----------------------------
	// 1) TotalCount: 在 whereBase 范围内的总订单数
	// 2) TodayCount: 当天（本地时区）创建的订单数（独立于 start/end）
	// 3) ExpressCount / CityCount: 基于地址与 type 的简单启发式分类
	// 4) ZoneCountTable: 根据收件地址解析片区（例如包含“区/市/县/镇/街道”的词）进行分桶，并统计每个分桶中各类数量

	// zone 提取辅助：尝试匹配诸如 xx区/xx市/xx县/xx镇/xx街道 的片区词，否则取地址前 6 个字符作为兜底，空值返回 "未知"
	zoneRe := regexp.MustCompile(`([^,，\s]+(?:区|市|县|镇|街道))`)
	extractZone := func(addr string) string {
		addr = strings.TrimSpace(addr)
		if addr == "" {
			return "未知"
		}
		if m := zoneRe.FindStringSubmatch(addr); len(m) >= 2 {
			return m[1]
		}
		// 兜底：取前 6 个字符（防止过短），并去掉空白
		r := []rune(addr)
		if len(r) <= 6 {
			return addr
		}
		return string(r[:6])
	}

	// 分类辅助：判断是否城配（city）或快递（express）的启发式规则
	isCityAddr := func(addr string, typ string) bool {
		a := strings.ToLower(addr)
		t := strings.ToLower(typ)
		// 如果类型包含城配或地址明显表示市内/城区，则视为城配
		if strings.Contains(t, "城配") || strings.Contains(a, "市内") || strings.Contains(a, "城区") || strings.Contains(a, "市中心") {
			return true
		}
		// 含有区/市/县等并且地址较短（可能为市内地址），也视为城配
		if (strings.Contains(a, "区") || strings.Contains(a, "市") || strings.Contains(a, "县")) && len(a) < 30 {
			return true
		}
		return false
	}

	// 初始化计数变量和 Zone 表
	var totalCount int
	var todayCount int
	var expressCount int
	var cityCount int
	zoneTable := map[string]types.ZoneCount{}

	// 1) TotalCount：对所有记录计数（不受 start/end 过滤影响）
	if err := d.db.QueryRow("SELECT COUNT(*) FROM orders").Scan(&totalCount); err != nil {
		totalCount = 0
	}
	resp.TotalCount = totalCount

	// 统计 TodayCount：使用数据库当前日期，计算当天 00:00 到次日 00:00 的范围（不受 start/end 影响）
	if err := d.db.QueryRow("SELECT COUNT(*) FROM orders WHERE created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY").Scan(&todayCount); err != nil {
		todayCount = 0
	}
	resp.TodayCount = todayCount

	// 3) 状态汇总（已完成 / 未完成 / 异常）——对所有记录进行统计，不受 start/end 影响
	// 我们先按 status 聚合，然后映射到三类
	statusRows, err := d.db.Query("SELECT IFNULL(status, ''), COUNT(*) FROM orders GROUP BY status")
	if err == nil {
		defer statusRows.Close()
		var s string
		var cnt int
		for statusRows.Next() {
			if err := statusRows.Scan(&s, &cnt); err != nil {
				continue
			}
			ls := strings.TrimSpace(s)
			switch ls {
			case "已完成", "已取消":
				resp.CompletedCount += cnt
			case "异常":
				resp.AbnormalCount += cnt
			default:
				// 将运输中/待取件/空值等视为未完成
				resp.IncompleteCount += cnt
			}
		}
	}

	// 4) Express / City / Zone 表：也使用全量数据（不受 start/end 影响），以便前端显示总体分布
	qAll := "SELECT created_at, address, `type` FROM orders"
	rowsAll, err := d.db.Query(qAll)
	if err == nil {
		defer rowsAll.Close()
		for rowsAll.Next() {
			var createdAt sql.NullString
			var address sql.NullString
			var tp sql.NullString
			if err := rowsAll.Scan(&createdAt, &address, &tp); err != nil {
				continue
			}
			addr := ""
			if address.Valid {
				addr = address.String
			}
			typ := ""
			if tp.Valid {
				typ = tp.String
			}

			zone := extractZone(addr)
			z := zoneTable[zone]

			// 判断类别：冷藏/冷冻/特快/普通（严格区分冷藏与冷冻）
			lowType := strings.ToLower(typ)
			if strings.Contains(lowType, "冷冻") {
				z.Frozen++
			} else if strings.Contains(lowType, "冷藏") {
				z.Cold++
			} else if strings.Contains(lowType, "特") || strings.Contains(lowType, "急") {
				z.Urgent++
			} else {
				z.Normal++
			}

			// 城配 vs 快递 判定
			if isCityAddr(addr, typ) {
				z.City++
				cityCount++
			} else {
				z.Express++
				expressCount++
			}

			zoneTable[zone] = z
		}
	}

	resp.ExpressCount = expressCount
	resp.CityCount = cityCount
	resp.ZoneCountTable = zoneTable

	// 帮助函数：按格式获取最近的 limit 个日期字符串（降序 -> 返回升序结果）
	getRecentDates := func(dateFormat string) ([]string, error) {
		if limit <= 0 {
			return nil, nil
		}
		q := fmt.Sprintf("SELECT DISTINCT DATE_FORMAT(created_at, '%s') AS date FROM orders %s ORDER BY date DESC LIMIT %d", dateFormat, whereBase, limit)
		rows, err := d.db.Query(q, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		tmp := []string{}
		for rows.Next() {
			var date string
			if err := rows.Scan(&date); err != nil {
				return nil, err
			}
			tmp = append(tmp, date)
		}
		// tmp currently descending, reverse to ascending for presentation
		for i, j := 0, len(tmp)-1; i < j; i, j = i+1, j-1 {
			tmp[i], tmp[j] = tmp[j], tmp[i]
		}
		return tmp, nil
	}

	// 执行总量统计的通用逻辑
	runTotal := func(dateFmt string, dateExpr string) ([]types.DateCount, error) {
		// 若 limit>0，先找到需要的日期集合
		dates, err := getRecentDates(dateFmt)
		if err != nil {
			return nil, err
		}
		var q string
		var qArgs []interface{}
		if len(dates) > 0 {
			// 使用 IN (...) 过滤
			placeholders := strings.Repeat("?,", len(dates))
			placeholders = strings.TrimRight(placeholders, ",")
			q = fmt.Sprintf("SELECT %s AS date, COUNT(*) AS cnt FROM orders %s AND %s IN (%s) GROUP BY date ORDER BY date", dateExpr, whereBase, dateExpr, placeholders)
			qArgs = append(qArgs, args...)
			for _, d := range dates {
				qArgs = append(qArgs, d)
			}
		} else {
			q = fmt.Sprintf("SELECT %s AS date, COUNT(*) AS cnt FROM orders %s GROUP BY date ORDER BY date", dateExpr, whereBase)
			qArgs = args
		}
		rows, err := d.db.Query(q, qArgs...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []types.DateCount{}
		for rows.Next() {
			var date string
			var cnt int
			if err := rows.Scan(&date, &cnt); err != nil {
				return nil, err
			}
			out = append(out, types.DateCount{Date: date, Count: cnt})
		}
		return out, nil
	}

	// 执行按类型统计的通用逻辑
	runType := func(dateFmt string, dateExpr string) (map[string]map[string]int, error) {
		dates, err := getRecentDates(dateFmt)
		if err != nil {
			return nil, err
		}
		var q string
		var qArgs []interface{}
		if len(dates) > 0 {
			placeholders := strings.Repeat("?,", len(dates))
			placeholders = strings.TrimRight(placeholders, ",")
			q = fmt.Sprintf("SELECT `type`, %s AS date, COUNT(*) AS cnt FROM orders %s AND %s IN (%s) GROUP BY `type`, date ORDER BY `type`, date", dateExpr, whereBase, dateExpr, placeholders)
			qArgs = append(qArgs, args...)
			for _, d := range dates {
				qArgs = append(qArgs, d)
			}
		} else {
			q = fmt.Sprintf("SELECT `type`, %s AS date, COUNT(*) AS cnt FROM orders %s GROUP BY `type`, date ORDER BY `type`, date", dateExpr, whereBase)
			qArgs = args
		}
		rows, err := d.db.Query(q, qArgs...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		target := map[string]map[string]int{}
		for rows.Next() {
			var tp string
			var date string
			var cnt int
			if err := rows.Scan(&tp, &date, &cnt); err != nil {
				return nil, err
			}
			if tp == "" {
				tp = "未知"
			}
			if _, ok := target[tp]; !ok {
				target[tp] = map[string]int{}
			}
			target[tp][date] += cnt
		}
		return target, nil
	}

	// 将 map[string]int 转为排序的 []DateCount
	mapToSorted := func(m map[string]int) []types.DateCount {
		if len(m) == 0 {
			return []types.DateCount{}
		}
		keys := make([]string, 0, len(m))
		for k := range m {
			keys = append(keys, k)
		}
		sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
		out := make([]types.DateCount, 0, len(keys))
		for _, k := range keys {
			out = append(out, types.DateCount{Date: k, Count: m[k]})
		}
		return out
	}

	// 处理不同粒度：year/month/day 或全部
	if mode == "" || mode == "year" {
		ys, err := runTotal("%Y", "DATE_FORMAT(created_at, '%Y')")
		if err != nil {
			return resp, err
		}
		resp.TotalCountWithTime.YearStats = ys
	}
	if mode == "" || mode == "month" {
		ms, err := runTotal("%Y-%m", "DATE_FORMAT(created_at, '%Y-%m')")
		if err != nil {
			return resp, err
		}
		resp.TotalCountWithTime.MonthStats = ms
	}
	if mode == "" || mode == "day" {
		ds, err := runTotal("%Y-%m-%d", "DATE_FORMAT(created_at, '%Y-%m-%d')")
		if err != nil {
			return resp, err
		}
		resp.TotalCountWithTime.DayStats = ds
	}

	// 按类型
	if mode == "" || mode == "year" {
		ty, err := runType("%Y", "DATE_FORMAT(created_at, '%Y')")
		if err != nil {
			return resp, err
		}
		// map -> TimeSeriesStats
		for tp, m := range ty {
			ts := resp.TypeCount[tp]
			ts.YearStats = mapToSorted(m)
			resp.TypeCount[tp] = ts
		}
	}
	if mode == "" || mode == "month" {
		tm, err := runType("%Y-%m", "DATE_FORMAT(created_at, '%Y-%m')")
		if err != nil {
			return resp, err
		}
		for tp, m := range tm {
			ts := resp.TypeCount[tp]
			ts.MonthStats = mapToSorted(m)
			resp.TypeCount[tp] = ts
		}
	}
	if mode == "" || mode == "day" {
		td, err := runType("%Y-%m-%d", "DATE_FORMAT(created_at, '%Y-%m-%d')")
		if err != nil {
			return resp, err
		}
		for tp, m := range td {
			ts := resp.TypeCount[tp]
			ts.DayStats = mapToSorted(m)
			resp.TypeCount[tp] = ts
		}
	}

	return resp, nil
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

// parseFlexibleTime 尝试使用多种布局解析用户传入的时间字符串，返回标准化的 MySQL DATETIME 字符串
func parseFlexibleTime(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", fmt.Errorf("empty time string")
	}
	layouts := []string{
		"20060102150405",      // yyyymmddhhmmss
		"200601021504",        // yyyymmddhhmm
		"20060102",            // yyyymmdd
		"2006-01-02 15:04:05", // yyyy-mm-dd hh:mm:ss
		"2006-01-02 15:04",    // yyyy-mm-dd hh:mm
		time.RFC3339,          // ISO
		"2006-01-02",          // yyyy-mm-dd
	}
	loc := time.Local
	for _, l := range layouts {
		if t, err := time.ParseInLocation(l, s, loc); err == nil {
			return t.Format("2006-01-02 15:04:05"), nil
		}
	}
	// 作为兜底，提取字符串中的数字并尝试按 14 位解析
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, s)
	if len(digits) >= 14 {
		if t, err := time.ParseInLocation("20060102150405", digits[:14], loc); err == nil {
			return t.Format("2006-01-02 15:04:05"), nil
		}
	}
	if len(digits) == 8 {
		if t, err := time.ParseInLocation("20060102", digits, loc); err == nil {
			return t.Format("2006-01-02 15:04:05"), nil
		}
	}
	return "", fmt.Errorf("unrecognized time format: %s", s)
}
