package svc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"
	"vehicle-api/internal/apiclient"
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
	Config         config.Config
	WSHub          *websocket.Hub
	Dao            *dao.InfluxDao
	Processor      *processor.Processor
	MySQLDB        *sql.DB
	MySQLDao       *dao.MySQLDao
	VEHInfoClient  *apiclient.VEHInfoClient
	VEHStateClient *apiclient.VEHStateClient
	OnlineDrones   sync.Map // key: uasID, value: time.Time
	// VehicleLastProcessed: 跟踪每辆车上一次被处理的时间戳（毫秒），用于实现接收端的降频/采样，避免高频数据导致处理阻塞。
	VehicleLastProcessed sync.Map // key: vehicleId string, value: int64 (unix ms)
	// vehInfoStop 用于停止定时拉取车辆信息的后台协程
	vehInfoStop chan struct{}
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

	// 初始化 Processor，用于异步批量写入 Influx
	// batchSize 使用 InfluxDB 配置的 BatchSize（若为0则使用默认值），flushInterval 使用配置的秒数
	batchSize := int(c.InfluxDBConfig.BatchSize)
	if batchSize <= 0 {
		batchSize = 200
	}
	flushInterval := time.Duration(c.InfluxDBConfig.FlushInterval) * time.Second
	if flushInterval <= 0 {
		flushInterval = time.Second
	}
	// 并发写入限制，默认 4
	maxConcurrency := 4
	ctx.Processor = processor.NewProcessor(ctx.Dao, batchSize, flushInterval, maxConcurrency, hub)

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

		// 自动建表（低风险的表结构创建，使用 IF NOT EXISTS）
		if err := autoMigrate(db); err != nil {
			logx.Errorf("自动建表失败: %v", err)
		} else {
			logx.Infof("MySQL 自动建表完成")
		}
	}

	// 初始化 VEHState WebSocket 客户端（自动在后台运行，非对外暴露）
	if c.VEHState.URL != "" {
		if c.AppId == "" || c.Key == "" {
			logx.Errorf("VEHState 已配置, 但配置文件中缺少AppId/Key")
		} else {
			// 降频策略：可以通过配置 VEHState.SampleIntervalMs 指定每辆车的最小处理间隔（毫秒），
			// 如果配置为 0 则表示不降频（逐条处理）。默认降频到 1000ms（1Hz）以避免高频推送（例如 10Hz）导致后端阻塞。
			minInterval := c.VEHState.SampleIntervalMs
			if minInterval <= 0 {
				minInterval = 1000 // 默认1s
			}

			// 包装回调：先根据 vehicleId 检查上次处理时间，低于阈值则跳过（丢弃），否则处理。
			wrappedHandler := func(data *types.VehicleStateData) error {
				if data == nil || data.VehicleId == "" {
					return nil
				}
				nowMs := time.Now().UnixNano() / int64(time.Millisecond)

				// 尝试读取上一次处理时间
				if v, ok := ctx.VehicleLastProcessed.Load(data.VehicleId); ok {
					if lastMs, ok2 := v.(int64); ok2 {
						elapsed := nowMs - lastMs
						if elapsed < int64(minInterval) {
							// 在阈值内，跳过处理以实现降频；记录日志以便排查高频推送问题
							// logx.Infof("VEHState %s 跳过（降频），距上次处理 %d ms，小于阈值 %d ms", data.VehicleId, elapsed, minInterval)
							return nil
						}
					}
				}

				// 更新为本次处理时间
				ctx.VehicleLastProcessed.Store(data.VehicleId, nowMs)

				// 这里为实际处理逻辑入口：优先把数据投递到 Processor 队列以异步批量写入 Influx。
				// 如果 Processor 未初始化则回退到记录日志。
				if ctx.Processor != nil {
					if err := ctx.Processor.Enqueue(data); err != nil {
						logx.Errorf("将 VEHState 数据入队失败，vehicleId=%s err=%v", data.VehicleId, err)
						return err
					}
					// 入队成功，不在此处阻塞写入，返回 nil 表示已处理
					return nil
				}

				// 未配置 Processor 时保留原有日志行为
				// logx.Infof("收到 VEHState 数据: %+v", data)
				return nil
			}

			scClient := apiclient.NewVEHStateClient(c.VEHState, c.AppId, c.Key, wrappedHandler)
			ctx.VEHStateClient = scClient
			// 在后台启动连接
			go scClient.Start(context.Background())
			// logx.Infof("VEHState 客户端已启动，URL=%s, 降频阈值=%dms", c.VEHState.URL, minInterval)
		}
	} else {
		logx.Infof("未配置 VEHState URL，跳过 VEHState 客户端初始化")
	}

	// 初始化 VEHInfo HTTP 客户端并启动定时拉取（每 6 小时一次，启动时立即拉取一次）
	if c.VEHInfo.URL != "" {
		viClient := apiclient.NewVEHInfoClient(c.VEHInfo, c.AppId, c.Key)
		ctx.VEHInfoClient = viClient
		ctx.vehInfoStop = make(chan struct{})
		// 后台协程：立即拉取一次，然后每 6 小时拉取一次
		go func() {
			ticker := time.NewTicker(6 * time.Hour)
			// ticker := time.NewTicker(10 * time.Second)
			defer ticker.Stop()

			fetchOnce := func() {
				logx.Infof("开始拉取车辆信息列表 (外部 API)：%s", c.VEHInfo.URL)
				b, err := viClient.FetchAll(context.Background())
				if err != nil {
					logx.Errorf("拉取车辆信息失败: %v", err)
					return
				}
				// 解析响应并尝试持久化到 MySQL（如果已配置）
				// 响应使用项目中定义的类型 types.VehicleInfoResp
				var resp types.VehicleInfoResp
				if err := json.Unmarshal(b, &resp); err != nil {
					// 无法解析为预期结构，记录原始响应并返回
					if len(b) <= 4096 {
						logx.Errorf("解析车辆信息响应失败: %v, raw=%s", err, string(b))
					} else {
						logx.Errorf("解析车辆信息响应失败: %v, raw(first4KB)=%s", err, string(b[:4096]))
					}
					return
				}

				// // 打印响应摘要到日志（前4KB）
				// if len(b) <= 4096 {
				// 	logx.Infof("车辆信息响应 (%d bytes): %s", len(b), string(b))
				// } else {
				// 	logx.Infof("车辆信息响应长度=%d bytes, 前4KB: %s", len(b), string(b[:4096]))
				// }

				// 如果 MySQL 已配置且 dao 可用，则将每条车辆信息插入或更新到 vehicle_list 表
				if ctx.MySQLDao != nil {
					for _, v := range resp.Data {
						// InsertOrUpdateVehicleFromAPI 会根据 vehicleId 判断插入或更新
						if err := ctx.MySQLDao.InsertOrUpdateVehicleFromAPI(&v); err != nil {
							logx.Errorf("持久化车辆信息到 MySQL 失败，vehicleId=%s err=%v", v.VehicleId, err)
						} else {
							logx.Infof("已持久化车辆信息到 MySQL，vehicleId=%s", v.VehicleId)
						}
					}
				} else {
					logx.Infof("MySQL 未配置，跳过持久化车辆信息，返回数据数量=%d", len(resp.Data))
				}
			}

			// 启动时立即拉取一次
			fetchOnce()

			for {
				select {
				case <-ctx.vehInfoStop:
					logx.Infof("车辆信息定时拉取后台协程已停止")
					return
				case <-ticker.C:
					fetchOnce()
				}
			}
		}()
	} else {
		logx.Infof("未配置 VEHInfo URL，跳过车辆信息客户端初始化")
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

// 新增 vehicle_list 表：用于保存车辆静态设备信息（包括来自云端平台的车辆信息和内部管理信息）
// 使用 IF NOT EXISTS 保证安全可重入
func createVehicleListTable(db *sql.DB) error {
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS vehicle_list (
		id INT AUTO_INCREMENT PRIMARY KEY,
		vehicleId VARCHAR(128) NOT NULL UNIQUE,
		plateNo VARCHAR(64),
		categoryCode INT,
		categoryName VARCHAR(128),
		vinCode VARCHAR(128),
		vehicleFactory VARCHAR(256),
		brand VARCHAR(256),
		size VARCHAR(256),
		autoLevel VARCHAR(64),
		vehicleCert VARCHAR(512),
		vehicleInspection VARCHAR(512),
		vehicleInvoice VARCHAR(512),
		oilConsumption DOUBLE,
		certNo VARCHAR(128),
		createTime DATETIME DEFAULT CURRENT_TIMESTAMP,
		updatedTime DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
	`)
	return err
}

// Close 关闭 ServiceContext 中的外部资源（优雅停止）
func (sc *ServiceContext) Close() {
	// 停止 VEHState 客户端
	if sc.VEHStateClient != nil {
		sc.VEHStateClient.Stop()
		logx.Infof("VEHState 客户端已停止")
	}

	// 停止 Processor 并等待其写入完成
	if sc.Processor != nil {
		sc.Processor.Close()
		logx.Infof("Processor 已停止")
	}

	// 关闭 Influx Dao（Flush 并关闭客户端）
	if sc.Dao != nil {
		sc.Dao.Close()
		logx.Infof("Influx Dao 已关闭")
	}

	// 关闭 MySQL 连接
	if sc.MySQLDB != nil {
		_ = sc.MySQLDB.Close()
		logx.Infof("MySQL 数据库连接已关闭")
	}

	// 停止 VEHInfo 定时拉取后台协程
	if sc.vehInfoStop != nil {
		close(sc.vehInfoStop)
		logx.Infof("车辆信息定时拉取已停止")
	}
}
