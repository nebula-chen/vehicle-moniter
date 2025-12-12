package dao

import (
	"database/sql"
	"fmt"
	"time"
	"vehicle-api/internal/types"
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

// InsertVehicle 将一个 VehicleInfo 插入到 vehicle_list（使用新表结构）
// 入参使用 types.VehicleInfo，函数会将结构体字段写入对应的新列
func (d *MySQLDao) InsertVehicle(vehicle *types.VehicleInfo) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao not initialized")
	}
	if vehicle == nil {
		return fmt.Errorf("vehicle is nil")
	}
	_, err := d.DB.Exec(`INSERT INTO vehicle_list (
		vehicleId, plateNo, categoryCode, categoryName, vinCode,
		vehicleFactory, brand, size, autoLevel, vehicleCert,
		vehicleInspection, vehicleInvoice, oilConsumption, certNo, createTime
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		vehicle.VehicleId, vehicle.PlateNo, vehicle.CategoryCode, vehicle.CategoryName,
		vehicle.VinCode, vehicle.VehicleFactory, vehicle.Brand, vehicle.Size, vehicle.AutoLevel,
		vehicle.VehicleCert, vehicle.VehicleInspection, vehicle.VehicleInvoice, vehicle.OilConsumption,
		vehicle.CertNo, vehicle.CreateTime)
	return err
}

// GetVehicleByID 返回指定 vehicleId 的完整 VehicleInfo（使用新表结构）
func (d *MySQLDao) GetVehicleByID(vehicleId string) (*types.VehicleInfo, error) {
	if d == nil || d.DB == nil {
		return nil, fmt.Errorf("mysql dao not initialized")
	}
	row := d.DB.QueryRow(`SELECT 
		vehicleId, plateNo, categoryCode, categoryName, 
		vinCode, vehicleFactory, brand, size, autoLevel, 
		vehicleCert, vehicleInspection, vehicleInvoice, 
		oilConsumption, createTime, certNo 
		FROM vehicle_list WHERE vehicleId = ?`, vehicleId)

	var vi types.VehicleInfo
	if err := row.Scan(
		&vi.VehicleId, &vi.PlateNo, &vi.CategoryCode, &vi.CategoryName,
		&vi.VinCode, &vi.VehicleFactory, &vi.Brand, &vi.Size, &vi.AutoLevel,
		&vi.VehicleCert, &vi.VehicleInspection, &vi.VehicleInvoice,
		&vi.OilConsumption, &vi.CreateTime, &vi.CertNo); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &vi, nil
}

// UpdateVehicle 根据 types.VehicleInfo 更新 vehicle_list（按新表结构）
func (d *MySQLDao) UpdateVehicle(vehicle *types.VehicleInfo) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao not initialized")
	}
	if vehicle == nil {
		return fmt.Errorf("vehicle is nil")
	}
	_, err := d.DB.Exec(`UPDATE vehicle_list SET 
		plateNo = ?, categoryCode = ?, categoryName = ?, 
		vinCode = ?, vehicleFactory = ?, brand = ?, size = ?, autoLevel = ?, 
		vehicleCert = ?, vehicleInspection = ?, vehicleInvoice = ?, 
		oilConsumption = ?, certNo = ?, updatedTime = CURRENT_TIMESTAMP
		WHERE vehicleId = ?`,
		vehicle.PlateNo, vehicle.CategoryCode, vehicle.CategoryName,
		vehicle.VinCode, vehicle.VehicleFactory, vehicle.Brand, vehicle.Size, vehicle.AutoLevel,
		vehicle.VehicleCert, vehicle.VehicleInspection, vehicle.VehicleInvoice,
		vehicle.OilConsumption, vehicle.CertNo, vehicle.VehicleId)
	return err
}

// UpdateVehiclePartial 根据传入的列进行部分更新，cols 是列->值的映射
// 注意：cols 中的列名应为新表的列名（例如 plateNo, categoryCode 等）
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
	// 最后为 WHERE 的 vehicleId
	args = append(args, vehicleId)
	query := fmt.Sprintf("UPDATE vehicle_list SET %s WHERE vehicleId = ?", joinStrings(setParts, ", "))
	_, err := d.DB.Exec(query, args...)
	return err
}

// joinStrings 是一个小型辅助工具，用于避免多次导入 strings 包
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

// DeleteVehicle 删除指定 vehicleId 的记录（使用新表列名 vehicleId）
func (d *MySQLDao) DeleteVehicle(vehicleId string) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao not initialized")
	}
	_, err := d.DB.Exec(`DELETE FROM vehicle_list WHERE vehicleId = ?`, vehicleId)
	return err
}

// ListVehicles 列出所有车辆静态信息（返回 types.VehicleInfo 列表，使用新表结构）
func (d *MySQLDao) ListVehicles() ([]types.VehicleInfo, error) {
	if d == nil || d.DB == nil {
		return nil, fmt.Errorf("mysql dao not initialized")
	}
	rows, err := d.DB.Query(`SELECT 
		vehicleId, plateNo, categoryCode, categoryName, 
		vinCode, vehicleFactory, brand, size, autoLevel, 
		vehicleCert, vehicleInspection, vehicleInvoice, 
		oilConsumption, createTime, certNo
		FROM vehicle_list ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]types.VehicleInfo, 0)
	for rows.Next() {
		var vi types.VehicleInfo
		if err := rows.Scan(
			&vi.VehicleId, &vi.PlateNo, &vi.CategoryCode, &vi.CategoryName,
			&vi.VinCode, &vi.VehicleFactory, &vi.Brand, &vi.Size, &vi.AutoLevel,
			&vi.VehicleCert, &vi.VehicleInspection, &vi.VehicleInvoice,
			&vi.OilConsumption, &vi.CreateTime, &vi.CertNo); err != nil {
			return nil, err
		}
		out = append(out, vi)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// SaveTrajectoryAndPoints 保存单条 Trajectory（task_records）以及其 PositionPoints 到 task_track_points。
// 行为说明（中文）：
// - 根据传入的 types.Trajectory 的 RouteId 执行 upsert（存在则更新）到 `task_records`。
// - 清理该 routeId 在 `task_track_points` 中的旧轨迹点（避免重复），然后批量插入新的轨迹点。
// - PositionPoint 中的 Longitude/Latitude 为 int64（已乘 1e7），此处会转换为浮点经纬度（除以 1e7）。
// - PositionPoint.Timestamp 为 RFC3339 字符串，转换为毫秒时间戳（BIGINT 存储）。
// - 所有数据库操作在一个事务中完成，发生错误时回滚。
func (d *MySQLDao) SaveTrajectoryAndPoints(traj *types.Trajectory) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao not initialized")
	}
	if traj == nil {
		return fmt.Errorf("trajectory is nil")
	}

	tx, err := d.DB.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	// 解析 start/end 时间（RFC3339），如果解析失败则使用 NULL
	var startTime interface{} = nil
	var endTime interface{} = nil
	if traj.StartTime != "" {
		if t, e := time.Parse(time.RFC3339, traj.StartTime); e == nil {
			startTime = t
		}
	}
	if traj.EndTime != "" {
		if t, e := time.Parse(time.RFC3339, traj.EndTime); e == nil {
			endTime = t
		}
	}

	// upsert 到 task_records（使用 routeId 作为唯一键，表中列名为 camelCase）
	upsertStmt := `INSERT INTO task_records (
		routeId, vehicleId, vin, plateNo, startTime, endTime,
		mileage, durationTime, autoMileage, autoDuration,
		autoMileageReal, autoDurationReal, vehicleFactory, vehicleFactoryName
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON DUPLICATE KEY UPDATE
		vehicleId=VALUES(vehicleId), vin=VALUES(vin), plateNo=VALUES(plateNo),
		startTime=VALUES(startTime), endTime=VALUES(endTime),
		mileage=VALUES(mileage), durationTime=VALUES(durationTime),
		autoMileage=VALUES(autoMileage), autoDuration=VALUES(autoDuration),
		autoMileageReal=VALUES(autoMileageReal), autoDurationReal=VALUES(autoDurationReal),
		vehicleFactory=VALUES(vehicleFactory), vehicleFactoryName=VALUES(vehicleFactoryName),
		updatedAt=CURRENT_TIMESTAMP`

	if _, err = tx.Exec(upsertStmt,
		traj.RouteId, traj.VehicleId, traj.Vin, traj.PlateNo, startTime, endTime,
		traj.Mileage, traj.DurationTime, traj.AutoMileage, traj.AutoDuration,
		traj.AutoMileageReal, traj.AutoDurationReal, traj.VehicleFactory, traj.VehicleFactoryName); err != nil {
		tx.Rollback()
		return err
	}

	// 清理旧轨迹点，防止重复写入（如果希望保留历史，可去掉这一步）
	if _, err = tx.Exec(`DELETE FROM task_track_points WHERE taskId = ?`, traj.RouteId); err != nil {
		tx.Rollback()
		return err
	}

	// 批量插入轨迹点（仅包含可用字段：task_id, vehicle_id, ts, lon, lat）
	if len(traj.PositionPoints) > 0 {
		// 由于表结构使用 camelCase，且 task_track_points 中没有 created_at 字段（按 autoMigrate 中定义），
		// 我们只插入存在的列：taskId, vehicleId, `timestamp`, lon, lat
		query := `INSERT INTO task_track_points (taskId, vehicleId, ` + "`timestamp`" + `, lon, lat) VALUES `
		vals := []interface{}{}
		for _, p := range traj.PositionPoints {
			// 解析 timestamp（RFC3339），若解析失败则跳过该点
			var tsMs int64 = 0
			if p.Timestamp != "" {
				if t, e := time.Parse(time.RFC3339, p.Timestamp); e == nil {
					tsMs = t.UnixNano() / int64(time.Millisecond)
				} else {
					// 尝试解析可能带时区偏移的时间
					if t2, e2 := time.Parse("2006-01-02T15:04:05.000Z07:00", p.Timestamp); e2 == nil {
						tsMs = t2.UnixNano() / int64(time.Millisecond)
					}
				}
			}
			if tsMs == 0 {
				// 如果没有可用时间戳则使用 NULL（存入 0）
				// 这里我们仍然写入记录，但 ts 字段为 0
			}
			// Longitude/Latitude 存储为 int64 (1e7)，转换为度
			lon := float64(p.Longitude) / 1e7
			lat := float64(p.Latitude) / 1e7
			query += `(?, ?, ?, ?, ?),`
			vals = append(vals, traj.RouteId, traj.VehicleId, tsMs, lon, lat)
		}
		// 去掉尾部逗号
		query = query[:len(query)-1]
		if _, err = tx.Exec(query, vals...); err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

// SaveTrajectories 批量保存多条 Trajectory（对每条调用 SaveTrajectoryAndPoints）
// 说明：简单实现，逐条在事务中保存；如果需要更高性能可改为跨多条的单次事务与更复杂的批量 SQL。
func (d *MySQLDao) SaveTrajectories(trajs []types.Trajectory) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao not initialized")
	}
	for i := range trajs {
		if err := d.SaveTrajectoryAndPoints(&trajs[i]); err != nil {
			return err
		}
	}
	return nil
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

// InsertOrUpdateVehicleFromAPI 从外部 API 获取的车辆信息进行插入或更新（严格按照新表结构）
// 如果车辆已存在（基于 vehicleId），则更新；不存在则插入新记录
func (d *MySQLDao) InsertOrUpdateVehicleFromAPI(vehicleInfo *types.VehicleInfo) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao not initialized")
	}
	if vehicleInfo == nil {
		return fmt.Errorf("vehicleInfo is nil")
	}

	// 检查车辆是否存在
	var exists int
	err := d.DB.QueryRow("SELECT COUNT(*) FROM vehicle_list WHERE vehicleId = ?", vehicleInfo.VehicleId).Scan(&exists)
	if err != nil {
		return err
	}

	if exists > 0 {
		// 更新现有车辆的云端信息（使用新列名）
		query := `UPDATE vehicle_list SET 
			plateNo = ?, categoryCode = ?, categoryName = ?, 
			vinCode = ?, vehicleFactory = ?, brand = ?, 
			size = ?, autoLevel = ?, vehicleCert = ?, 
			vehicleInspection = ?, vehicleInvoice = ?, 
			oilConsumption = ?, certNo = ?, createTime = ?, 
			updatedTime = CURRENT_TIMESTAMP 
			WHERE vehicleId = ?`
		_, err := d.DB.Exec(query,
			vehicleInfo.PlateNo, vehicleInfo.CategoryCode, vehicleInfo.CategoryName,
			vehicleInfo.VinCode, vehicleInfo.VehicleFactory, vehicleInfo.Brand,
			vehicleInfo.Size, vehicleInfo.AutoLevel, vehicleInfo.VehicleCert,
			vehicleInfo.VehicleInspection, vehicleInfo.VehicleInvoice,
			vehicleInfo.OilConsumption, vehicleInfo.CertNo, vehicleInfo.CreateTime,
			vehicleInfo.VehicleId)
		return err
	} else {
		// 插入新车辆（使用新列名）
		query := `INSERT INTO vehicle_list 
			(vehicleId, plateNo, categoryCode, categoryName, 
			vinCode, vehicleFactory, brand, size, autoLevel, 
			vehicleCert, vehicleInspection, vehicleInvoice, 
			oilConsumption, certNo, createTime, updatedTime) 
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
		_, err := d.DB.Exec(query,
			vehicleInfo.VehicleId, vehicleInfo.PlateNo, vehicleInfo.CategoryCode, vehicleInfo.CategoryName,
			vehicleInfo.VinCode, vehicleInfo.VehicleFactory, vehicleInfo.Brand, vehicleInfo.Size, vehicleInfo.AutoLevel,
			vehicleInfo.VehicleCert, vehicleInfo.VehicleInspection, vehicleInfo.VehicleInvoice,
			vehicleInfo.OilConsumption, vehicleInfo.CertNo, vehicleInfo.CreateTime)
		return err
	}
}

// GetVehicleInfoByID 从vehicle_list获取完整的VehicleInfo
func (d *MySQLDao) GetVehicleInfoByID(vehicleID string) (*types.VehicleInfo, error) {
	if d == nil || d.DB == nil {
		return nil, fmt.Errorf("mysql dao not initialized")
	}
	// 使用新列名查询 vehicle_list
	row := d.DB.QueryRow(`SELECT 
		vehicleId, plateNo, categoryCode, categoryName, 
		vinCode, vehicleFactory, brand, size, autoLevel, 
		vehicleCert, vehicleInspection, vehicleInvoice, 
		oilConsumption, createTime, certNo 
		FROM vehicle_list WHERE vehicleId = ?`, vehicleID)

	var vehicleInfo types.VehicleInfo
	err := row.Scan(
		&vehicleInfo.VehicleId, &vehicleInfo.PlateNo, &vehicleInfo.CategoryCode, &vehicleInfo.CategoryName,
		&vehicleInfo.VinCode, &vehicleInfo.VehicleFactory, &vehicleInfo.Brand, &vehicleInfo.Size, &vehicleInfo.AutoLevel,
		&vehicleInfo.VehicleCert, &vehicleInfo.VehicleInspection, &vehicleInfo.VehicleInvoice,
		&vehicleInfo.OilConsumption, &vehicleInfo.CreateTime, &vehicleInfo.CertNo)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &vehicleInfo, nil
}
