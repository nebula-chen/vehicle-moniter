package apiclient

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

// VEHInfoClient 用于调用外部车辆信息列表API
type VEHInfoClient struct {
	apiURL    string
	client    *http.Client
	appId     string
	appSecret string
}

// NewVEHInfoClient 创建车辆API客户端
// NewVEHInfoClient 创建车辆API客户端，传入 apiURL, appId, appSecret
func NewVEHInfoClient(apiURL, appId, appSecret string) *VEHInfoClient {
	return &VEHInfoClient{
		apiURL:    apiURL,
		client:    &http.Client{},
		appId:     appId,
		appSecret: appSecret,
	}
}

// GetAllVehicles 从外部API获取所有车辆信息（或按categoryCode筛选）
// 返回VehicleInfo列表
func (c *VEHInfoClient) GetAllVehicles(categoryCode *int) ([]types.VehicleInfo, error) {
	if c.apiURL == "" {
		return nil, fmt.Errorf("vehicle API URL not configured")
	}

	logx.Infof("开始获取车辆列表: apiURL=%s categoryCode=%v", c.apiURL, categoryCode)

	// 构建请求体
	reqBody := map[string]interface{}{}
	if categoryCode != nil {
		reqBody["categoryCode"] = *categoryCode
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		logx.Errorf("VEHInfoClient: 请求体序列化失败: %v", err)
		return nil, err
	}

	// 发送POST请求
	req, err := http.NewRequest("POST", c.apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		logx.Errorf("VEHInfoClient: 创建HTTP请求失败: %v", err)
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	// 如果配置了 appId 和 appSecret，则按约定生成 timestamp、nonce 和 sign 放入 Header
	if c.appId != "" && c.appSecret != "" {
		timestamp := fmt.Sprintf("%d", time.Now().Unix())
		nonceBytes := make([]byte, 12)
		if _, err := rand.Read(nonceBytes); err != nil {
			// fallback to timestamp-based nonce
			nonceBytes = []byte(timestamp)
		}
		nonce := hex.EncodeToString(nonceBytes)

		// data.toString 使用请求体的 JSON 字符串（与发送体保持一致）
		dataStr := string(jsonData)
		// 计算签名: SHA-256(dataStr + timestamp + appId + nonce + appSecret)
		signInput := dataStr + timestamp + c.appId + nonce + c.appSecret
		h := sha256.New()
		h.Write([]byte(signInput))
		sign := hex.EncodeToString(h.Sum(nil))

		// 设置鉴权相关请求头（使用小写或按约定）
		req.Header.Set("appid", c.appId)
		req.Header.Set("timestamp", timestamp)
		req.Header.Set("nonce", nonce)
		req.Header.Set("sign", sign)
	}
	logx.Debugf("VEHInfoClient: 发送 POST 到 %s, headers=%v", c.apiURL, req.Header)

	resp, err := c.client.Do(req)
	if err != nil {
		logx.Errorf("VEHInfoClient: 调用API连接失败: %v", err)
		return nil, fmt.Errorf("API连接失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		logx.Errorf("VEHInfoClient: 车辆API返回非200状态 %d: %s", resp.StatusCode, string(bodyBytes))
		return nil, fmt.Errorf("vehicle API returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	// 解析响应
	respBody := map[string]interface{}{}
	decoder := json.NewDecoder(resp.Body)
	if err := decoder.Decode(&respBody); err != nil {
		logx.Errorf("VEHInfoClient: 解析响应体失败: %v", err)
		return nil, err
	}

	// 检查错误码
	code, ok := respBody["code"].(float64)
	if !ok || code != 0 {
		logx.Errorf("VEHInfoClient: 车辆API返回错误码=%v, keys=%v, full_resp=%+v", respBody["code"], getKeys(respBody), respBody)
		return nil, fmt.Errorf("vehicle API returned error code: %v", respBody["code"])
	}

	// 解析data字段（应该是[]VehicleInfo的JSON数组）
	dataRaw, ok := respBody["data"]
	if !ok {
		return nil, fmt.Errorf("no data field in response")
	}

	// 将data转换为JSON并反序列化
	dataBytes, err := json.Marshal(dataRaw)
	if err != nil {
		logx.Errorf("VEHInfoClient: 将 data 字段转为 JSON 失败: %v", err)
		return nil, err
	}

	var vehicles []types.VehicleInfo
	if err := json.Unmarshal(dataBytes, &vehicles); err != nil {
		logx.Errorf("VEHInfoClient: 反序列化车辆列表失败: %v, data=%s", err, string(dataBytes))
		return nil, err
	}

	logx.Infof("获取车辆列表成功: 共接收 %d 辆车辆", len(vehicles))
	return vehicles, nil
}

// getKeys 获取map的所有键用于日志诊断
func getKeys(m map[string]interface{}) []string {
	var keys []string
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
