package main

import (
	"flag"
	"fmt"
	"time"

	"vehicle-api/internal/config"
	"vehicle-api/internal/handler"
	"vehicle-api/internal/svc"
	"vehicle-api/internal/tcp"

	"github.com/zeromicro/go-zero/core/logx"

	"github.com/zeromicro/go-zero/core/conf"
	"github.com/zeromicro/go-zero/rest"
)

var configFile = flag.String("f", "etc/vehicle-api.yaml", "the config file")

func main() {
	flag.Parse()

	var c config.Config
	conf.MustLoad(*configFile, &c)

	server := rest.MustNewServer(c.RestConf)
	defer server.Stop()

	ctx := svc.NewServiceContext(c)
	handler.RegisterHandlers(server, ctx)

	// 启动定时汇总 goroutine：拉取 InfluxDB 数据 -> 整理 -> 写入 MySQL
	// 如果配置中没有指定间隔或窗口大小，使用默认值：interval=5m, window=1h
	go func() {
		// 使用默认值：interval=5m, window=1h。配置未提供时使用默认。
		interval := 5 * time.Minute
		window := 1 * time.Hour

		for {
			// 检查依赖
			if ctx.Dao == nil || ctx.MySQLDao == nil || ctx.Processor == nil {
				// 未配置好相应组件，等待下一个周期
				time.Sleep(interval)
				continue
			}

			end := time.Now().UTC()
			start := end.Add(-window)

			// 从 Influx 查询在时间窗口内每辆车的最新状态
			states, err := ctx.Dao.QueryVehiclesLatestInRange(start, end)
			if err != nil {
				logx.Errorf("定时汇总 - QueryVehiclesLatestInRange 错误: %v", err)
				time.Sleep(interval)
				continue
			}

			// 准备批量写入 vehicle_records 的数据
			records := make([]struct {
				VehicleId string
				Timestamp time.Time
				Lon, Lat  int64
				Velocity  int
			}, 0, len(states))

			for _, s := range states {
				// 先调用 Processor 以便写入轨迹点和任务检测
				st := s // 创建局部副本以便获取稳定地址
				if err := ctx.Processor.ProcessState(&st); err != nil {
					logx.Errorf("Processor 处理状态失败 vehicle=%s: %v", s.VehicleId, err)
				}
				// 构造记录供批量写入
				ts := time.UnixMilli(int64(s.TimestampGNSS)).UTC()
				records = append(records, struct {
					VehicleId string
					Timestamp time.Time
					Lon, Lat  int64
					Velocity  int
				}{VehicleId: s.VehicleId, Timestamp: ts, Lon: int64(s.Position.Longitude), Lat: int64(s.Position.Latitude), Velocity: int(s.Velocity)})
			}

			// 批量写入 vehicle_records（忽略单条错误，BatchInsertRecords 会在事务中处理）
			if err := ctx.MySQLDao.BatchInsertRecords(records); err != nil {
				logx.Errorf("BatchInsertRecords 错误: %v", err)
			}

			time.Sleep(interval)
		}
	}()

	// 启动 TCP 协议服务（以便设备能通过 TCP 推送数据）
	if c.TCPPort != "" {
		tcpSrv := tcp.NewTCPServer(c.TCPPort, ctx)
		go func() {
			if err := tcpSrv.Start(); err != nil {
				logx.Errorf("tcp server exit: %v", err)
			}
		}()
	}

	fmt.Printf("Starting server at %s:%d...\n", c.Host, c.Port)
	server.Start()
}
