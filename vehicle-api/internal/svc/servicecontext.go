package svc

import (
	"context"
	"encoding/json"
	"sync"
	"time"
	"vehicle-api/internal/config"
	"vehicle-api/internal/dao"
	"vehicle-api/internal/types"
	"vehicle-api/internal/websocket"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/zeromicro/go-zero/core/logx"
)

type ServiceContext struct {
	Config    config.Config
	WSHub     *websocket.Hub
	Dao       *dao.InfluxDao
	Analytics *dao.AnalyticsDao

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
