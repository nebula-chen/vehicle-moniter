package dao

import (
	"database/sql"
	"fmt"
	"time"
)

type MySQLDao struct {
	DB *sql.DB
}

func NewMySQLDao(db *sql.DB) *MySQLDao { return &MySQLDao{DB: db} }

// BatchInsertRecords 批量插入 vehicle_records（在事务中）
func (d *MySQLDao) BatchInsertRecords(records []struct {
	VehicleId string
	Timestamp time.Time
	Lon, Lat  int64
	Velocity  int
}) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao not initialized")
	}
	if len(records) == 0 {
		return nil
	}
	tx, err := d.DB.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`INSERT IGNORE INTO vehicle_records (vehicle_id, timestamp, longitude, latitude, velocity, extra) VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, r := range records {
		if _, err := stmt.Exec(r.VehicleId, r.Timestamp, r.Lon, r.Lat, r.Velocity, nil); err != nil {
			// log and continue
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// InsertVehicle 插入一条 vehicle_list 记录（静态设备信息）
// 注意：vtype、totalCapacity、batteryInfo 使用 int 类型
// extra 字段为纯文本备注，不再存储为 JSON
func (d *MySQLDao) InsertVehicle(vehicleId, plateNumber string, vtype, totalCapacity, batteryInfo int, routeId, status string, extra string) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao not initialized")
	}
	_, err := d.DB.Exec(`INSERT INTO vehicle_list (vehicle_id, plate_number, type, total_capacity, battery_info, route_id, status, extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, vehicleId, plateNumber, vtype, totalCapacity, batteryInfo, routeId, status, extra)
	return err
}

// GetVehicleByID 返回指定 vehicle_id 的记录
func (d *MySQLDao) GetVehicleByID(vehicleId string) (map[string]interface{}, error) {
	if d == nil || d.DB == nil {
		return nil, fmt.Errorf("mysql dao not initialized")
	}
	row := d.DB.QueryRow(`SELECT id, vehicle_id, plate_number, type, total_capacity, battery_info, route_id, status, extra, created_at, updated_at FROM vehicle_list WHERE vehicle_id = ?`, vehicleId)
	var id int
	var vid, plate, route, status, extra string
	var vtype sql.NullInt64
	var cap sql.NullInt64
	var battery sql.NullInt64
	var createdAt, updatedAt time.Time
	if err := row.Scan(&id, &vid, &plate, &vtype, &cap, &battery, &route, &status, &extra, &createdAt, &updatedAt); err != nil {
		return nil, err
	}
	// 将可能为 NULL 的 int 转为字符串或 0
	typeStr := ""
	if vtype.Valid {
		typeStr = fmt.Sprintf("%d", vtype.Int64)
	}
	capStr := ""
	if cap.Valid {
		capStr = fmt.Sprintf("%d", cap.Int64)
	}
	batteryStr := ""
	if battery.Valid {
		batteryStr = fmt.Sprintf("%d", battery.Int64)
	}
	out := map[string]interface{}{
		"id":            id,
		"vehicleId":     vid,
		"plateNumber":   plate,
		"type":          typeStr,
		"totalCapacity": capStr,
		"batteryInfo":   batteryStr,
		"routeId":       route,
		"status":        status,
		"extra":         extra,
		"createdAt":     createdAt.UTC().Format(time.RFC3339),
		"updatedAt":     updatedAt.UTC().Format(time.RFC3339),
	}
	return out, nil
}

// UpdateVehicle 更新 vehicle_list 中的记录（只更新可变字段）
// extra 字段为纯文本备注，不再存储为 JSON
func (d *MySQLDao) UpdateVehicle(vehicleId, plateNumber string, vtype, totalCapacity, batteryInfo int, routeId, status string, extra string) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao not initialized")
	}
	_, err := d.DB.Exec(`UPDATE vehicle_list SET plate_number=?, type=?, total_capacity=?, battery_info=?, route_id=?, status=?, extra=? WHERE vehicle_id=?`, plateNumber, vtype, totalCapacity, batteryInfo, routeId, status, extra, vehicleId)
	return err
}

// UpdateVehiclePartial 根据传入的列进行部分更新，cols 是列->值的映射
func (d *MySQLDao) UpdateVehiclePartial(vehicleId string, cols map[string]interface{}) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao not initialized")
	}
	if len(cols) == 0 {
		return nil
	}
	// 构建 SET 子句和参数列表
	setParts := make([]string, 0, len(cols))
	args := make([]interface{}, 0, len(cols)+1)
	for k, v := range cols {
		setParts = append(setParts, fmt.Sprintf("%s = ?", k))
		args = append(args, v)
	}
	// 最后为 WHERE 的 vehicle_id
	args = append(args, vehicleId)
	query := fmt.Sprintf("UPDATE vehicle_list SET %s WHERE vehicle_id = ?", joinStrings(setParts, ", "))
	_, err := d.DB.Exec(query, args...)
	return err
}

// joinStrings is a tiny helper to avoid importing strings package multiple times
func joinStrings(arr []string, sep string) string {
	if len(arr) == 0 {
		return ""
	}
	out := arr[0]
	for i := 1; i < len(arr); i++ {
		out += sep + arr[i]
	}
	return out
}

// DeleteVehicle 删除指定 vehicle_id 的记录
func (d *MySQLDao) DeleteVehicle(vehicleId string) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao not initialized")
	}
	_, err := d.DB.Exec(`DELETE FROM vehicle_list WHERE vehicle_id = ?`, vehicleId)
	return err
}

// ListVehicles 列出所有车辆静态信息（分页参数可后续添加）
func (d *MySQLDao) ListVehicles() ([]map[string]interface{}, error) {
	if d == nil || d.DB == nil {
		return nil, fmt.Errorf("mysql dao not initialized")
	}
	rows, err := d.DB.Query(`SELECT id, vehicle_id, plate_number, type, total_capacity, battery_info, route_id, status, extra, created_at, updated_at FROM vehicle_list ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id int
		var vid, plate, route, status, extra string
		var vtype sql.NullInt64
		var cap sql.NullInt64
		var battery sql.NullInt64
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &vid, &plate, &vtype, &cap, &battery, &route, &status, &extra, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		typeStr := ""
		if vtype.Valid {
			typeStr = fmt.Sprintf("%d", vtype.Int64)
		}
		capStr := ""
		if cap.Valid {
			capStr = fmt.Sprintf("%d", cap.Int64)
		}
		batteryStr := ""
		if battery.Valid {
			batteryStr = fmt.Sprintf("%d", battery.Int64)
		}
		out = append(out, map[string]interface{}{
			"id":            id,
			"vehicleId":     vid,
			"plateNumber":   plate,
			"type":          typeStr,
			"totalCapacity": capStr,
			"batteryInfo":   batteryStr,
			"routeId":       route,
			"status":        status,
			"extra":         extra,
			"createdAt":     createdAt.UTC().Format(time.RFC3339),
			"updatedAt":     updatedAt.UTC().Format(time.RFC3339),
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// SaveTaskAndPoints 保存一次任务记录及其轨迹点（在事务中）
func (d *MySQLDao) SaveTaskAndPoints(task struct {
	TaskId    string
	VehicleId string
	StartTime time.Time
	EndTime   time.Time
	StartLon  int64
	StartLat  int64
	EndLon    int64
	EndLat    int64
	Status    string
}, points []struct {
	Timestamp time.Time
	Lon       int64
	Lat       int64
	Velocity  int
}) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao not initialized")
	}
	tx, err := d.DB.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	// 插入 task_records
	_, err = tx.Exec(`INSERT INTO task_records (task_id, vehicle_id, start_time, end_time, start_lon, start_lat, end_lon, end_lat, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		task.TaskId, task.VehicleId, task.StartTime, task.EndTime, task.StartLon, task.StartLat, task.EndLon, task.EndLat, task.Status)
	if err != nil {
		tx.Rollback()
		return err
	}

	if len(points) > 0 {
		// 批量插入轨迹点
		query := `INSERT INTO task_track_points (task_id, timestamp, longitude, latitude, velocity) VALUES `
		vals := []interface{}{}
		for _, p := range points {
			query += `(?, ?, ?, ?, ?),`
			vals = append(vals, task.TaskId, p.Timestamp, p.Lon, p.Lat, p.Velocity)
		}
		query = query[:len(query)-1]
		_, err = tx.Exec(query, vals...)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}
