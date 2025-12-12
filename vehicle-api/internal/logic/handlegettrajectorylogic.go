package logic

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"time"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type HandleGetTrajectoryLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHandleGetTrajectoryLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HandleGetTrajectoryLogic {
	return &HandleGetTrajectoryLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *HandleGetTrajectoryLogic) HandleGetTrajectory(req *types.TrajectoryReq) (resp *types.Route2TrajectoryResp, err error) {
	// 校验必填字段（中文注释）
	if req.VehicleId == "" || req.StartUtc == "" || req.EndUtc == "" {
		return nil, errors.New("vehicleId, startUtc 和 endUtc 为必填，时间格式为 RFC3339 UTC，例如 2006-01-02T15:04:05Z")
	}

	// 解析 RFC3339 时间
	start, err := time.Parse(time.RFC3339, req.StartUtc)
	if err != nil {
		logx.Errorf("解析 startUtc 失败: %v", err)
		return nil, err
	}
	end, err := time.Parse(time.RFC3339, req.EndUtc)
	if err != nil {
		logx.Errorf("解析 endUtc 失败: %v", err)
		return nil, err
	}

	// 将时间转换为毫秒时间戳（外部接口使用 long 毫秒）
	startMs := start.UnixNano() / int64(time.Millisecond)
	endMs := end.UnixNano() / int64(time.Millisecond)

	// 首先调用行程查询接口（VEHRoute）以获取当天的行程列表
	routeURL := l.svcCtx.Config.VEHRoute.URL
	var allRoutes []map[string]interface{}
	if routeURL != "" {
		// 请求参数：vehicleId, startTime, endTime, page
		routePayload := map[string]interface{}{
			"vehicleId": req.VehicleId,
			"startTime": startMs,
			"endTime":   endMs,
			"page": map[string]interface{}{
				"pageSize":  100,
				"pageIndex": 0,
			},
		}
		rpBody, _ := json.Marshal(routePayload)
		rreq, err := http.NewRequest("POST", routeURL, bytes.NewReader(rpBody))
		if err != nil {
			logx.Errorf("创建外部行程请求失败: %v", err)
		} else {
			rreq.Header.Set("Content-Type", "application/json")
			// 签名头（与其它调用一致）
			if l.svcCtx.Config.AppId != "" && l.svcCtx.Config.Key != "" {
				timestamp := fmt.Sprintf("%d", time.Now().Unix())
				nonceBytes := make([]byte, 12)
				if _, err := rand.Read(nonceBytes); err != nil {
					nonceBytes = []byte(timestamp)
				}
				nonce := hex.EncodeToString(nonceBytes)
				signInput := string(rpBody) + timestamp + l.svcCtx.Config.AppId + nonce + l.svcCtx.Config.Key
				h := sha256.New()
				h.Write([]byte(signInput))
				sign := hex.EncodeToString(h.Sum(nil))
				rreq.Header.Set("appid", l.svcCtx.Config.AppId)
				rreq.Header.Set("timestamp", timestamp)
				rreq.Header.Set("nonce", nonce)
				rreq.Header.Set("sign", sign)
			}
			client := &http.Client{Timeout: 15 * time.Second}
			logx.Infof("调用外部行程 API: url=%s vehicleId=%s start=%d end=%d", routeURL, req.VehicleId, startMs, endMs)
			rresp, err := client.Do(rreq)
			if err != nil {
				logx.Errorf("调用外部行程 API 失败: %v", err)
			} else {
				defer rresp.Body.Close()
				if rresp.StatusCode == http.StatusOK {
					var rbody map[string]interface{}
					if err := json.NewDecoder(rresp.Body).Decode(&rbody); err != nil {
						logx.Errorf("解析外部行程响应体失败: %v", err)
					} else {
						// 取 data.list 数组
						if dataVal, ok := rbody["data"]; ok {
							if dataMap, ok := dataVal.(map[string]interface{}); ok {
								if listVal, ok := dataMap["list"]; ok {
									if arr, ok := listVal.([]interface{}); ok && len(arr) > 0 {
										// 收集所有行程，后续遍历每条行程并调用轨迹接口
										for _, it := range arr {
											if m, ok := it.(map[string]interface{}); ok {
												allRoutes = append(allRoutes, m)
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}
	// 如果没有获取到行程，则返回空数组
	if len(allRoutes) == 0 {
		return &types.Route2TrajectoryResp{
			Code:    0,
			Message: "SUCCESS",
			Data:    []types.Trajectory{},
		}, nil
	}

	// 遍历所有行程，按每条行程的 start/end 调用轨迹接口并构建 types.Trajectory 列表
	var result []types.Trajectory
	for _, routeFields := range allRoutes {
		var rStart, rEnd int64
		if v, ok := routeFields["startTime"]; ok {
			if f, ok := toFloat64(v); ok {
				rStart = int64(f)
			}
		}
		if v, ok := routeFields["endTime"]; ok {
			if f, ok := toFloat64(v); ok {
				rEnd = int64(f)
			}
		}
		if rStart == 0 && rEnd == 0 {
			// fallback 使用请求时间范围
			rStart = startMs
			rEnd = endMs
		}

		pts, err := l.callVEHTrajectory(req.VehicleId, rStart, rEnd)
		if err != nil {
			// 记录错误，但继续构建其他行程，轨迹点为空
			logx.Errorf("获取轨迹失败 routeId=%v err=%v", routeFields["routeId"], err)
			pts = []types.PositionPoint{}
		}

		t := types.Trajectory{}
		t.PositionPoints = pts

		if v, ok := routeFields["routeId"]; ok {
			if s, ok := v.(string); ok {
				t.RouteId = s
			}
		}
		if v, ok := routeFields["vehicleId"]; ok {
			if s, ok := v.(string); ok {
				t.VehicleId = s
			}
		}
		if v, ok := routeFields["vin"]; ok {
			if s, ok := v.(string); ok {
				t.Vin = s
			}
		}
		if v, ok := routeFields["plateNo"]; ok {
			if s, ok := v.(string); ok {
				t.PlateNo = s
			}
		}
		if v, ok := routeFields["mileage"]; ok {
			if f, ok := toFloat64(v); ok {
				t.Mileage = f
			}
		}
		if v, ok := routeFields["durationTime"]; ok {
			if f, ok := toFloat64(v); ok {
				t.DurationTime = f
			}
		}
		if v, ok := routeFields["autoMileage"]; ok {
			if f, ok := toFloat64(v); ok {
				t.AutoMileage = f
			}
		}
		if v, ok := routeFields["autoDuration"]; ok {
			if f, ok := toFloat64(v); ok {
				t.AutoDuration = f
			}
		}
		if v, ok := routeFields["autoMileageReal"]; ok {
			if f, ok := toFloat64(v); ok {
				t.AutoMileageReal = f
			}
		}
		if v, ok := routeFields["autoDurationReal"]; ok {
			if f, ok := toFloat64(v); ok {
				t.AutoDurationReal = f
			}
		}
		if v, ok := routeFields["vehicleFactory"]; ok {
			if s, ok := v.(string); ok {
				t.VehicleFactory = s
			}
		}
		if v, ok := routeFields["vehicleFactoryName"]; ok {
			if s, ok := v.(string); ok {
				t.VehicleFactoryName = s
			}
		}
		// startTime/endTime 转为 RFC3339
		if v, ok := routeFields["startTime"]; ok {
			if f, ok := toFloat64(v); ok {
				tms := int64(f)
				if tms < 1e12 {
					tms = tms * 1000
				}
				t.StartTime = time.Unix(0, tms*int64(time.Millisecond)).UTC().Format(time.RFC3339)
			}
		}
		if v, ok := routeFields["endTime"]; ok {
			if f, ok := toFloat64(v); ok {
				tms := int64(f)
				if tms < 1e12 {
					tms = tms * 1000
				}
				t.EndTime = time.Unix(0, tms*int64(time.Millisecond)).UTC().Format(time.RFC3339)
			}
		}

		// 若未设置 VehicleId，则使用请求中的
		if t.VehicleId == "" {
			t.VehicleId = req.VehicleId
		}

		result = append(result, t)
	}

	// 返回全部行程
	respOut := &types.Route2TrajectoryResp{
		Code:    0,
		Message: "SUCCESS",
		Data:    result,
	}
	return respOut, nil

}

// callVEHTrajectory 调用配置中的 VEHTrajectory 接口并解析返回的 runPath 为 PositionPoint 列表
func (l *HandleGetTrajectoryLogic) callVEHTrajectory(vehicleId string, startMs, endMs int64) ([]types.PositionPoint, error) {
	apiURL := l.svcCtx.Config.VEHTrajectory.URL
	if apiURL == "" {
		logx.Errorf("外部轨迹 API 地址未配置 (VEHTrajectory)")
		return nil, fmt.Errorf("external trajectory API url not configured")
	}

	payload := map[string]interface{}{
		"vehicleId": vehicleId,
		"startTime": startMs,
		"endTime":   endMs,
	}
	bodyBytes, _ := json.Marshal(payload)
	httpReq, err := http.NewRequest("POST", apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		logx.Errorf("创建外部轨迹请求失败: %v", err)
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if l.svcCtx.Config.AppId != "" && l.svcCtx.Config.Key != "" {
		timestamp := fmt.Sprintf("%d", time.Now().Unix())
		nonceBytes := make([]byte, 12)
		if _, err := rand.Read(nonceBytes); err != nil {
			nonceBytes = []byte(timestamp)
		}
		nonce := hex.EncodeToString(nonceBytes)
		signInput := string(bodyBytes) + timestamp + l.svcCtx.Config.AppId + nonce + l.svcCtx.Config.Key
		h := sha256.New()
		h.Write([]byte(signInput))
		sign := hex.EncodeToString(h.Sum(nil))
		httpReq.Header.Set("appid", l.svcCtx.Config.AppId)
		httpReq.Header.Set("timestamp", timestamp)
		httpReq.Header.Set("nonce", nonce)
		httpReq.Header.Set("sign", sign)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	logx.Infof("调用外部轨迹 API: url=%s vehicleId=%s start=%d end=%d", apiURL, vehicleId, startMs, endMs)
	httpResp, err := client.Do(httpReq)
	if err != nil {
		logx.Errorf("调用外部轨迹 API 失败: %v", err)
		return nil, err
	}
	defer httpResp.Body.Close()
	if httpResp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(httpResp.Body, 4096))
		logx.Errorf("外部轨迹 API 返回非200: status=%d body=%s", httpResp.StatusCode, string(b))
		return nil, fmt.Errorf("external API returned status %d: %s", httpResp.StatusCode, string(b))
	}
	var respBody map[string]interface{}
	if err := json.NewDecoder(httpResp.Body).Decode(&respBody); err != nil {
		logx.Errorf("解析外部轨迹响应体失败: %v", err)
		return nil, err
	}
	// 检查 code
	if codeVal, ok := respBody["code"]; ok {
		if codeFloat, ok := codeVal.(float64); ok {
			if int(codeFloat) != 0 {
				logx.Errorf("外部轨迹 API 返回错误 code=%v full=%+v", codeFloat, respBody)
				return nil, fmt.Errorf("external API returned error code: %v", codeFloat)
			}
		}
	}
	// 抽取 runPath
	var runPathRaw interface{}
	if dataVal, ok := respBody["data"]; ok {
		if dataMap, ok := dataVal.(map[string]interface{}); ok {
			if v, ok := dataMap["runPath"]; ok {
				runPathRaw = v
			} else {
				runPathRaw = dataVal
			}
		} else {
			runPathRaw = dataVal
		}
	} else {
		runPathRaw = respBody
	}

	pts := parseRunPathToPoints(runPathRaw)
	return pts, nil
}

// parseRunPathToPoints 将外部 runPath 多种格式解析为 []types.PositionPoint
func parseRunPathToPoints(runPathRaw interface{}) []types.PositionPoint {
	pts := make([]types.PositionPoint, 0)
	if arr, ok := runPathRaw.([]interface{}); ok {
		for _, it := range arr {
			// 数组格式
			if inner, ok := it.([]interface{}); ok && len(inner) >= 3 {
				var lonF, latF, tF float64
				if v0, ok0 := toFloat64(inner[0]); ok0 {
					if v1, ok1 := toFloat64(inner[1]); ok1 {
						if v2, ok2 := toFloat64(inner[2]); ok2 {
							lonF, latF, tF = v0, v1, v2
						}
					}
				}
				if lonF == 0 && latF == 0 {
					if v0, ok0 := toFloat64(inner[0]); ok0 {
						if v1, ok1 := toFloat64(inner[1]); ok1 {
							if v2, ok2 := toFloat64(inner[2]); ok2 {
								if v0 > 1e11 {
									tF, lonF, latF = v0, v1, v2
								}
							}
						}
					}
				}
				if !(math.IsNaN(lonF) || math.IsNaN(latF) || math.IsNaN(tF)) {
					tMs := int64(tF)
					if tMs < 1e12 {
						tMs = tMs * 1000
					}
					ts := time.Unix(0, tMs*int64(time.Millisecond))
					lonScaled := int64(math.Round(lonF * 1e7))
					latScaled := int64(math.Round(latF * 1e7))
					pts = append(pts, types.PositionPoint{Timestamp: ts.UTC().Format(time.RFC3339), Longitude: int64(lonScaled), Latitude: int64(latScaled)})
					continue
				}
			}
			// 对象格式
			if m, ok := it.(map[string]interface{}); ok {
				var lonF, latF, tF float64
				if v, ok := m["longitude"]; ok {
					if f, ok := toFloat64(v); ok {
						lonF = f
					}
				}
				if v, ok := m["lat"]; ok {
					if f, ok := toFloat64(v); ok {
						latF = f
					}
				}
				if v, ok := m["latitude"]; ok {
					if f, ok := toFloat64(v); ok {
						latF = f
					}
				}
				if v, ok := m["timestamp"]; ok {
					if f, ok := toFloat64(v); ok {
						tF = f
					}
				}
				if lonF != 0 || latF != 0 {
					tMs := int64(tF)
					if tMs < 1e12 {
						tMs = tMs * 1000
					}
					ts := time.Unix(0, tMs*int64(time.Millisecond))
					lonScaled := int64(math.Round(lonF * 1e7))
					latScaled := int64(math.Round(latF * 1e7))
					pts = append(pts, types.PositionPoint{Timestamp: ts.UTC().Format(time.RFC3339), Longitude: int64(lonScaled), Latitude: int64(latScaled)})
					continue
				}
			}
		}
	}
	return pts
}

// toFloat64 尝试将接口类型转换为 float64
func toFloat64(v interface{}) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case uint64:
		return float64(t), true
	case json.Number:
		f, err := t.Float64()
		if err == nil {
			return f, true
		}
		return 0, false
	default:
		return 0, false
	}
}
