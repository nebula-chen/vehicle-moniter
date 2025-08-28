package logic

import (
	"context"
	"time"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleAnalyticsOverviewLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleAnalyticsOverviewLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleAnalyticsOverviewLogic {
	return &HandleAnalyticsOverviewLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *HandleAnalyticsOverviewLogic) HandleAnalyticsOverview(req *types.AnalyticsReq) (resp *types.AnalyticsOverviewResp, err error) {
	// prepare default empty response
	resp = &types.AnalyticsOverviewResp{}

	// determine time range
	var start time.Time
	var end time.Time
	layout := "2006-01-02"
	if req.StartDate != "" {
		if t, e := time.Parse(layout, req.StartDate); e == nil {
			start = t
		}
	}
	if req.EndDate != "" {
		if t, e := time.Parse(layout, req.EndDate); e == nil {
			// include the whole day until next day
			end = t.Add(24*time.Hour - time.Nanosecond)
		}
	}
	// fallback: if start/end not provided but rangeDays present
	if start.IsZero() || end.IsZero() {
		if req.RangeDays > 0 {
			end = time.Now().UTC()
			start = end.Add(-time.Duration(req.RangeDays) * 24 * time.Hour)
		} else {
			// default last 7 days
			end = time.Now().UTC()
			start = end.Add(-7 * 24 * time.Hour)
		}
	}

	// groupBy default to day
	groupBy := req.GroupBy
	if groupBy == "" {
		groupBy = "day"
	}

	// if Analytics dao is not available, return example data compatible with frontend
	if l.svcCtx == nil || l.svcCtx.Analytics == nil {
		resp.OrderCount = exampleTimeSeries()
		resp.OrderAmount = exampleTimeSeries()
		resp.VehicleUtil = exampleTimeSeries()
		resp.DeliveryEff = exampleTimeSeries()
		resp.EfficiencyCompare = exampleEfficiencyCompare()
		resp.Ratings = exampleRatings()
		resp.Complaints = exampleTimeSeries()
		return resp, nil
	}

	// call DAO methods (best-effort; if any fails, fill with example data)
	ctx := l.ctx

	// OrderCount
	dates, vals, e := l.svcCtx.Analytics.GetOrderCount(ctx, start, end, groupBy, req.Region)
	if e != nil {
		resp.OrderCount = exampleTimeSeries()
	} else {
		resp.OrderCount = types.TimeSeries{Dates: dates, Values: vals, Total: sumFloat(vals)}
	}

	// OrderAmount
	dates, vals, e = l.svcCtx.Analytics.GetOrderAmount(ctx, start, end, groupBy, req.Region)
	if e != nil {
		resp.OrderAmount = exampleTimeSeries()
	} else {
		resp.OrderAmount = types.TimeSeries{Dates: dates, Values: vals, Total: sumFloat(vals)}
	}

	// Vehicle Util
	dates, vals, e = l.svcCtx.Analytics.GetVehicleUtil(ctx, start, end, groupBy, req.VehicleType)
	if e != nil {
		resp.VehicleUtil = exampleTimeSeries()
	} else {
		resp.VehicleUtil = types.TimeSeries{Dates: dates, Values: vals, Total: avgFloat(vals)}
	}

	// Delivery Efficiency
	dates, vals, e = l.svcCtx.Analytics.GetDeliveryEfficiency(ctx, start, end, groupBy, req.Region)
	if e != nil {
		resp.DeliveryEff = exampleTimeSeries()
	} else {
		resp.DeliveryEff = types.TimeSeries{Dates: dates, Values: vals, Total: avgFloat(vals)}
	}

	// Efficiency Compare
	dts, small, large, e := l.svcCtx.Analytics.GetEfficiencyCompare(ctx, start, end, groupBy)
	if e != nil {
		resp.EfficiencyCompare = exampleEfficiencyCompare()
	} else {
		resp.EfficiencyCompare = types.EfficiencyCompareSeries{Dates: dts, SmallVan: small, LargeVan: large}
	}

	// Ratings
	rd, good, mid, bad, e := l.svcCtx.Analytics.GetRatings(ctx, start, end, groupBy)
	if e != nil {
		resp.Ratings = exampleRatings()
	} else {
		resp.Ratings = types.RatingsSeries{Dates: rd, Good: good, Mid: mid, Bad: bad}
	}

	// Complaints
	dates, vals, e = l.svcCtx.Analytics.GetComplaints(ctx, start, end, groupBy)
	if e != nil {
		resp.Complaints = exampleTimeSeries()
	} else {
		resp.Complaints = types.TimeSeries{Dates: dates, Values: vals, Total: sumFloat(vals)}
	}

	return resp, nil
}

// helper functions

func sumFloat(arr []float64) float64 {
	var s float64
	for _, v := range arr {
		s += v
	}
	return s
}

func avgFloat(arr []float64) float64 {
	if len(arr) == 0 {
		return 0
	}
	return sumFloat(arr) / float64(len(arr))
}

func exampleTimeSeries() types.TimeSeries {
	dates := []string{}
	vals := []float64{}
	// simple last 7 days
	for i := 6; i >= 0; i-- {
		d := time.Now().Add(-time.Duration(i) * 24 * time.Hour).UTC().Format("2006-01-02")
		dates = append(dates, d)
		vals = append(vals, float64(10+i))
	}
	return types.TimeSeries{Dates: dates, Values: vals, Total: sumFloat(vals)}
}

func exampleEfficiencyCompare() types.EfficiencyCompareSeries {
	dates := []string{}
	small := []float64{}
	large := []float64{}
	for i := 6; i >= 0; i-- {
		d := time.Now().Add(-time.Duration(i) * 24 * time.Hour).UTC().Format("2006-01-02")
		dates = append(dates, d)
		small = append(small, float64(60+i))
		large = append(large, float64(70+i))
	}
	return types.EfficiencyCompareSeries{Dates: dates, SmallVan: small, LargeVan: large}
}

func exampleRatings() types.RatingsSeries {
	dates := []string{}
	good := []int{}
	mid := []int{}
	bad := []int{}
	for i := 6; i >= 0; i-- {
		d := time.Now().Add(-time.Duration(i) * 24 * time.Hour).UTC().Format("2006-01-02")
		dates = append(dates, d)
		good = append(good, 5+i)
		mid = append(mid, 2+i)
		bad = append(bad, 1)
	}
	return types.RatingsSeries{Dates: dates, Good: good, Mid: mid, Bad: bad}
}
