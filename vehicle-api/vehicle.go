package main

import (
	"flag"
	"fmt"

	"vehicle-api/internal/config"
	"vehicle-api/internal/handler"
	"vehicle-api/internal/svc"
	"vehicle-api/internal/tcp"

	"github.com/zeromicro/go-zero/core/logx"

	"github.com/zeromicro/go-zero/core/conf"
	"github.com/zeromicro/go-zero/rest"
)

var configFile = flag.String("f", "etc/vehicle-api.yaml", "the config file")

func main() {
	flag.Parse()

	var c config.Config
	conf.MustLoad(*configFile, &c)

	server := rest.MustNewServer(c.RestConf)
	defer server.Stop()

	ctx := svc.NewServiceContext(c)
	handler.RegisterHandlers(server, ctx)

	// 启动 TCP 协议服务（以便设备能通过 TCP 推送数据）
	if c.TCPPort != "" {
		tcpSrv := tcp.NewTCPServer(c.TCPPort, ctx)
		go func() {
			if err := tcpSrv.Start(); err != nil {
				logx.Errorf("tcp server exit: %v", err)
			}
		}()
	}

	fmt.Printf("Starting server at %s:%d...\n", c.Host, c.Port)
	server.Start()
}
