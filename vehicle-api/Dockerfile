# 第一步：使用官方 Golang 镜像构建可执行文件
FROM golang:1.22 AS builder

ENV GOPROXY=https://goproxy.cn,direct

WORKDIR /app

# 复制项目依赖
COPY go.mod go.sum ./
RUN go mod download

# 复制全部源代码
COPY . .

# 构建 go-zero 可执行文件（假设入口为 main.go）
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o app vehicle.go

# 第二步：使用小体积镜像运行
FROM alpine:latest

WORKDIR /app

# 部署时可注释掉(仅调试用)
RUN mkdir -p /app/log && chmod -R 777 /app/log

# 拷贝配置文件和二进制文件
COPY --from=builder /app/app .
COPY --from=builder /app/etc ./etc

# 设置时区可选（适配中国时区）
RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

# 替换为实际的端口
EXPOSE 6000

CMD ["sh", "-c", "./app -f etc/vehicle-api.yaml > /app/log/app.log 2>&1"]
