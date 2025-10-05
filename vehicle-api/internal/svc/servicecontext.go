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
	"vehicle-api/internal/types"
	"vehicle-api/internal/websocket"

	_ "github.com/go-sql-driver/mysql"
	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/zeromicro/go-zero/core/logx"
)

type ServiceContext struct {
	Config    config.Config
	WSHub     *websocket.Hub
	Dao       *dao.InfluxDao
	Analytics *dao.AnalyticsDao
	MySQLDB   *sql.DB

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
	// vehicle_tasks: 存储任务或出车记录
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS vehicle_tasks (
		id INT AUTO_INCREMENT PRIMARY KEY,
		task_id VARCHAR(128) NOT NULL UNIQUE,
		vehicle_id VARCHAR(128),
		status VARCHAR(32),
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	);`)
	if err != nil {
		return err
	}

	// vehicle_records: 存储每次上报的汇总记录
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS vehicle_records (
		id INT AUTO_INCREMENT PRIMARY KEY,
		vehicle_id VARCHAR(128) NOT NULL,
		timestamp DATETIME NOT NULL,
		longitude BIGINT,
		latitude BIGINT,
		velocity INT,
		extra JSON,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);`)
	if err != nil {
		return err
	}

	// vehicle_positions: 可选的轨迹点表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS vehicle_positions (
		id INT AUTO_INCREMENT PRIMARY KEY,
		vehicle_id VARCHAR(128) NOT NULL,
		point_time DATETIME NOT NULL,
		longitude BIGINT,
		latitude BIGINT,
		altitude INT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);`)

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
