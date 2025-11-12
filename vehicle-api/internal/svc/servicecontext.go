package svc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"
	"vehicle-api/internal/config"
	"vehicle-api/internal/dao"
	"vehicle-api/internal/processor"
	"vehicle-api/internal/types"
	"vehicle-api/internal/vehiclestate"
	"vehicle-api/internal/websocket"

	_ "github.com/go-sql-driver/mysql"
	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/zeromicro/go-zero/core/logx"
)

type ServiceContext struct {
	Config         config.Config
	WSHub          *websocket.Hub
	Dao            *dao.InfluxDao
	MySQLDB        *sql.DB
	MySQLDao       *dao.MySQLDao
	Processor      processor.Processor
	VEHStateClient *vehiclestate.Client
	OnlineDrones   sync.Map // key: uasID, value: time.Time
}

func NewServiceContext(c config.Config) *ServiceContext {
	hub := websocket.NewHub()
	go hub.Run()
	URL := "http://" + c.InfluxDBConfig.Host + ":" + c.InfluxDBConfig.Port
	options := influxdb2.DefaultOptions().
		SetBatchSize(c.InfluxDBConfig.BatchSize).               // 批量大小
		SetFlushInterval(c.InfluxDBConfig.FlushInterval * 1000) // 毫秒
		// SetPrecision(time.Second)
	client := influxdb2.NewClientWithOptions(URL, c.InfluxDBConfig.Token, options)

	_, err := client.Ping(context.Background())
	if err != nil {
		panic("InfluxDB connect error: " + err.Error())
	}
	ctx := &ServiceContext{
		Config: c,
		WSHub:  hub,
		Dao:    dao.NewInfluxDao(client, c.InfluxDBConfig.Org, c.InfluxDBConfig.Bucket),
	}

	// 如果配置了 MySQL，则尝试建立连接并自动建表
	if c.MySQL.Host != "" {
		dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=%s&parseTime=true&loc=Local", c.MySQL.User, c.MySQL.Password, c.MySQL.Host, c.MySQL.Port, c.MySQL.Database, c.MySQL.Charset)
		db, err := sql.Open("mysql", dsn)
		if err != nil {
			panic("MySQL connect error: " + err.Error())
		}
		// 设置连接池参数（可根据需要调整）
		db.SetMaxOpenConns(25)
		db.SetMaxIdleConns(5)
		db.SetConnMaxLifetime(5 * time.Minute)

		if err := db.Ping(); err != nil {
			panic("MySQL ping error: " + err.Error())
		}
		ctx.MySQLDB = db
		ctx.MySQLDao = dao.NewMySQLDao(db)
		// 初始化 Processor（已移除在 Processor 中维护 ActiveTasks 的设计）
		ctx.Processor = processor.NewDefaultProcessor(ctx.MySQLDao)

		// 自动建表（低风险的表结构创建，使用 IF NOT EXISTS）
		if err := autoMigrate(db); err != nil {
			logx.Errorf("自动建表失败: %v", err)
		} else {
			logx.Infof("MySQL 自动建表完成")
		}
	}

	// 启动定时清理协程
	go func() {
		for {
			now := time.Now()
			ctx.OnlineDrones.Range(func(key, value interface{}) bool {
				lastTime, ok := value.(time.Time)
				if ok && now.Sub(lastTime) > time.Minute {
					ctx.OnlineDrones.Delete(key)
				}
				return true
			})
			time.Sleep(10 * time.Second)
		}
	}()

	// 初始化 VEHState 客户端
	if c.VEHState.URL != "" {
		apiClient := vehiclestate.NewClient(
			c.VEHState.URL,
			func(resp *types.VehicleStateResp) error {
				// 处理来自车辆状态API的消息响应
				// 这里可以进一步对接收到的数据进行处理，例如广播到WebSocket客户端
				logx.Debugf("Received VEHState response: %+v", resp)
				// 可以在这里根据需要进行数据广播或处理
				return nil
			},
			func(err error) {
				// 处理错误
				logx.Errorf("VEHState error: %v", err)
			},
			func() {
				// 处理关闭
				logx.Infof("VEHState client closed")
			},
		)

		// 建立连接
		if err := apiClient.Connect(context.Background()); err != nil {
			logx.Errorf("Failed to connect to VEHState: %v", err)
		} else {
			// 启动读写循环
			apiClient.Run(context.Background())
			ctx.VEHStateClient = apiClient
			logx.Infof("VEHState client initialized successfully")
		}
	} else {
		logx.Errorf("VEHState URL not configured")
	}

	return ctx
}

// autoMigrate 创建必要的 MySQL 表（使用 IF NOT EXISTS，安全可重入）
func autoMigrate(db *sql.DB) error {
	// vehicle_records: 存储每次上报的汇总记录，增加唯一索引避免重复
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS vehicle_records (
		id INT AUTO_INCREMENT PRIMARY KEY,
		vehicle_id VARCHAR(128) NOT NULL,
		timestamp DATETIME NOT NULL,
		longitude BIGINT,
		latitude BIGINT,
		velocity INT,
		extra JSON,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uq_vehicle_time (vehicle_id, timestamp)
	);`)
	if err != nil {
		return err
	}

	// 创建 vehicle_list 表（保留用于静态设备信息）
	if err := createVehicleListTable(db); err != nil {
		return err
	}

	// 创建任务记录表和任务轨迹点表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS task_records (
		id INT AUTO_INCREMENT PRIMARY KEY,
		task_id VARCHAR(128) NOT NULL UNIQUE,
		vehicle_id VARCHAR(128) NOT NULL,
		start_time DATETIME NOT NULL,
		end_time DATETIME,
		start_lon BIGINT,
		start_lat BIGINT,
		end_lon BIGINT,
		end_lat BIGINT,
		status VARCHAR(32),
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS task_track_points (
		id INT AUTO_INCREMENT PRIMARY KEY,
		task_id VARCHAR(128) NOT NULL,
		timestamp DATETIME,
		longitude BIGINT,
		latitude BIGINT,
		velocity INT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		INDEX idx_task_id (task_id)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
	`)
	if err != nil {
		return err
	}

	// 创建未在平台登记的车辆上报记录表，用于记录那些上报但未在 vehicle_list 中预注册的车辆
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS unregistered_vehicle_reports (
		id INT AUTO_INCREMENT PRIMARY KEY,
		vehicle_id VARCHAR(128) NOT NULL UNIQUE,
		first_seen DATETIME NOT NULL,
		last_seen DATETIME NOT NULL,
		report_count INT DEFAULT 1,
		last_payload JSON,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
	`)
	if err != nil {
		return err
	}

	return nil
}

// 新增 vehicle_list 表：用于保存无人车静态设备信息（车牌、vehicle_id、容量、电池信息、所属线路、录入时间等）
// 使用 IF NOT EXISTS 保证安全可重入
func createVehicleListTable(db *sql.DB) error {
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS vehicle_list (
		id INT AUTO_INCREMENT PRIMARY KEY,
		vehicle_id VARCHAR(128) NOT NULL UNIQUE,
		plate_number VARCHAR(64),
		type INT,
		total_capacity INT,
		battery_info INT,
		route_id VARCHAR(128),
		status VARCHAR(64),
		extra TEXT, -- 备注信息，仅用于文字备注，非 JSON
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
	`)
	return err
}

// ProcessVehicleState 处理来自WebSocket API的车辆状态数据
// 通过Processor持久化到数据库，并广播到WebSocket客户端
func (sc *ServiceContext) ProcessVehicleState(data *types.VehicleStateData) error {
	if sc == nil || data == nil {
		return nil
	}

	logx.Debugf("处理车辆状态 vehicle=%s ts=%d lon=%.6f lat=%.6f speed=%.2f",
		data.VehicleId, data.Timestamp, data.Lon, data.Lat, data.Speed)

	// 通过Processor将状态持久化到MySQL
	if sc.Processor != nil {
		if err := sc.Processor.ProcessState(data); err != nil {
			logx.Errorf("Processor处理状态失败 vehicle=%s: %v", data.VehicleId, err)
		}
	}

	// 广播最新状态到WebSocket hub
	if sc.WSHub != nil {
		payload := map[string]interface{}{
			"vehicleId": data.VehicleId,
			"timestamp": data.Timestamp,
			"lon":       data.Lon,
			"lat":       data.Lat,
			"speed":     data.Speed,
			"heading":   data.Heading,
			"driveMode": data.DriveMode,
			"accelPos":  data.AccelPos,
			"brakePos":  data.BrakePos,
		}

		bs, _ := json.Marshal(payload)
		sc.WSHub.Broadcast <- bs
	}

	return nil
}

// ProcessState 将 VEH2CLOUD_STATE 写入 Influx，并通过 WebSocket 广播最新状态
// 该方法保留用于后向兼容，现已不再使用（改为使用ProcessVehicleState）
func (sc *ServiceContext) ProcessState(req *types.VEH2CLOUD_STATE) error {
	if sc == nil {
		return nil
	}

	// 如果启用了 MySQL，则先检查车辆是否在 vehicle_list 中登记
	isRegistered := false
	if sc.MySQLDB != nil {
		var tmp int
		err := sc.MySQLDB.QueryRow("SELECT 1 FROM vehicle_list WHERE vehicle_id = ?", req.VehicleId).Scan(&tmp)
		if err != nil {
			if err == sql.ErrNoRows {
				// 车辆未登记，记录到 unregistered_vehicle_reports 表（插入或更新）
				if recErr := recordUnregisteredVehicle(sc.MySQLDB, req); recErr != nil {
					logx.Errorf("record unregistered vehicle error: %v", recErr)
				} else {
					logx.Infof("recorded unregistered vehicle: %s", req.VehicleId)
				}
			} else {
				logx.Errorf("check vehicle existence error: %v", err)
			}
		} else {
			isRegistered = true
		}
	}

	// 写入 InfluxDB
	if sc.Dao == nil {
		logx.Errorf("no dao configured, skip write")
	} else {
		p, err := sc.Dao.BuildPoint(req)
		if err != nil {
			logx.Errorf("build point error: %v", err)
		} else {
			if err := sc.Dao.AddPoint(p); err != nil {
				logx.Errorf("add point error: %v", err)
			}
		}
	}

	// 广播最新状态到 websocket hub
	if sc.WSHub != nil {
		// 扩展广播的 payload，包含动态数据和（若注册）静态信息
		payload := map[string]interface{}{
			"vehicleId":    req.VehicleId,
			"timestamp":    req.TimestampGNSS,
			"lon":          req.Position.Longitude,
			"lat":          req.Position.Latitude,
			"velocity":     req.Velocity,
			"heading":      req.Heading,
			"velocityGNSS": req.VelocityGNSS,
		}

		// 若车辆在 vehicle_list 中注册，则查询并附加静态信息
		if isRegistered && sc.MySQLDB != nil {
			var staticInfo struct {
				PlateNumber   string         `db:"plate_number"`
				Type          int            `db:"type"`
				TotalCapacity int            `db:"total_capacity"`
				BatteryInfo   int            `db:"battery_info"`
				RouteId       string         `db:"route_id"`
				Status        string         `db:"status"`
				Extra         sql.NullString `db:"extra"`
			}
			err := sc.MySQLDB.QueryRow(
				"SELECT plate_number, type, total_capacity, battery_info, route_id, status, extra FROM vehicle_list WHERE vehicle_id = ?",
				req.VehicleId,
			).Scan(&staticInfo.PlateNumber, &staticInfo.Type, &staticInfo.TotalCapacity, &staticInfo.BatteryInfo, &staticInfo.RouteId, &staticInfo.Status, &staticInfo.Extra)
			if err != nil {
				logx.Errorf("query vehicle static info error: %v", err)
			} else {
				payload["plateNumber"] = staticInfo.PlateNumber
				payload["type"] = staticInfo.Type
				payload["capacity"] = staticInfo.TotalCapacity
				payload["battery"] = staticInfo.BatteryInfo
				payload["routeId"] = staticInfo.RouteId
				payload["status"] = staticInfo.Status
				if staticInfo.Extra.Valid {
					payload["extra"] = staticInfo.Extra.String
				}
			}
		}

		// 若目的地可用，按经纬增加到 payload（注意 Position2D 使用 uint32 编码，与 Position 一致）
		if req.DestLocation.Longitude != 0 || req.DestLocation.Latitude != 0 {
			payload["destLon"] = req.DestLocation.Longitude
			payload["destLat"] = req.DestLocation.Latitude
		}

		// 若存在途经点，直接附加（前端可选择是否绘制）
		if len(req.PassPoints) > 0 {
			var pts []map[string]uint32
			for _, p := range req.PassPoints {
				pts = append(pts, map[string]uint32{"lon": p.Longitude, "lat": p.Latitude})
			}
			payload["passPoints"] = pts
		}

		bs, _ := json.Marshal(payload)
		sc.WSHub.Broadcast <- bs
	}

	return nil
}

// recordUnregisteredVehicle 将未在 platform 登记的车辆上报写入或更新到 unregistered_vehicle_reports 表
// - 如果已有记录，则更新 last_seen、report_count 和 last_payload
// - 否则插入新记录（first_seen/last_seen/report_count=1）
func recordUnregisteredVehicle(db *sql.DB, req *types.VEH2CLOUD_STATE) error {
	if db == nil {
		return fmt.Errorf("nil db")
	}
	// 尝试将上报的状态序列化为 JSON 存储到 last_payload 中，便于后续排查
	bs, _ := json.Marshal(req)
	payload := string(bs)
	now := time.Now()

	// 先尝试更新已有记录
	res, err := db.Exec("UPDATE unregistered_vehicle_reports SET last_seen = ?, report_count = report_count + 1, last_payload = ? WHERE vehicle_id = ?", now, payload, req.VehicleId)
	if err != nil {
		return err
	}
	if ra, _ := res.RowsAffected(); ra > 0 {
		return nil
	}

	// 如果没有更新到行，则插入新记录
	_, err = db.Exec("INSERT INTO unregistered_vehicle_reports (vehicle_id, first_seen, last_seen, report_count, last_payload) VALUES (?, ?, ?, 1, ?)", req.VehicleId, now, now, payload)
	return err
}
