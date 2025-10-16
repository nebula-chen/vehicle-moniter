package main

import (
	"flag"
	"fmt"

	"route-api/internal/config"
	"route-api/internal/handler"
	"route-api/internal/svc"

	"github.com/zeromicro/go-zero/core/conf"
	"github.com/zeromicro/go-zero/rest"
)

var configFile = flag.String("f", "etc/route-api.yaml", "the config file")

func main() {
	flag.Parse()

	var c config.Config
	conf.MustLoad(*configFile, &c)

	server := rest.MustNewServer(c.RestConf)
	defer server.Stop()

	ctx := svc.NewServiceContext(c)
	// 在程序退出时关闭数据库连接（如果已初始化）
	if ctx.DB != nil {
		defer ctx.DB.Close()
	}

	// 自动建表：在容器启动时检测 routes 表是否存在，若不存在则创建
	if ctx.DB != nil {
		createTable := `CREATE TABLE IF NOT EXISTS routes (
			route_id VARCHAR(64) NOT NULL PRIMARY KEY,
			start_station VARCHAR(128) NOT NULL,
			end_station VARCHAR(128) NOT NULL,
			pass_stations TEXT,
			pass_vehicles TEXT,
			distance INT,
			note TEXT,
			status VARCHAR(32),
			created_Time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_Time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`

		if _, err := ctx.DB.Exec(createTable); err != nil {
			// 若建表失败，打印错误并退出，以便容器管理方可见错误并重试/告警
			fmt.Printf("创建 routes 表失败: %v\n", err)
			return
		}
	}

	handler.RegisterHandlers(server, ctx)

	fmt.Printf("Starting server at %s:%d...\n", c.Host, c.Port)
	server.Start()
}
