package svc

import (
	"context"
	"database/sql"
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
	MySQLDB        *sql.DB
	MySQLDao       *dao.MySQLDao
	Processor      processor.Processor
	VEHStateClient *apiclient.VEHStateClient
	VEHInfoClient  *apiclient.VEHInfoClient
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
		apiClient := apiclient.NewVEHStateClient(
			c.VEHState.URL,
			c.AppId,
			c.Key,
			c.VEHState.HeartbeatTimer,
			func(resp *types.VehicleStateResp) error {
				// 处理来自车辆状态API的消息响应
				// 这里可以进一步对接收到的数据进行处理，例如广播到WebSocket客户端
				logx.Infof("收到 VEHState 响应: %+v", resp)
				// 可以在这里根据需要进行数据广播或处理
				return nil
			},
			func(err error) {
				// 处理错误
				logx.Errorf("VEHState 错误: %v", err)
			},
			func() {
				// 处理关闭
				logx.Infof("VEHState 客户端已关闭")
			},
		)

		// 建立连接
		if err := apiClient.Connect(context.Background()); err != nil {
			logx.Errorf("连接 VEHState 失败: %v", err)
		} else {
			// 启动读写循环
			apiClient.Run(context.Background())

			// 订阅 VehicleId=I1000103，持续接收该车辆状态推送
			if err := apiClient.SubscribeVehicle("I1000103"); err != nil {
				logx.Errorf("订阅 VehicleId=I1000103 失败: %v", err)
			} else {
				logx.Infof("已订阅车辆状态 VehicleId=I1000103")
			}
			ctx.VEHStateClient = apiClient
			logx.Infof("VEHState 客户端初始化成功")

			// 启动自动请求协程：定期向 VEHState 服务发送查询请求以触发状态下发
			go func(sc *ServiceContext, client *apiclient.VEHStateClient) {
				// 等待短暂时间以确保连接/订阅稳定
				time.Sleep(3 * time.Second)
				ticker := time.NewTicker(30 * time.Second)
				defer ticker.Stop()
				for {
					// 发送一次全量或空过滤请求，依赖服务端处理空 vehicleId 为广播或按需返回
					req := &types.VehicleStateReq{VehicleId: "I1000103"}
					if err := client.SendRequest(req); err != nil {
						logx.Errorf("VEHState SendRequest error: %v", err)
					}
					// 等待下一个周期
					<-ticker.C
				}
			}(ctx, apiClient)
		}
	} else {
		logx.Errorf("VEHState URL not configured")
	}

	// // 初始化车辆信息API客户端
	// if c.VEHInfo.URL != "" {
	// 	ctx.VEHInfoClient = apiclient.NewVEHInfoClient(c.VEHInfo.URL, c.AppId, c.Key)
	// 	logx.Infof("VEHInfo 客户端已通过以下URL初始化: %s", c.VEHInfo.URL)

	// 	// 启动定时同步任务：每6小时同步一次车辆信息
	// 	go ctx.startVehicleSyncTask()
	// } else {
	// 	logx.Errorf("VEHInfo URL 未配置")
	// }

	return ctx
}

// startVehicleSyncTask 启动车辆同步定时任务，每6小时执行一次
func (sc *ServiceContext) startVehicleSyncTask() {
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()

	sc.executeVehicleSync()

	// 定时执行
	for range ticker.C {
		sc.executeVehicleSync()
	}
}

// executeVehicleSync 执行一次车辆同步操作
func (sc *ServiceContext) executeVehicleSync() {
	// 依赖检查
	if sc.VEHInfoClient == nil {
		return
	}
	if sc.MySQLDao == nil {
		return
	}
	// 调用逻辑层执行同步
	syncCtx := context.Background()
	vehicles, err := sc.VEHInfoClient.GetAllVehicles(nil)
	if err != nil {
		return
	}

	for _, vehicle := range vehicles {
		if err := sc.MySQLDao.InsertOrUpdateVehicleFromAPI(&vehicle); err != nil {
		}
	}

	_ = syncCtx // 保留参数以供未来扩展
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

// ProcessVehicleState 处理来自WebSocket API的车辆状态数据
// 通过Processor持久化到数据库，并广播到WebSocket客户端
func (sc *ServiceContext) ProcessVehicleState(data *types.VehicleStateData) error {
	if sc == nil || data == nil {
		return nil
	}

	// 统一委托给 Processor 进行持久化、Influx 写入与广播（集中管理，便于测试与维护）
	if sc.Processor != nil {
		if err := sc.Processor.ProcessAndPublish(data, sc.Dao, sc.WSHub, sc.MySQLDB); err != nil {
			logx.Errorf("Processor 处理并发布状态失败 vehicle=%s: %v", data.VehicleId, err)
			return err
		}
	}
	return nil
}

// ProcessState 将 VehicleStateData 写入 Influx，并通过 WebSocket 广播最新状态
// 该方法用于直接处理新 API 推送的 VehicleStateData
func (sc *ServiceContext) ProcessState(req *types.VehicleStateData) error {
	// 统一委托给 Processor 进行持久化、Influx 写入与广播
	if sc.Processor != nil {
		if err := sc.Processor.ProcessAndPublish(req, sc.Dao, sc.WSHub, sc.MySQLDB); err != nil {
			logx.Errorf("Processor 处理并发布状态失败 vehicle=%s: %v", req.VehicleId, err)
			return err
		}
	}
	return nil
}
