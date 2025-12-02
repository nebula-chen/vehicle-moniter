package processor

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"vehicle-api/internal/dao"
	"vehicle-api/internal/types"
	"vehicle-api/internal/websocket"

	"github.com/zeromicro/go-zero/core/logx"
)

// Processor 负责处理来自VehicleState API的状态并将其持久化到数据库
type Processor interface {
	// ProcessState: 仅将状态写入 MySQL（现为内部调用）
	ProcessState(state *types.VehicleStateData) error
	// ProcessAndPublish: 将状态写入 MySQL、Influx，并广播到 WebSocket，
	// 以及在 MySQL 中记录未注册车辆（如果提供 db）。
	ProcessAndPublish(state *types.VehicleStateData, influx *dao.InfluxDao, hub *websocket.Hub, db *sql.DB) error
}

// DefaultProcessor 默认实现，使用 MySQLDao 进行写入
type DefaultProcessor struct {
	MySQL *dao.MySQLDao
	// per-vehicle 缓存最后一次状态，用于去重
	lastStates sync.Map // map[string]types.VehicleStateData
}

func NewDefaultProcessor(mysqlDao *dao.MySQLDao) *DefaultProcessor {
	return &DefaultProcessor{MySQL: mysqlDao}
}

// ProcessState 处理车辆状态数据
// 将车辆状态写入MySQL进行持久化
func (p *DefaultProcessor) ProcessState(state *types.VehicleStateData) error {
	if p == nil || p.MySQL == nil || state == nil {
		return nil
	}

	// 基本校验
	if state.VehicleId == "" {
		return fmt.Errorf("empty vehicle id")
	}

	// 记录接收的状态
	logx.Debugf("Processor 处理状态 vehicle=%s ts=%d lon=%.6f lat=%.6f speed=%.2f",
		state.VehicleId, state.Timestamp, state.Lon, state.Lat, state.Speed)

	// 检查是否为重复数据（用于去重）
	key := state.VehicleId
	if lastState, ok := p.lastStates.Load(key); ok {
		if last, ok := lastState.(types.VehicleStateData); ok {
			// 如果时间戳相同，说明是重复数据，跳过处理
			if last.Timestamp == state.Timestamp {
				logx.Debugf("跳过重复数据 vehicle=%s ts=%d", state.VehicleId, state.Timestamp)
				return nil
			}
		}
	}
	p.lastStates.Store(key, *state)

	// 将状态信息写入MySQL
	record := struct {
		VehicleId string
		Timestamp time.Time
		Lon       int64
		Lat       int64
		Velocity  int
	}{
		VehicleId: state.VehicleId,
		Timestamp: time.UnixMilli(int64(state.Timestamp)).UTC(),
		Lon:       int64(state.Lon * 1e7), // 转换为1e7倍数
		Lat:       int64(state.Lat * 1e7),
		Velocity:  int(state.Speed),
	}

	if err := p.MySQL.BatchInsertRecords([]struct {
		VehicleId string
		Timestamp time.Time
		Lon       int64
		Lat       int64
		Velocity  int
	}{record}); err != nil {
		logx.Errorf("保存状态记录失败 vehicle=%s: %v", state.VehicleId, err)
		return fmt.Errorf("save state failed: %w", err)
	}

	logx.Debugf("状态记录保存成功 vehicle=%s ts=%d", state.VehicleId, state.Timestamp)
	return nil
}

// ProcessAndPublish 将 VehicleStateData 写入 MySQL（使用 ProcessState）、写入 Influx（如果提供），
// 并向 WebSocket hub 广播（如果提供）。
// 为了避免和 svc 包产生循环依赖，hub 和 db 使用 interface{} 类型并进行运行时断言：
// - influx: *dao.InfluxDao
// - hub: *websocket.Hub (or nil)
// - db: *sql.DB (or nil)
func (p *DefaultProcessor) ProcessAndPublish(state *types.VehicleStateData, influx *dao.InfluxDao, hub *websocket.Hub, db *sql.DB) error {
	if p == nil || state == nil {
		return nil
	}

	// 1) 持久化到 MySQL
	if err := p.ProcessState(state); err != nil {
		logx.Errorf("Processor ProcessState error: %v", err)
		// 不阻断后续操作，记录错误即可
	}

	// 2) 写入 Influx
	if influx != nil {
		pnt, err := influx.BuildPoint(state)
		if err != nil {
			logx.Errorf("构建 Influx 点失败: %v", err)
		} else {
			// 使用 InfluxDao 封装的 AddPoint（内部会调用 WriteAPI.WritePoint）
			if err := influx.AddPoint(pnt); err != nil {
				logx.Errorf("Influx 写入失败: %v", err)
			}
		}
	}

	// 3) 广播到 WebSocket（如果提供 hub）
	if hub != nil {
		payload := map[string]interface{}{
			"vehicleId": state.VehicleId,
			"timestamp": state.Timestamp,
			"lon":       state.Lon,
			"lat":       state.Lat,
			"speed":     state.Speed,
			"heading":   state.Heading,
			"driveMode": state.DriveMode,
		}
		if db != nil {
			var staticInfo struct {
				PlateNo        sql.NullString
				CategoryCode   sql.NullInt64
				VinCode        sql.NullString
				Brand          sql.NullString
				VehicleFactory sql.NullString
				CertNo         sql.NullString
				VehicleInvoice sql.NullString
			}
			if err := db.QueryRow("SELECT plateNo, categoryCode, vinCode, brand, vehicleFactory, certNo, vehicleInvoice FROM vehicle_list WHERE vehicleId = ?", state.VehicleId).Scan(&staticInfo.PlateNo, &staticInfo.CategoryCode, &staticInfo.VinCode, &staticInfo.Brand, &staticInfo.VehicleFactory, &staticInfo.CertNo, &staticInfo.VehicleInvoice); err != nil {
				if err == sql.ErrNoRows {
					if recErr := recordUnregisteredVehicle(db, state); recErr != nil {
						logx.Errorf("记录未注册车辆失败: %v", recErr)
					}
				} else {
					logx.Errorf("查询静态信息失败: %v", err)
				}
			} else {
				if staticInfo.PlateNo.Valid {
					payload["plateNumber"] = staticInfo.PlateNo.String
				}
				if staticInfo.CategoryCode.Valid {
					payload["categoryCode"] = int(staticInfo.CategoryCode.Int64)
				}
				if staticInfo.VinCode.Valid {
					payload["vinCode"] = staticInfo.VinCode.String
				}
				if staticInfo.Brand.Valid {
					payload["brand"] = staticInfo.Brand.String
				}
				if staticInfo.VehicleFactory.Valid {
					payload["vehicleFactory"] = staticInfo.VehicleFactory.String
				}
				if staticInfo.CertNo.Valid {
					payload["certNo"] = staticInfo.CertNo.String
				}
				if staticInfo.VehicleInvoice.Valid {
					payload["vehicleInvoice"] = staticInfo.VehicleInvoice.String
				}
			}
		}

		if bs, err := json.Marshal(payload); err == nil {
			hub.Broadcast <- bs
		} else {
			logx.Errorf("广播序列化失败: %v", err)
		}
	}

	return nil
}

// recordUnregisteredVehicle 将未在 platform 登记的车辆上报写入或更新到 unregistered_vehicle_reports 表
func recordUnregisteredVehicle(db *sql.DB, req *types.VehicleStateData) error {
	if db == nil || req == nil {
		return fmt.Errorf("nil db or req")
	}
	bs, _ := json.Marshal(req)
	payload := string(bs)
	now := time.Now()

	res, err := db.Exec("UPDATE unregistered_vehicle_reports SET last_seen = ?, report_count = report_count + 1, last_payload = ? WHERE vehicle_id = ?", now, payload, req.VehicleId)
	if err != nil {
		return err
	}
	if ra, _ := res.RowsAffected(); ra > 0 {
		return nil
	}
	_, err = db.Exec("INSERT INTO unregistered_vehicle_reports (vehicle_id, first_seen, last_seen, report_count, last_payload) VALUES (?, ?, ?, 1, ?)", req.VehicleId, now, now, payload)
	return err
}
