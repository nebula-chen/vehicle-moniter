package dao

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
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

func (d *InfluxDao) BuildPoint(vehicleStatus *types.VehicleStateData) (*write.Point, error) {

	// GNSS 时间为毫秒时间戳（UTC 毫秒），直接转换为 time.Time 后使用 UTC()
	timeStamp := time.UnixMilli(int64(vehicleStatus.Timestamp)).UTC()

	// 将部分复杂字段写为简单标量，字段名与 VehicleStateData 保持一致，写入为浮点/数值类型
	tags := map[string]string{
		"vehicleId": vehicleStatus.VehicleId,
	}
	// categoryCode 作为 tag 便于按车型查询
	tags["categoryCode"] = strconv.Itoa(vehicleStatus.CategoryCode)
	// 将所有 VehicleStateData 字段按名称写入 fields，尽量保持类型一致
	// 对于数组类型（如 Doors）序列化为 JSON 字符串写入
	doorsStr := ""
	if vehicleStatus.Doors != nil {
		if b, err := json.Marshal(vehicleStatus.Doors); err == nil {
			doorsStr = string(b)
		}
	}

	fields := map[string]interface{}{
		"timestamp":       vehicleStatus.Timestamp,
		"speed":           vehicleStatus.Speed,
		"lon":             vehicleStatus.Lon,
		"lat":             vehicleStatus.Lat,
		"heading":         vehicleStatus.Heading,
		"driveMode":       vehicleStatus.DriveMode,
		"tapPos":          vehicleStatus.TapPos,
		"accelPos":        vehicleStatus.AccelPos,
		"brakeFlag":       vehicleStatus.BrakeFlag,
		"brakePos":        vehicleStatus.BrakePos,
		"fuelConsumption": vehicleStatus.FuelConsumption,
		"absFlag":         vehicleStatus.AbsFlag,
		"tcsFlag":         vehicleStatus.TcsFlag,
		"espFlag":         vehicleStatus.EspFlag,
		"lkaFlag":         vehicleStatus.LkaFlag,
		"accMode":         vehicleStatus.AccMode,
		"fcwFlag":         vehicleStatus.FcwFlag,
		"ldwFlag":         vehicleStatus.LdwFlag,
		"aebFlag":         vehicleStatus.AebFlag,
		"lcaFlag":         vehicleStatus.LcaFlag,
		"dmsFlag":         vehicleStatus.DmsFlag,
		"soc":             vehicleStatus.Soc,
		"mileage":         vehicleStatus.Mileage,
		"accelerationH":   vehicleStatus.AccelerationH,
		"accelerationV":   vehicleStatus.AccelerationV,
		"lowBeam":         vehicleStatus.LowBeam,
		"highBeam":        vehicleStatus.HighBeam,
		"leftTurn":        vehicleStatus.LeftTurn,
		"rightTurn":       vehicleStatus.RightTurn,
		"hazardSignal":    vehicleStatus.HazardSignal,
		"automatic":       vehicleStatus.Automatic,
		"daytimeRunning":  vehicleStatus.DaytimeRunning,
		"fogLight":        vehicleStatus.FogLight,
		"parking":         vehicleStatus.Parking,
		"vehFault":        vehicleStatus.VehFault,
		"doors":           doorsStr,
	}

	point := write.NewPoint("vehicle_status", tags, fields, timeStamp)
	return point, nil
}

func (d *InfluxDao) Close() {
	d.WriteAPI.Flush()
	d.InfluxWriter.Close()
}

// QueryPositions 返回指定时间范围内（包含端点）某车辆的有序位置点
func (d *InfluxDao) QueryPositions(vehicleId string, start time.Time, end time.Time) ([]types.PositionPoint, error) {
	// 构建 Flux 查询：按 measurement 与 vehicleId 过滤，并 pivot 字段以按时间取出经纬度
	flux := fmt.Sprintf(`from(bucket:"%s") |> range(start: %s, stop: %s) |> filter(fn: (r) => r._measurement == "vehicle_status" and r["vehicleId"] == "%s") |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value") |> keep(columns:["_time","longitude","latitude"]) |> sort(columns:["_time"])`, d.Bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), vehicleId)

	queryAPI := d.InfluxWriter.QueryAPI(d.Org)
	result, err := queryAPI.Query(context.Background(), flux)
	if err != nil {
		return nil, err
	}

	pts := make([]types.PositionPoint, 0)
	for result.Next() {
		rec := result.Record()
		// 值可能是 float64 或 int64，取决于写入类型
		var lon int64
		var lat int64
		if v := rec.ValueByKey("longitude"); v != nil {
			switch t := v.(type) {
			case int64:
				lon = t
			case float64:
				lon = int64(t)
			case uint64:
				lon = int64(t)
			default:
				lon = 0
			}
		}
		if v := rec.ValueByKey("latitude"); v != nil {
			switch t := v.(type) {
			case int64:
				lat = t
			case float64:
				lat = int64(t)
			case uint64:
				lat = int64(t)
			default:
				lat = 0
			}
		}
		// 使用 UTC RFC3339 格式的时间字符串作为响应时间
		t := rec.Time().UTC()
		ts := t.Format(time.RFC3339)
		pts = append(pts, types.PositionPoint{Timestamp: ts, Longitude: lon, Latitude: lat})
	}
	if result.Err() != nil {
		return nil, result.Err()
	}
	return pts, nil
}

// QueryLatestStatus 返回单个 vehicleId 的最新 VEH2CLOUD_STATE
func (d *InfluxDao) QueryLatestStatus(vehicleId string) (types.VehicleStateData, error) {
	var out types.VehicleStateData
	// 使用 Flux 获取 vehicle_status 的最后一条记录
	flux := fmt.Sprintf(`from(bucket:"%s") |> range(start: -30d) |> filter(fn:(r)=> r._measurement=="vehicle_status" and r["vehicleId"]=="%s") |> last() |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")`, d.Bucket, vehicleId)
	queryAPI := d.InfluxWriter.QueryAPI(d.Org)
	result, err := queryAPI.Query(context.Background(), flux)
	if err != nil {
		return out, err
	}
	if result.Next() {
		rec := result.Record()
		// 解析常用字段到 VehicleStateData
		out.VehicleId = vehicleId
		out.Timestamp = uint64(rec.Time().UTC().UnixMilli())
		if v := rec.ValueByKey("speed"); v != nil {
			switch t := v.(type) {
			case int64:
				out.Speed = float64(t)
			case float64:
				out.Speed = t
			}
		}
		if v := rec.ValueByKey("lon"); v != nil {
			switch t := v.(type) {
			case int64:
				out.Lon = float64(t)
			case float64:
				out.Lon = t
			}
		}
		if v := rec.ValueByKey("lat"); v != nil {
			switch t := v.(type) {
			case int64:
				out.Lat = float64(t)
			case float64:
				out.Lat = t
			}
		}
		if v := rec.ValueByKey("heading"); v != nil {
			switch t := v.(type) {
			case int64:
				out.Heading = float64(t)
			case float64:
				out.Heading = t
			}
		}
		if v := rec.ValueByKey("driveMode"); v != nil {
			switch t := v.(type) {
			case int64:
				out.DriveMode = int(t)
			case float64:
				out.DriveMode = int(t)
			}
		}
		if v := rec.ValueByKey("tapPos"); v != nil {
			switch t := v.(type) {
			case int64:
				out.TapPos = int(t)
			case float64:
				out.TapPos = int(t)
			}
		}
		if v := rec.ValueByKey("accelPos"); v != nil {
			switch t := v.(type) {
			case int64:
				out.AccelPos = float64(t)
			case float64:
				out.AccelPos = t
			}
		}
		if v := rec.ValueByKey("brakeFlag"); v != nil {
			switch t := v.(type) {
			case int64:
				out.BrakeFlag = int(t)
			case float64:
				out.BrakeFlag = int(t)
			}
		}
		if v := rec.ValueByKey("brakePos"); v != nil {
			switch t := v.(type) {
			case int64:
				out.BrakePos = float64(t)
			case float64:
				out.BrakePos = t
			}
		}
		if v := rec.ValueByKey("fuelConsumption"); v != nil {
			switch t := v.(type) {
			case int64:
				out.FuelConsumption = float64(t)
			case float64:
				out.FuelConsumption = t
			}
		}
		if v := rec.ValueByKey("soc"); v != nil {
			switch t := v.(type) {
			case int64:
				out.Soc = float64(t)
			case float64:
				out.Soc = t
			}
		}
		if v := rec.ValueByKey("mileage"); v != nil {
			switch t := v.(type) {
			case int64:
				out.Mileage = float64(t)
			case float64:
				out.Mileage = t
			}
		}
		return out, nil
	}
	if result.Err() != nil {
		return out, result.Err()
	}
	return out, fmt.Errorf("no data for vehicle %s", vehicleId)
}

// QueryAllVehiclesLatest 返回所有车辆的最新状态（受最近时间窗口限制）
func (d *InfluxDao) QueryAllVehiclesLatest() ([]types.VehicleStateData, error) {
	// 为避免 pivot 时因不同写入者导致同一字段出现不同类型（string vs unsigned）而报错，
	// 复用更健壮的按时间范围查询实现：QueryVehiclesLatestInRange
	// 使用与之前相同的默认时间窗口（最近 30 天）来保持行为一致
	start := time.Now().Add(-30 * 24 * time.Hour)
	end := time.Now()
	return d.QueryVehiclesLatestInRange(start, end)
}

// QueryVehiclesLatestInRange 返回在指定时间区间内每辆车的最新状态
func (d *InfluxDao) QueryVehiclesLatestInRange(start, end time.Time) ([]types.VehicleStateData, error) {
	// 为避免 pivot 时因不同写入者导致同一字段出现不同类型（string vs unsigned）而报错，
	// 我们分两次查询：
	// 1) 查询数值字段并 pivot（longitude/latitude/velocity 等），以获得每车的数值列
	// 2) 单独查询字符串字段（例如 passPoints），取最后一条
	// 最后把两个结果按 vehicleId 合并返回

	// 数值字段集合（按需添加）
	// 采用与 VehicleStateData 对应的字段名
	numericFields := []string{"timestamp", "speed", "lon", "lat", "heading", "tapPos", "accelPos", "brakeFlag", "brakePos", "fuelConsumption", "driveMode", "soc", "mileage", "accelerationH", "accelerationV"}
	// 构造 numeric filter 子表达式
	nf := ""
	for i, f := range numericFields {
		if i == 0 {
			nf = fmt.Sprintf(`r._field == "%s"`, f)
		} else {
			nf = nf + " or " + fmt.Sprintf(`r._field == "%s"`, f)
		}
	}

	numericFlux := fmt.Sprintf(`from(bucket:"%s") |> range(start: %s, stop: %s) |> filter(fn:(r)=> r._measurement=="vehicle_status" and (%s)) |> group(columns:["vehicleId"]) |> last() |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")`, d.Bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), nf)

	queryAPI := d.InfluxWriter.QueryAPI(d.Org)
	result, err := queryAPI.Query(context.Background(), numericFlux)
	if err != nil {
		return nil, err
	}

	// 临时 map 用于合并结果，key 为 vehicleId
	tmp := make(map[string]types.VehicleStateData)

	for result.Next() {
		rec := result.Record()
		var s types.VehicleStateData
		// vehicleId 为 tag，在 pivot 后仍可通过 ValueByKey 获取
		if v := rec.ValueByKey("vehicleId"); v != nil {
			if vs, ok := v.(string); ok {
				s.VehicleId = vs
			}
		}
		if v := rec.ValueByKey("speed"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Speed = float64(t)
			case float64:
				s.Speed = t
			}
		}
		if v := rec.ValueByKey("lon"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Lon = float64(t)
			case float64:
				s.Lon = t
			case uint64:
				s.Lon = float64(t)
			}
		}
		if v := rec.ValueByKey("lat"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Lat = float64(t)
			case float64:
				s.Lat = t
			case uint64:
				s.Lat = float64(t)
			}
		}
		if v := rec.ValueByKey("heading"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Heading = float64(t)
			case float64:
				s.Heading = t
			}
		}
		// 使用记录时间作为 Timestamp
		s.Timestamp = uint64(rec.Time().UTC().UnixMilli())

		// 保存到临时 map（按 vehicleId 覆盖）
		if s.VehicleId != "" {
			tmp[s.VehicleId] = s
		}
	}
	if result.Err() != nil {
		return nil, result.Err()
	}

	// 构造输出切片
	out := make([]types.VehicleStateData, 0, len(tmp))
	for _, s := range tmp {
		out = append(out, s)
	}
	return out, nil
}

// QueryStatesInRange 返回指定 vehicleId 在时间区间内按时间升序的完整状态列表
func (d *InfluxDao) QueryStatesInRange(vehicleId string, start, end time.Time) ([]types.VehicleStateData, error) {
	// 使用 pivot 将各字段展平，然后按时间排序返回
	flux := fmt.Sprintf(`from(bucket:"%s") |> range(start: %s, stop: %s) |> filter(fn:(r)=> r._measurement=="vehicle_status" and r["vehicleId"]=="%s") |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn: "_value") |> sort(columns:["_time"])`, d.Bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), vehicleId)
	queryAPI := d.InfluxWriter.QueryAPI(d.Org)
	result, err := queryAPI.Query(context.Background(), flux)
	if err != nil {
		return nil, err
	}

	out := make([]types.VehicleStateData, 0)
	for result.Next() {
		rec := result.Record()
		var s types.VehicleStateData
		// 解析字段
		s.VehicleId = vehicleId
		s.Timestamp = uint64(rec.Time().UTC().UnixMilli())
		if v := rec.ValueByKey("speed"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Speed = float64(t)
			case float64:
				s.Speed = t
			}
		}
		if v := rec.ValueByKey("lon"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Lon = float64(t)
			case float64:
				s.Lon = t
			case uint64:
				s.Lon = float64(t)
			}
		}
		if v := rec.ValueByKey("lat"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Lat = float64(t)
			case float64:
				s.Lat = t
			case uint64:
				s.Lat = float64(t)
			}
		}
		if v := rec.ValueByKey("heading"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Heading = float64(t)
			case float64:
				s.Heading = t
			}
		}
		if v := rec.ValueByKey("driveMode"); v != nil {
			switch t := v.(type) {
			case int64:
				s.DriveMode = int(t)
			case float64:
				s.DriveMode = int(t)
			}
		}
		if v := rec.ValueByKey("tapPos"); v != nil {
			switch t := v.(type) {
			case int64:
				s.TapPos = int(t)
			case float64:
				s.TapPos = int(t)
			}
		}
		out = append(out, s)
	}
	if result.Err() != nil {
		return nil, result.Err()
	}
	return out, nil
}
