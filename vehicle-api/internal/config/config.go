package config

import "github.com/zeromicro/go-zero/rest"

type Config struct {
	rest.RestConf
	InfluxDBConfig InfluxDB
	MySQL          MySQLConfig    `yaml:"mysql" json:"mysql"`                 // MySQL 配置，用于持久化任务记录（任务、统计等）
	VEHState       VEHStateConfig `yaml:"VEHState" json:"VEHState"`           // VEHState 配置，用于连接外部车辆状态API获取实时车辆状态
	VEHInfo        HttpConfig     `yaml:"VEHInfo" json:"VEHInfo"`             // 车辆信息列表API配置
	VEHPosition    HttpConfig     `yaml:"VEHPosition" json:"VEHPosition"`     // 车辆位置在线API配置（用于拉取在线/离线车辆位置信息）
	VEHTrajectory  HttpConfig     `yaml:"VEHTrajectory" json:"VEHTrajectory"` // 车辆轨迹API配置
	VEHRoute       HttpConfig     `yaml:"VEHRoute" json:"VEHRoute"`           // 车辆行程查询API配置
	// AppId 与 Key 用于对接外部平台的接口鉴权（在 vehicle-api.yaml 中配置）
	AppId string `yaml:"AppId" json:"AppId"`
	Key   string `yaml:"Key" json:"Key"`
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

// VEHStateConfig 配置用于连接外部车辆状态API
type VEHStateConfig struct {
	URL            string `yaml:"url" json:"url"`                                // WebSocket服务器地址，如 ws://host:port/infraCloud/openapi/regionCloud/v1/ws/can
	HeartbeatTimer int    `yaml:"heartbeatTimer,optional" json:"heartbeatTimer"` // 心跳间隔（秒），0表示不启用心跳，默认为0
	// SampleIntervalMs: 接收外部 VEHState 数据时的最低处理间隔（毫秒）。
	// 如果外部推送非常频繁（例如 10Hz），可以配置为 1000（1s）或其他值来降频处理，
	// 避免后端同步写入或处理被高频 I/O 压垮。0 表示不降频（逐条处理）。
	SampleIntervalMs int `yaml:"sampleIntervalMs,optional" json:"sampleIntervalMs"`
}

// HttpConfig 配置用于连接外部HTTP API
type HttpConfig struct {
	URL string `yaml:"url" json:"url"` // 外部API地址
}
