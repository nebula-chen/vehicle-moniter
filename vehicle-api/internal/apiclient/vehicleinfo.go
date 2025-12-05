package apiclient

import (
	"bytes"
	"context"
	crand "crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/zeromicro/go-zero/core/logx"

	"vehicle-api/internal/config"
)

// VEHInfoClient 用于定期从外部 HTTP API 拉取全部车辆信息列表
type VEHInfoClient struct {
	cfg       config.HttpConfig
	appId     string
	appSecret string
	client    *http.Client
}

// NewVEHInfoClient 创建 VEHInfoClient
func NewVEHInfoClient(cfg config.HttpConfig, appId, appSecret string) *VEHInfoClient {
	return &VEHInfoClient{
		cfg:       cfg,
		appId:     appId,
		appSecret: appSecret,
		client:    &http.Client{Timeout: 20 * time.Second},
	}
}

// FetchAll 发起一次请求获取全部车辆信息列表，返回原始响应体字节（调用方负责日志/处理）
func (c *VEHInfoClient) FetchAll(ctx context.Context) ([]byte, error) {
	if c.cfg.URL == "" {
		return nil, fmt.Errorf("VEHInfo API 地址未配置")
	}

	// 外部协议说明：POST 请求，body 可包含 categoryCode（Integer），不传表示返回全部车辆
	payload := map[string]interface{}{}
	bodyBytes, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, "POST", c.cfg.URL, bytes.NewReader(bodyBytes))
	if err != nil {
		logx.Errorf("创建 VEHInfo 请求失败: %v", err)
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	// 如果配置了 AppId/Key，则按同 Trajectory 的约定生成鉴权头
	if c.appId != "" && c.appSecret != "" {
		timestamp := fmt.Sprintf("%d", time.Now().Unix())
		nonceBytes := make([]byte, 12)
		if _, err := crand.Read(nonceBytes); err != nil {
			// fallback
			copy(nonceBytes, []byte(timestamp))
		}
		nonce := hex.EncodeToString(nonceBytes)

		signInput := string(bodyBytes) + timestamp + c.appId + nonce + c.appSecret
		h := sha256.New()
		h.Write([]byte(signInput))
		sign := hex.EncodeToString(h.Sum(nil))

		req.Header.Set("appid", c.appId)
		req.Header.Set("timestamp", timestamp)
		req.Header.Set("nonce", nonce)
		req.Header.Set("sign", sign)
	}

	logx.Infof("调用外部 VEHInfo API: url=%s", c.cfg.URL)
	resp, err := c.client.Do(req)
	if err != nil {
		logx.Errorf("调用外部 VEHInfo API 失败: %v", err)
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		logx.Errorf("外部 VEHInfo API 返回非200: status=%d body=%s", resp.StatusCode, string(b))
		return nil, fmt.Errorf("external VEHInfo API returned status %d", resp.StatusCode)
	}

	b, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 读取上限 1MB
	if err != nil {
		logx.Errorf("读取 VEHInfo 响应体失败: %v", err)
		return nil, err
	}

	return b, nil
}

// FetchAll 简化版的无 ctx 调用（向后兼容）
func (c *VEHInfoClient) FetchAllNoCtx() ([]byte, error) {
	return c.FetchAll(context.Background())
}
