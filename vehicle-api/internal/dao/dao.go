package dao

import (
	"fmt"
	"time"

	"vehicle-api/internal/types"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"
	"github.com/influxdata/influxdb-client-go/v2/api/write"
)

type InfluxDao struct {
	InfluxWriter influxdb2.Client
	WriteAPI     api.WriteAPI
}

func NewInfluxDao(client influxdb2.Client, org, bucket string) *InfluxDao {

	writeAPI := client.WriteAPI(org, bucket)

	go func() {
		for dberr := range writeAPI.Errors() {
			fmt.Println("Influxdb write error: ", dberr)
		}
	}()

	return &InfluxDao{
		InfluxWriter: client,
		WriteAPI:     writeAPI,
	}
}

func (d *InfluxDao) AddPoint(point *write.Point) error {
	d.WriteAPI.WritePoint(point)
	return nil
}

func (d *InfluxDao) BuildPoint(vehicleStatus *types.VEH2CLOUD_STATE) (*write.Point, error) {

	// 注意时区: TimestampGNSS 单位 ms（来自 GNSS），转换为 time.Time
	timeStamp := time.UnixMilli(int64(vehicleStatus.TimestampGNSS))
	utcTime := timeStamp.Add(-8 * time.Hour)

	point := write.NewPoint("vehicle_status", // measurement name 相当于表名
		map[string]string{ // Tags, 相当于建立索引
			"vehicleId": vehicleStatus.VehicleId,
			"messageId": string(vehicleStatus.MessageId),
		}, map[string]interface{}{ // Fields, 相当于表的字段
			"driveMode":       vehicleStatus.DriveMode,
			"velocity":        vehicleStatus.Velocity,
			"velocityGNSS":    vehicleStatus.VelocityGNSS,
			"accelerationLon": vehicleStatus.AccelerationLon,
			"accelerationLat": vehicleStatus.AccelerationLat,
			"accelerationVer": vehicleStatus.AccelerationVer,
			"yawRate":         vehicleStatus.YawRate,
			"accelPos":        vehicleStatus.AccelPos,
			"engineSpeed":     vehicleStatus.EngineSpeed,
			"engineTorque":    vehicleStatus.EngineTorque,
			"brakeFlag":       vehicleStatus.BrakeFlag,
			"brakePos":        vehicleStatus.BrakePos,
			"brakePressure":   vehicleStatus.BrakePressure,
			"fuelConsumption": vehicleStatus.FuelConsumption,
			"heading":         vehicleStatus.Heading,
			"longitude":       vehicleStatus.Position.Longitude,
			"latitude":        vehicleStatus.Position.Latitude,
			"timestampGNSS":   vehicleStatus.TimestampGNSS,
		}, utcTime)

	return point, nil
}

func (d *InfluxDao) Close() {
	d.WriteAPI.Flush()
	d.InfluxWriter.Close()
}
