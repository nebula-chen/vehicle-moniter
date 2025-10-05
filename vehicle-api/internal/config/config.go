package config

import "github.com/zeromicro/go-zero/rest"

type Config struct {
	rest.RestConf
	InfluxDBConfig InfluxDB
	// TCPPort 用于配置车辆协议监听端口, 格式例如 ":6000"
	TCPPort string `yaml:"TCPPort" json:"TCPPort"`
	// MySQL 配置，用于持久化任务记录（任务、统计等）
	MySQL MySQLConfig `yaml:"mysql" json:"mysql"`
}

type InfluxDB struct {
	Host            string
	Port            string
	User            string
	Password        string
	Token           string
	Bucket          string
	Org             string
	RetentionPolicy string
	Precision       string
	Timeout         string
	BatchSize       uint
	FlushInterval   uint
}

type MySQLConfig struct {
	Host     string `yaml:"host" json:"host"`
	Port     string `yaml:"port" json:"port"`
	User     string `yaml:"user" json:"user"`
	Password string `yaml:"password" json:"password"`
	Database string `yaml:"database" json:"database"`
	Charset  string `yaml:"charset" json:"charset"`
}
