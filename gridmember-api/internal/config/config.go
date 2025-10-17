package config

import "github.com/zeromicro/go-zero/rest"

// MySQLConf 表示 MySQL 的基础配置
type MySQLConf struct {
	Host     string `json:"host" yaml:"host"`
	Port     string `json:"port" yaml:"port"`
	User     string `json:"user" yaml:"user"`
	Password string `json:"password" yaml:"password"`
	Database string `json:"database" yaml:"database"`
	Charset  string `json:"charset" yaml:"charset"`
}

// Config 为服务运行时配置，嵌入 go-zero 的 RestConf
type Config struct {
	rest.RestConf
	MySQL MySQLConf `json:"MySQL" yaml:"MySQL"`
}
