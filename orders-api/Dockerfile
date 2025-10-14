# 订单服务 Dockerfile
# 第一步：使用官方 Golang 镜像构建可执行文件
FROM golang:1.22 AS builder

ENV GOPROXY=https://goproxy.cn,direct

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# 假设 goctl 生成的入口为 main.go
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o app orders.go

# 第二步：使用小体积镜像运行
FROM alpine:latest

WORKDIR /app

RUN mkdir -p /app/log && chmod -R 777 /app/log

COPY --from=builder /app/app .
COPY --from=builder /app/etc ./etc

RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

EXPOSE 18887

CMD ["sh", "-c", "./app -f etc/orders-api.yaml > /app/log/app.log 2>&1"]
