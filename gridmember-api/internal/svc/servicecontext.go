package svc

import (
	"database/sql"
	"fmt"
	"time"

	"gridmenber-api/internal/config"
	"gridmenber-api/internal/dao"

	_ "github.com/go-sql-driver/mysql"
	"github.com/zeromicro/go-zero/core/logx"
)

// ServiceContext 持有全局服务上下文，包括数据库连接
type ServiceContext struct {
	Config  config.Config
	MySQLDB *sql.DB
	MySQL   *dao.MySQLDao
}

// NewServiceContext 创建 ServiceContext 并在配置中指定 MySQL 时建立连接并自动建表
func NewServiceContext(c config.Config) *ServiceContext {
	sc := &ServiceContext{Config: c}

	if c.MySQL.Host != "" {
		dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=%s&parseTime=true&loc=Local", c.MySQL.User, c.MySQL.Password, c.MySQL.Host, c.MySQL.Port, c.MySQL.Database, c.MySQL.Charset)
		db, err := sql.Open("mysql", dsn)
		if err != nil {
			panic("MySQL connect error: " + err.Error())
		}
		db.SetMaxOpenConns(25)
		db.SetMaxIdleConns(5)
		db.SetConnMaxLifetime(5 * time.Minute)

		if err := db.Ping(); err != nil {
			panic("MySQL ping error: " + err.Error())
		}
		sc.MySQLDB = db
		sc.MySQL = dao.NewMySQLDao(db)

		// 自动建表
		if err := sc.MySQL.AutoMigrate(); err != nil {
			logx.Errorf("自动建表失败: %v", err)
		} else {
			logx.Infof("MySQL 自动建表完成")
		}
	}

	return sc
}
