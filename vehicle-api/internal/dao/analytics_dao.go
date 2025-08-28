package dao

import (
	"context"
	"fmt"
	"time"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
)

// AnalyticsDao 提供按类别的分析查询方法，返回用于构建前端 time series 的数据
type AnalyticsDao struct {
	client influxdb2.Client
	org    string
	bucket string
}

func NewAnalyticsDao(client influxdb2.Client, org, bucket string) *AnalyticsDao {
	return &AnalyticsDao{client: client, org: org, bucket: bucket}
}

// helper: execute flux 查询并返回时间和值的数组（float64）
func (a *AnalyticsDao) queryTimeSeries(ctx context.Context, flux string) ([]string, []float64, error) {
	api := a.client.QueryAPI(a.org)
	res, err := api.Query(ctx, flux)
	if err != nil {
		return nil, nil, err
	}
	var dates []string
	var vals []float64
	for res.Next() {
		rec := res.Record()
		t := rec.Time().UTC().Format("2006-01-02")
		// 读取 _value
		v := rec.Value()
		var fv float64
		switch vt := v.(type) {
		case int64:
			fv = float64(vt)
		case float64:
			fv = vt
		case uint64:
			fv = float64(vt)
		default:
			fv = 0
		}
		dates = append(dates, t)
		vals = append(vals, fv)
	}
	if res.Err() != nil {
		return nil, nil, res.Err()
	}
	return dates, vals, nil
}

// GetOrderCount 查询订单数量的时序数据（示例假设 measurement 名称为 "orders"，字段为 count/amount）
func (a *AnalyticsDao) GetOrderCount(ctx context.Context, start, end time.Time, groupBy string, region string) ([]string, []float64, error) {
	// Flux 示例：按时间分组求和
	// groupBy 可为：day/week/month -> 使用 aggregateWindow
	window := "1d"
	if groupBy == "week" {
		window = "7d"
	}
	if groupBy == "month" {
		window = "30d"
	}

	// 过滤 region 如果提供
	regionFilter := ""
	if region != "" {
		regionFilter = fmt.Sprintf(` and r["region"] == "%s"`, region)
	}

	flux := fmt.Sprintf(`from(bucket:"%s") |> range(start: %s, stop: %s) |> filter(fn:(r)=> r._measurement == "orders"%s and r._field == "count") |> aggregateWindow(every: %s, fn: sum) |> yield()`, a.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), regionFilter, window)

	return a.queryTimeSeries(ctx, flux)
}

// GetOrderAmount 查询订单金额时序（measurement orders, field amount）
func (a *AnalyticsDao) GetOrderAmount(ctx context.Context, start, end time.Time, groupBy string, region string) ([]string, []float64, error) {
	window := "1d"
	if groupBy == "week" {
		window = "7d"
	}
	if groupBy == "month" {
		window = "30d"
	}
	regionFilter := ""
	if region != "" {
		regionFilter = fmt.Sprintf(` and r["region"] == "%s"`, region)
	}
	flux := fmt.Sprintf(`from(bucket:"%s") |> range(start: %s, stop: %s) |> filter(fn:(r)=> r._measurement == "orders"%s and r._field == "amount") |> aggregateWindow(every: %s, fn: sum) |> yield()`, a.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), regionFilter, window)
	return a.queryTimeSeries(ctx, flux)
}

// GetVehicleUtil 查询车辆利用率（假设 measurement vehicle_metrics, field utilPercent）
func (a *AnalyticsDao) GetVehicleUtil(ctx context.Context, start, end time.Time, groupBy string, vehicleType string) ([]string, []float64, error) {
	window := "1d"
	if groupBy == "week" {
		window = "7d"
	}
	if groupBy == "month" {
		window = "30d"
	}
	vtFilter := ""
	if vehicleType != "" {
		vtFilter = fmt.Sprintf(` and r["vehicleType"] == "%s"`, vehicleType)
	}
	flux := fmt.Sprintf(`from(bucket:"%s") |> range(start: %s, stop: %s) |> filter(fn:(r)=> r._measurement == "vehicle_metrics"%s and r._field == "utilPercent") |> aggregateWindow(every: %s, fn: mean) |> yield()`, a.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), vtFilter, window)
	return a.queryTimeSeries(ctx, flux)
}

// GetDeliveryEfficiency 查询平均配送时长（measurement delivery_metrics, field avgMinutes）
func (a *AnalyticsDao) GetDeliveryEfficiency(ctx context.Context, start, end time.Time, groupBy string, region string) ([]string, []float64, error) {
	window := "1d"
	if groupBy == "week" {
		window = "7d"
	}
	if groupBy == "month" {
		window = "30d"
	}
	rf := ""
	if region != "" {
		rf = fmt.Sprintf(` and r["region"] == "%s"`, region)
	}
	flux := fmt.Sprintf(`from(bucket:"%s") |> range(start: %s, stop: %s) |> filter(fn:(r)=> r._measurement == "delivery_metrics"%s and r._field == "avgMinutes") |> aggregateWindow(every: %s, fn: mean) |> yield()`, a.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), rf, window)
	return a.queryTimeSeries(ctx, flux)
}

// GetEfficiencyCompare 查询按车型/区域的对比（返回两个 series）
func (a *AnalyticsDao) GetEfficiencyCompare(ctx context.Context, start, end time.Time, groupBy string) ([]string, []float64, []float64, error) {
	window := "1d"
	if groupBy == "week" {
		window = "7d"
	}
	if groupBy == "month" {
		window = "30d"
	}
	// smallVan
	fluxSmall := fmt.Sprintf(`from(bucket:"%s") |> range(start:%s, stop:%s) |> filter(fn:(r)=> r._measurement=="efficiency" and r["vehicleClass"]=="small" and r._field=="score") |> aggregateWindow(every: %s, fn: mean)`, a.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), window)
	// largeVan
	fluxLarge := fmt.Sprintf(`from(bucket:"%s") |> range(start:%s, stop:%s) |> filter(fn:(r)=> r._measurement=="efficiency" and r["vehicleClass"]=="large" and r._field=="score") |> aggregateWindow(every: %s, fn: mean)`, a.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), window)

	datesSmall, valsSmall, err := a.queryTimeSeries(ctx, fluxSmall)
	if err != nil {
		return nil, nil, nil, err
	}
	_, valsLarge, err := a.queryTimeSeries(ctx, fluxLarge)
	if err != nil {
		return nil, nil, nil, err
	}
	// 假设 datesSmall 与 datesLarge 对齐，返回 datesSmall
	return datesSmall, valsSmall, valsLarge, nil
}

// GetRatings 查询客户评价（好/中/差）的时序数据（measurement ratings，fields good/mid/bad）
func (a *AnalyticsDao) GetRatings(ctx context.Context, start, end time.Time, groupBy string) ([]string, []int, []int, []int, error) {
	// 简化：分别查询 three fields
	window := "1d"
	if groupBy == "week" {
		window = "7d"
	}
	if groupBy == "month" {
		window = "30d"
	}

	fluxGood := fmt.Sprintf(`from(bucket:"%s") |> range(start:%s, stop:%s) |> filter(fn:(r)=> r._measurement=="ratings" and r._field=="good") |> aggregateWindow(every:%s, fn:sum)`, a.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), window)
	fluxMid := fmt.Sprintf(`from(bucket:"%s") |> range(start:%s, stop:%s) |> filter(fn:(r)=> r._measurement=="ratings" and r._field=="mid") |> aggregateWindow(every:%s, fn:sum)`, a.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), window)
	fluxBad := fmt.Sprintf(`from(bucket:"%s") |> range(start:%s, stop:%s) |> filter(fn:(r)=> r._measurement=="ratings" and r._field=="bad") |> aggregateWindow(every:%s, fn:sum)`, a.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), window)

	dates, g, err := a.queryTimeSeries(ctx, fluxGood)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	_, m, err := a.queryTimeSeries(ctx, fluxMid)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	_, b, err := a.queryTimeSeries(ctx, fluxBad)
	if err != nil {
		return nil, nil, nil, nil, err
	}

	// 转换为 int slice
	gi := make([]int, len(g))
	mi := make([]int, len(m))
	bi := make([]int, len(b))
	for i := range g {
		gi[i] = int(g[i])
	}
	for i := range m {
		mi[i] = int(m[i])
	}
	for i := range b {
		bi[i] = int(b[i])
	}
	return dates, gi, mi, bi, nil
}

// GetComplaints 查询投诉数量
func (a *AnalyticsDao) GetComplaints(ctx context.Context, start, end time.Time, groupBy string) ([]string, []float64, error) {
	window := "1d"
	if groupBy == "week" {
		window = "7d"
	}
	if groupBy == "month" {
		window = "30d"
	}
	flux := fmt.Sprintf(`from(bucket:"%s") |> range(start:%s, stop:%s) |> filter(fn:(r)=> r._measurement=="complaints" and r._field=="count") |> aggregateWindow(every:%s, fn:sum) |> yield()`, a.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), window)
	return a.queryTimeSeries(ctx, flux)
}
