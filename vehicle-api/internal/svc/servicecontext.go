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
	"vehicle-api/internal/websocket"

	_ "github.com/go-sql-driver/mysql"
	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/zeromicro/go-zero/core/logx"
)

type ServiceContext struct {
	Config       config.Config
	WSHub        *websocket.Hub
	Dao          *dao.InfluxDao
	Analytics    *dao.AnalyticsDao
	MySQLDB      *sql.DB
	MySQLDao     *dao.MySQLDao
	Processor    processor.Processor
	OnlineDrones sync.Map // key: uasID, value: time.Time
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
		Config:    c,
		WSHub:     hub,
		Dao:       dao.NewInfluxDao(client, c.InfluxDBConfig.Org, c.InfluxDBConfig.Bucket),
		Analytics: dao.NewAnalyticsDao(client, c.InfluxDBConfig.Org, c.InfluxDBConfig.Bucket),
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
		type VARCHAR(64),
		total_capacity VARCHAR(64),
		battery_info VARCHAR(255),
		route_id VARCHAR(128),
		status VARCHAR(64),
		extra JSON,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
	`)
	return err
}

// ProcessState 将 VEH2CLOUD_STATE 写入 Influx，并通过 WebSocket 广播最新状态
func (sc *ServiceContext) ProcessState(req *types.VEH2CLOUD_STATE) error {
	if sc == nil {
		return nil
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
		bs, _ := json.Marshal(map[string]interface{}{
			"vehicleId": req.VehicleId,
			"timestamp": req.TimestampGNSS,
			"lon":       req.Position.Longitude,
			"lat":       req.Position.Latitude,
			"velocity":  req.Velocity,
		})
		sc.WSHub.Broadcast <- bs
	}

	// TODO: parsing planningLocs, detectionData, custom cargo fields
	return nil
}
