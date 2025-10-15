package main

import (
	"database/sql"
	"flag"
	"fmt"

	"orders-api/internal/config"
	"orders-api/internal/handler"
	"orders-api/internal/svc"

	_ "github.com/go-sql-driver/mysql"
	"github.com/zeromicro/go-zero/core/conf"
	"github.com/zeromicro/go-zero/rest"
)

var configFile = flag.String("f", "etc/orders-api.yaml", "the config file")

func main() {
	flag.Parse()

	var c config.Config
	conf.MustLoad(*configFile, &c)

	// 初始化 MySQL 连接
	// 配置在 etc/orders-api.yaml 中的 MySQL 节点
	// 为保持最小入侵，这里使用固定 DSN（与 docker-compose 保持一致）
	dsn := "admin:12345678@tcp(vehicle-api-mysql:3306)/vehicle?charset=utf8mb4&parseTime=True&loc=Local"
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		panic(err)
	}
	if err := db.Ping(); err != nil {
		panic(err)
	}

	server := rest.MustNewServer(c.RestConf)
	defer server.Stop()
	defer db.Close()

	ctx := svc.NewServiceContext(c, db)

	// 启动前确保表存在
	if err := ctx.Order.CreateTableIfNotExists(); err != nil {
		panic(fmt.Errorf("create orders table failed: %w", err))
	}

	handler.RegisterHandlers(server, ctx)

	fmt.Printf("Starting server at %s:%d...\n", c.Host, c.Port)
	server.Start()
}
