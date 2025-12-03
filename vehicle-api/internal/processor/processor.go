package processor

import (
	"context"
	"sync"
	"time"

	"github.com/zeromicro/go-zero/core/logx"

	"vehicle-api/internal/dao"
	"vehicle-api/internal/types"
)

// Processor 负责接收车辆状态数据并异步批量写入 Influx（并为将来扩展到 MySQL 留出位置）
type Processor struct {
	dao           *dao.InfluxDao
	inCh          chan *types.VehicleStateData
	batchSize     int           // 达到此数量触发写入
	flushInterval time.Duration // 定时触发写入
	wg            sync.WaitGroup
	ctx           context.Context
	cancel        context.CancelFunc
	// 限制同时并发写入的 goroutine 数，避免在高并发场景下过多并发
	writeSem chan struct{}
}

// NewProcessor 创建并启动后台批处理 goroutine
// sc: 服务上下文（提供 Influx Dao）
// batchSize: 单批次触发阈值（建议 50-500 之间，视流量与点大小而定）
// flushInterval: 定时刷新间隔（例如 1s）
// maxConcurrency: 并发写入限制
func NewProcessor(d *dao.InfluxDao, batchSize int, flushInterval time.Duration, maxConcurrency int) *Processor {
	if batchSize <= 0 {
		batchSize = 200
	}
	if flushInterval <= 0 {
		flushInterval = time.Second
	}
	if maxConcurrency <= 0 {
		maxConcurrency = 4
	}

	ctx, cancel := context.WithCancel(context.Background())
	p := &Processor{
		dao:           d,
		inCh:          make(chan *types.VehicleStateData, batchSize*4), // 缓冲若干批以吸收突发
		batchSize:     batchSize,
		flushInterval: flushInterval,
		ctx:           ctx,
		cancel:        cancel,
		writeSem:      make(chan struct{}, maxConcurrency),
	}

	p.wg.Add(1)
	go p.runBatcher()
	logx.Infof("Processor 已启动: batchSize=%d, flushInterval=%s, maxConcurrency=%d", p.batchSize, p.flushInterval.String(), maxConcurrency)
	return p
}

// Enqueue 异步入队一条车辆状态数据；在背压或超时时返回错误以便上层处理
func (p *Processor) Enqueue(data *types.VehicleStateData) error {
	if data == nil {
		return nil
	}
	select {
	case p.inCh <- data:
		return nil
	case <-time.After(200 * time.Millisecond):
		// 在极端高压场景下可能会触发，返回错误由调用方决定是否重试
		logx.Infof("Processor 入队超时，vehicleId=%s 时间戳=%d", data.VehicleId, data.Timestamp)
		return context.DeadlineExceeded
	case <-p.ctx.Done():
		return context.Canceled
	}
}

// Close 优雅停止 Processor，会等待正在进行的写入完成
func (p *Processor) Close() {
	p.cancel()
	p.wg.Wait()
	logx.Infof("Processor 已关闭")
}

// runBatcher 从 inCh 聚合为批次，按 size 或时间触发写入
func (p *Processor) runBatcher() {
	defer p.wg.Done()
	ticker := time.NewTicker(p.flushInterval)
	defer ticker.Stop()

	batch := make([]*types.VehicleStateData, 0, p.batchSize)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		// copy batch 指针切片，避免并发修改
		toWrite := make([]*types.VehicleStateData, len(batch))
		copy(toWrite, batch)
		batch = batch[:0]

		// 限制并发写入数量
		p.writeSem <- struct{}{}
		go func(items []*types.VehicleStateData) {
			defer func() { <-p.writeSem }()
			if err := p.process2influx(items); err != nil {
				logx.Errorf("批量写入 Influx 失败: %v", err)
			}
		}(toWrite)
	}

	for {
		select {
		case <-p.ctx.Done():
			// 在退出前把缓冲中的数据写完
			flush()
			// 等待所有并发写入完成
			for i := 0; i < cap(p.writeSem); i++ {
				p.writeSem <- struct{}{}
			}
			return
		case d := <-p.inCh:
			batch = append(batch, d)
			if len(batch) >= p.batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

// process2influx 将一批车辆状态数据写入 InfluxDB。
// 此函数会把每个数据转换为 Influx point 并交由 ServiceContext.Dao 写入（异步写入由 Influx SDK 管理）。
// 返回错误仅在无法访问 Dao 等严重错误时返回，单条数据转换/写入错误会被记录但不会中断批次其他条目的写入。
func (p *Processor) process2influx(batch []*types.VehicleStateData) error {
	if p == nil || p.dao == nil {
		return nil
	}

	for _, s := range batch {
		if s == nil {
			continue
		}
		pt, err := p.dao.BuildPoint(s)
		if err != nil {
			logx.Errorf("构建 Influx 数据点失败，vehicleId=%s err=%v", s.VehicleId, err)
			continue
		}
		// AddPoint 内部使用 WriteAPI.WritePoint，会异步发送给 Influx 的批量机制
		if err := p.dao.AddPoint(pt); err != nil {
			logx.Errorf("写入 Influx 点失败，vehicleId=%s err=%v", s.VehicleId, err)
			// } else {
			// 	logx.Infof("成功写入 Influx 点，vehicleId=%s timestamp=%d", s.VehicleId, s.Timestamp)
		}
	}
	// 不等待 Flush，使用 SDK 的批量刷新策略
	return nil
}

// process2mysql 占位：保留将来实现 MySQL 持久化的接口与注释
func (p *Processor) process2mysql(batch []*types.VehicleStateData) error {
	// TODO: 将来实现：把批量数据持久化到 MySQL，可考虑使用插入/更新批处理并保证重复去重/幂等
	return nil
}
