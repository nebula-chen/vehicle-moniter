# Go Backend Service

## 项目简介
该项目是一个基础的Go后端服务，支持接收基于HTTP和MQTT传输的数据。项目结构清晰，采用模块化设计，便于扩展和维护。

## 项目结构
```
vehicle-api
├── docker-compose.yml      # 定义和运行多容器Docker应用程序
├── Dockerfile              # 构建Docker镜像的配置文件
├── go.mod                  # Go模块的依赖管理文件
├── go.sum                  # 依赖包的校验和
├── api/
│   └── service.api         # API接口定义文件
├── internal/
│   ├── config/
│   │   └── config.go       # 应用程序配置管理
│   ├── dao/
│   │   └── dao.go          # 数据访问对象实现
│   ├── handler/
│   │   ├── http_handler.go  # HTTP请求处理逻辑
│   │   ├── mqtt_handler.go   # MQTT消息处理逻辑
│   │   └── routes.go        # HTTP路由定义
│   ├── logic/
│   │   ├── http_logic.go    # HTTP请求业务逻辑
│   │   └── mqtt_logic.go     # MQTT消息业务逻辑
│   ├── svc/
│   │   └── servicecontext.go # 服务上下文定义
│   ├── types/
│   │   └── types.go         # 数据结构和类型定义
│   └── mqtt/
│       └── client.go        # MQTT客户端实现
├── log/
│   └── app.log              # 应用程序日志
├── resources/
│   ├── api-documen.md       # API文档
│   └── index.html           # 应用程序首页
└── README.md                # 项目说明文档
```

## 功能特性
- 支持HTTP和MQTT协议的数据接收
- 模块化设计，便于扩展和维护
- 使用Docker实现容器化，简化部署流程
- 提供详细的API文档和使用说明

## 使用方法
1. 克隆项目到本地:
   ```
   git clone <repository-url>
   cd vehicle-api
   ```

2. 构建Docker镜像:
   ```
   docker-compose build
   ```

3. 启动服务:
   ```
   docker-compose up
   ```

4. 访问API文档:
   打开浏览器，访问 `http://localhost:8080` 查看API文档和使用说明。

## 开发指南
- 使用 `goctl` 工具生成和配置API接口。
- 在 `internal/` 目录下实现业务逻辑和数据访问层。
- 通过 `log/app.log` 记录应用程序的日志信息，便于调试和监控。

## 贡献
欢迎提交问题和建议，或直接提交代码贡献。请遵循项目的贡献指南。

## 许可证
该项目遵循 MIT 许可证。