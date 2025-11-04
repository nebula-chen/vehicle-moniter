package dao

import (
	"context"
	"encoding/json"
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

	// GNSS 时间为毫秒时间戳（UTC 毫秒），直接转换为 time.Time 后使用 UTC()
	// 不要手动减 8 小时，这会导致带有 +08 时区标识但实际上时间已经调整，从而写入错误的时间点
	timeStamp := time.UnixMilli(int64(vehicleStatus.TimestampGNSS)).UTC()

	// 把途经点序列化为 JSON 字符串写入 passPoints 字段（Influx 字段只支持标量类型）
	var passPointsJSON string
	if len(vehicleStatus.PassPoints) > 0 {
		if b, err := json.Marshal(vehicleStatus.PassPoints); err == nil {
			passPointsJSON = string(b)
		}
	}

	point := write.NewPoint("vehicle_status", // measurement name 相当于表名
		map[string]string{ // Tags, 相当于建立索引
			"vehicleId": vehicleStatus.VehicleId,
			"messageId": string(vehicleStatus.MessageId),
		}, map[string]interface{}{ // Fields, 相当于表的字段
			"timestampGNSS":   vehicleStatus.TimestampGNSS,
			"velocityGNSS":    vehicleStatus.VelocityGNSS,
			"longitude":       vehicleStatus.Position.Longitude,
			"latitude":        vehicleStatus.Position.Latitude,
			"heading":         vehicleStatus.Heading,
			"tapPos":          vehicleStatus.TapPos,
			"steeringAngle":   vehicleStatus.SteeringAngle,
			"velocity":        vehicleStatus.Velocity,
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
			"driveMode":       vehicleStatus.DriveMode,
			"destLon":         vehicleStatus.DestLocation.Longitude,
			"destLat":         vehicleStatus.DestLocation.Latitude,
			"passPointsNum":   vehicleStatus.PassPointsNum,
			"passPoints":      passPointsJSON,
		}, timeStamp)

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
func (d *InfluxDao) QueryLatestStatus(vehicleId string) (types.VEH2CLOUD_STATE, error) {
	var out types.VEH2CLOUD_STATE
	// 使用 Flux 获取 vehicle_status measurement 的最后一条记录并 pivot 字段
	flux := fmt.Sprintf(`from(bucket:"%s") |> range(start: -30d) |> filter(fn:(r)=> r._measurement=="vehicle_status" and r["vehicleId"]=="%s") |> last() |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")`, d.Bucket, vehicleId)
	queryAPI := d.InfluxWriter.QueryAPI(d.Org)
	result, err := queryAPI.Query(context.Background(), flux)
	if err != nil {
		return out, err
	}
	if result.Next() {
		rec := result.Record()
		// fill minimal fields; many fields are numeric and may come as float64/int64
		if v := rec.ValueByKey("velocity"); v != nil {
			switch t := v.(type) {
			case int64:
				out.Velocity = uint16(t)
			case float64:
				out.Velocity = uint16(t)
			}
		}
		if v := rec.ValueByKey("longitude"); v != nil {
			switch t := v.(type) {
			case int64:
				out.Position.Longitude = uint32(t)
			case float64:
				out.Position.Longitude = uint32(t)
			}
		}
		if v := rec.ValueByKey("latitude"); v != nil {
			switch t := v.(type) {
			case int64:
				out.Position.Latitude = uint32(t)
			case float64:
				out.Position.Latitude = uint32(t)
			}
		}
		out.VehicleId = vehicleId
		out.TimestampGNSS = uint64(rec.Time().UTC().UnixMilli())
		// 解析 passPoints 字段（途经点 JSON）
		if v := rec.ValueByKey("passPoints"); v != nil {
			if sstr, ok := v.(string); ok && sstr != "" {
				var pts []types.Position2D
				if err := json.Unmarshal([]byte(sstr), &pts); err == nil {
					out.PassPoints = pts
				}
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
func (d *InfluxDao) QueryAllVehiclesLatest() ([]types.VEH2CLOUD_STATE, error) {
	// 为避免 pivot 时因不同写入者导致同一字段出现不同类型（string vs unsigned）而报错，
	// 复用更健壮的按时间范围查询实现：QueryVehiclesLatestInRange
	// 使用与之前相同的默认时间窗口（最近 30 天）来保持行为一致
	start := time.Now().Add(-30 * 24 * time.Hour)
	end := time.Now()
	return d.QueryVehiclesLatestInRange(start, end)
}

// QueryVehiclesLatestInRange 返回在指定时间区间内每辆车的最新状态
func (d *InfluxDao) QueryVehiclesLatestInRange(start, end time.Time) ([]types.VEH2CLOUD_STATE, error) {
	// 为避免 pivot 时因不同写入者导致同一字段出现不同类型（string vs unsigned）而报错，
	// 我们分两次查询：
	// 1) 查询数值字段并 pivot（longitude/latitude/velocity 等），以获得每车的数值列
	// 2) 单独查询字符串字段（例如 passPoints），取最后一条
	// 最后把两个结果按 vehicleId 合并返回

	// 数值字段集合（按需添加）
	numericFields := []string{"timestampGNSS", "velocity", "longitude", "latitude", "heading", "tapPos", "steeringAngle", "accelerationLon", "accelerationLat", "accelerationVer", "yawRate", "accelPos", "engineSpeed", "engineTorque", "brakeFlag", "brakePos", "brakePressure", "fuelConsumption", "driveMode", "destLon", "destLat", "passPointsNum"}
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
	tmp := make(map[string]types.VEH2CLOUD_STATE)

	for result.Next() {
		rec := result.Record()
		var s types.VEH2CLOUD_STATE
		// vehicleId 为 tag，在 pivot 后仍可通过 ValueByKey 获取
		if v := rec.ValueByKey("vehicleId"); v != nil {
			if vs, ok := v.(string); ok {
				s.VehicleId = vs
			}
		}
		if v := rec.ValueByKey("velocity"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Velocity = uint16(t)
			case float64:
				s.Velocity = uint16(t)
			}
		}
		if v := rec.ValueByKey("longitude"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Position.Longitude = uint32(t)
			case float64:
				s.Position.Longitude = uint32(t)
			case uint64:
				s.Position.Longitude = uint32(t)
			}
		}
		if v := rec.ValueByKey("latitude"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Position.Latitude = uint32(t)
			case float64:
				s.Position.Latitude = uint32(t)
			case uint64:
				s.Position.Latitude = uint32(t)
			}
		}
		if v := rec.ValueByKey("heading"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Heading = uint32(t)
			case float64:
				s.Heading = uint32(t)
			}
		}
		// 使用记录时间作为 TimestampGNSS
		s.TimestampGNSS = uint64(rec.Time().UTC().UnixMilli())

		// 保存到临时 map（按 vehicleId 覆盖）
		if s.VehicleId != "" {
			tmp[s.VehicleId] = s
		}
	}
	if result.Err() != nil {
		return nil, result.Err()
	}

	// 查询字符串字段 passPoints（单独查询以避免类型冲突）
	passFlux := fmt.Sprintf(`from(bucket:"%s") |> range(start: %s, stop: %s) |> filter(fn:(r)=> r._measurement=="vehicle_status" and r._field=="passPoints") |> group(columns:["vehicleId"]) |> last()`, d.Bucket, start.Format(time.RFC3339), end.Format(time.RFC3339))
	passResult, err := queryAPI.Query(context.Background(), passFlux)
	if err != nil {
		return nil, err
	}
	passMap := make(map[string]string)
	for passResult.Next() {
		rec := passResult.Record()
		vid := ""
		if v := rec.ValueByKey("vehicleId"); v != nil {
			if vs, ok := v.(string); ok {
				vid = vs
			}
		}
		if vid == "" {
			continue
		}
		if v := rec.Value(); v != nil {
			if sstr, ok := v.(string); ok {
				passMap[vid] = sstr
			}
		}
	}
	if passResult.Err() != nil {
		return nil, passResult.Err()
	}

	// Merge numeric tmp 与 passMap，构造输出切片
	out := make([]types.VEH2CLOUD_STATE, 0, len(tmp))
	for vid, s := range tmp {
		// 填充 passPoints
		if sstr, ok := passMap[vid]; ok && sstr != "" {
			var pts []types.Position2D
			if err := json.Unmarshal([]byte(sstr), &pts); err == nil {
				s.PassPoints = pts
			}
		}
		out = append(out, s)
	}

	// 另外，如果有只写了 passPoints 而无 numeric 字段的 vehicle，也把它们包含进来
	for vid, sstr := range passMap {
		if _, exists := tmp[vid]; !exists {
			var s types.VEH2CLOUD_STATE
			s.VehicleId = vid
			if pts, err := func() ([]types.Position2D, error) {
				var p []types.Position2D
				if err := json.Unmarshal([]byte(sstr), &p); err != nil {
					return nil, err
				}
				return p, nil
			}(); err == nil {
				s.PassPoints = pts
			}
			out = append(out, s)
		}
	}

	return out, nil
}

// QueryStatesInRange 返回指定 vehicleId 在时间区间内按时间升序的完整状态列表
func (d *InfluxDao) QueryStatesInRange(vehicleId string, start, end time.Time) ([]types.VEH2CLOUD_STATE, error) {
	// 使用 pivot 将各字段展平，然后按时间排序返回
	flux := fmt.Sprintf(`from(bucket:"%s") |> range(start: %s, stop: %s) |> filter(fn:(r)=> r._measurement=="vehicle_status" and r["vehicleId"]=="%s") |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn: "_value") |> sort(columns:["_time"])`, d.Bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), vehicleId)
	queryAPI := d.InfluxWriter.QueryAPI(d.Org)
	result, err := queryAPI.Query(context.Background(), flux)
	if err != nil {
		return nil, err
	}

	out := make([]types.VEH2CLOUD_STATE, 0)
	for result.Next() {
		rec := result.Record()
		var s types.VEH2CLOUD_STATE
		// 解析常用字段
		s.VehicleId = vehicleId
		s.TimestampGNSS = uint64(rec.Time().UTC().UnixMilli())
		if v := rec.ValueByKey("velocity"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Velocity = uint16(t)
			case float64:
				s.Velocity = uint16(t)
			}
		}
		if v := rec.ValueByKey("longitude"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Position.Longitude = uint32(t)
			case float64:
				s.Position.Longitude = uint32(t)
			case uint64:
				s.Position.Longitude = uint32(t)
			}
		}
		if v := rec.ValueByKey("latitude"); v != nil {
			switch t := v.(type) {
			case int64:
				s.Position.Latitude = uint32(t)
			case float64:
				s.Position.Latitude = uint32(t)
			case uint64:
				s.Position.Latitude = uint32(t)
			}
		}
		// 目的地
		if v := rec.ValueByKey("destLon"); v != nil {
			switch t := v.(type) {
			case int64:
				s.DestLocation.Longitude = uint32(t)
			case float64:
				s.DestLocation.Longitude = uint32(t)
			case uint64:
				s.DestLocation.Longitude = uint32(t)
			}
		}
		if v := rec.ValueByKey("destLat"); v != nil {
			switch t := v.(type) {
			case int64:
				s.DestLocation.Latitude = uint32(t)
			case float64:
				s.DestLocation.Latitude = uint32(t)
			case uint64:
				s.DestLocation.Latitude = uint32(t)
			}
		}
		// passPointsNum
		if v := rec.ValueByKey("passPointsNum"); v != nil {
			switch t := v.(type) {
			case int64:
				s.PassPointsNum = byte(t)
			case float64:
				s.PassPointsNum = byte(t)
			case uint64:
				s.PassPointsNum = byte(t)
			}
		}
		// passPoints 字段为 JSON 字符串
		if v := rec.ValueByKey("passPoints"); v != nil {
			if sstr, ok := v.(string); ok && sstr != "" {
				var pts []types.Position2D
				if err := json.Unmarshal([]byte(sstr), &pts); err == nil {
					s.PassPoints = pts
				}
			}
		}

		out = append(out, s)
	}
	if result.Err() != nil {
		return nil, result.Err()
	}
	return out, nil
}
