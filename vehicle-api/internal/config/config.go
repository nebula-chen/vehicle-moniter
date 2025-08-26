package config

import "github.com/zeromicro/go-zero/rest"

type Config struct {
	rest.RestConf
	InfluxDBConfig InfluxDB
	// TCPPort 用于配置车辆协议监听端口, 格式例如 ":6000"
	TCPPort string `yaml:"TCPPort" json:"TCPPort"`
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
