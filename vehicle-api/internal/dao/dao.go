package dao

import (
	"context"
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
	Org          string
	Bucket       string
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
		Org:          org,
		Bucket:       bucket,
	}
}

func (d *InfluxDao) AddPoint(point *write.Point) error {
	d.WriteAPI.WritePoint(point)
	return nil
}

func (d *InfluxDao) BuildPoint(vehicleStatus *types.VEH2CLOUD_STATE) (*write.Point, error) {

	// 注意时区: TimestampGNSS 单位 ms（来自 GNSS），转换为 time.Time
	timeStamp := time.UnixMilli(int64(vehicleStatus.TimestampGNSS))
	fmt.Println("timeStamp: ", timeStamp)
	utcTime := timeStamp.Add(-8 * time.Hour)
	fmt.Println("utcTime: ", utcTime)

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

// QueryPositions returns ordered position points for a vehicle between start and end (inclusive)
func (d *InfluxDao) QueryPositions(vehicleId string, start time.Time, end time.Time) ([]types.PositionPoint, error) {
	// Build Flux query: filter by measurement and vehicleId, pivot fields to get longitude/latitude per timestamp
	flux := fmt.Sprintf(`from(bucket:"%s") |> range(start: %s, stop: %s) |> filter(fn: (r) => r._measurement == "vehicle_status" and r["vehicleId"] == "%s") |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value") |> keep(columns:["_time","longitude","latitude"]) |> sort(columns:["_time"])`, d.Bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), vehicleId)

	queryAPI := d.InfluxWriter.QueryAPI(d.Org)
	result, err := queryAPI.Query(context.Background(), flux)
	if err != nil {
		return nil, err
	}

	pts := make([]types.PositionPoint, 0)
	for result.Next() {
		rec := result.Record()
		// values may be float64 or int64 depending on write
		var lon uint32
		var lat uint32
		if v := rec.ValueByKey("longitude"); v != nil {
			switch t := v.(type) {
			case int64:
				lon = uint32(t)
			case float64:
				lon = uint32(t)
			case uint64:
				lon = uint32(t)
			default:
				lon = 0
			}
		}
		if v := rec.ValueByKey("latitude"); v != nil {
			switch t := v.(type) {
			case int64:
				lat = uint32(t)
			case float64:
				lat = uint32(t)
			case uint64:
				lat = uint32(t)
			default:
				lat = 0
			}
		}
		// use UTC RFC3339 timestamp string for responses
		t := rec.Time().UTC()
		ts := t.Format(time.RFC3339)
		pts = append(pts, types.PositionPoint{Timestamp: ts, Longitude: lon, Latitude: lat})
	}
	if result.Err() != nil {
		return nil, result.Err()
	}
	return pts, nil
}
