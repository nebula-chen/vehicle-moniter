package config

import "github.com/zeromicro/go-zero/rest"

// MySQLConf 表示 mysql 的基本配置
type MySQLConf struct {
	Host     string `json:"host"`
	Port     string `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	Database string `json:"database"`
	Charset  string `json:"charset"`
}

type Config struct {
	rest.RestConf
	// 与 etc/route-api.yaml 中的键名对应
	MySQL MySQLConf `json:"MySQL"`
}
