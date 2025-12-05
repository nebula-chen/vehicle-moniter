package logic

import (
	"bytes"
	crand "crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"context"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type VehicleOnlineLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewVehicleOnlineLogic(ctx context.Context, svcCtx *svc.ServiceContext) *VehicleOnlineLogic {
	return &VehicleOnlineLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// VehicleOnline 调用外部“车辆位置信息获取”接口，并根据调用模式返回不同结构：
// - internal=true: 返回在线车辆ID数组（用于服务内部订阅/订阅列表）
// - internal=false: 面向前端，返回不在线车辆的 vehicleId 与经纬度数组，便于前端展示
func (l *VehicleOnlineLogic) VehicleOnline(categoryCode int, internal bool) (resp *types.VehicleOnlineResp, err error) {
	apiURL := l.svcCtx.Config.VEHPosition.URL
	if apiURL == "" {
		logx.Errorf("外部车辆位置 API 地址未配置 (VEHPosition.URL)")
		return nil, fmt.Errorf("external vehicle position api url not configured")
	}

	// 组装请求体
	payload := map[string]interface{}{"categoryCode": categoryCode}
	bodyBytes, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		logx.Errorf("创建外部车辆位置请求失败: %v", err)
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	// 如果配置了 AppId/Key，则生成鉴权头（同其他外部 HTTP 接口约定）
	if l.svcCtx.Config.AppId != "" && l.svcCtx.Config.Key != "" {
		timestamp := fmt.Sprintf("%d", time.Now().Unix())
		nonceBytes := make([]byte, 12)
		if _, err := crand.Read(nonceBytes); err != nil {
			copy(nonceBytes, []byte(timestamp))
		}
		nonce := hex.EncodeToString(nonceBytes)

		signInput := string(bodyBytes) + timestamp + l.svcCtx.Config.AppId + nonce + l.svcCtx.Config.Key
		h := sha256.New()
		h.Write([]byte(signInput))
		sign := hex.EncodeToString(h.Sum(nil))

		req.Header.Set("appid", l.svcCtx.Config.AppId)
		req.Header.Set("timestamp", timestamp)
		req.Header.Set("nonce", nonce)
		req.Header.Set("sign", sign)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	logx.Infof("调用外部车辆位置 API: url=%s categoryCode=%d", apiURL, categoryCode)
	httpResp, err := client.Do(req)
	if err != nil {
		logx.Errorf("调用外部车辆位置 API 失败: %v", err)
		return nil, err
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(httpResp.Body, 4096))
		logx.Errorf("外部车辆位置 API 返回非200: status=%d body=%s", httpResp.StatusCode, string(b))
		return nil, fmt.Errorf("external API returned status %d: %s", httpResp.StatusCode, string(b))
	}

	// 解析响应：期望结构 { code:0, data: { position: [ {vehicleId, lon, lat, online, timestamp}, ... ] } }
	var ext struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			Position []struct {
				VehicleId string  `json:"vehicleId"`
				Lon       float64 `json:"lon"`
				Lat       float64 `json:"lat"`
				Online    bool    `json:"online"`
				Timestamp int64   `json:"timestamp"`
			} `json:"position"`
		} `json:"data"`
	}

	if err := json.NewDecoder(httpResp.Body).Decode(&ext); err != nil {
		logx.Errorf("解析外部车辆位置响应失败: %v", err)
		return nil, err
	}

	if ext.Code != 0 {
		logx.Errorf("外部车辆位置 API 返回错误 code=%d message=%s", ext.Code, ext.Message)
		return nil, fmt.Errorf("external api returned code %d", ext.Code)
	}

	// 构建返回结构
	onlineIds := make([]string, 0)
	offline := make([]types.OfflinePosition, 0)
	for _, p := range ext.Data.Position {
		if p.Online {
			onlineIds = append(onlineIds, p.VehicleId)
		} else {
			offline = append(offline, types.OfflinePosition{
				VehicleId: p.VehicleId,
				Position:  types.Position2D{Lon: p.Lon, Lat: p.Lat},
			})
		}
	}

	resp = &types.VehicleOnlineResp{
		OnlineCount:      len(onlineIds),
		OnlineVehicleIds: nil,
		OfflinePositions: nil,
	}

	if internal {
		// 服务内部调用：返回在线车辆ID数组，便于订阅使用
		resp.OnlineVehicleIds = onlineIds
		logx.Infof("VehicleOnline internal mode: found %d online vehicles", len(onlineIds))
		return resp, nil
	}

	// 面向前端：返回不在线车辆的 vehicleId 与经纬度数组
	resp.OfflinePositions = offline
	// 同时保留 OnlineCount 供前端展示整体在线数量
	logx.Infof("VehicleOnline external mode: online=%d offline=%d", len(onlineIds), len(offline))
	return resp, nil
}
