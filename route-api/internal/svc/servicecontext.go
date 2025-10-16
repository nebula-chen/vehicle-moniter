package svc

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"

	"route-api/internal/config"
)

// ServiceContext 包含全局资源，例如数据库连接
type ServiceContext struct {
	Config config.Config
	DB     *sql.DB
}

// NewServiceContext 初始化 ServiceContext 并建立数据库连接，同时保证 routes 表存在
func NewServiceContext(c config.Config) *ServiceContext {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=%s&parseTime=true",
		c.MySQL.User, c.MySQL.Password, c.MySQL.Host, c.MySQL.Port, c.MySQL.Database, c.MySQL.Charset)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		panic(err)
	}
	// 简单的连接检测
	if err := db.Ping(); err != nil {
		panic(err)
	}

	return &ServiceContext{
		Config: c,
		DB:     db,
	}
}
