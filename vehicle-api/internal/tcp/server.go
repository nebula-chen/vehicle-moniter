package tcp

import (
	"bufio"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"time"

	"vehicle-api/internal/svc"
	"vehicle-api/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type TCPServer struct {
	addr string
	ctx  *svc.ServiceContext
	ln   net.Listener
}

func NewTCPServer(addr string, ctx *svc.ServiceContext) *TCPServer {
	return &TCPServer{addr: addr, ctx: ctx}
}

func (s *TCPServer) Start() error {
	ln, err := net.Listen("tcp", s.addr)
	if err != nil {
		return err
	}
	s.ln = ln
	logx.Infof("tcp server listening %s", s.addr)
	for {
		conn, err := ln.Accept()
		if err != nil {
			logx.Errorf("accept error: %v", err)
			continue
		}
		go s.handleConn(conn)
	}
}

func (s *TCPServer) Stop() error {
	if s.ln != nil {
		return s.ln.Close()
	}
	return nil
}

func (s *TCPServer) handleConn(conn net.Conn) {
	defer conn.Close()
	// 更稳健的拆包：按字节寻找 StartByte(0xF2)，然后读取剩余报头和数据段
	r := bufio.NewReader(conn)
	const maxDataLen = 64 * 1024 // 64KB 上限，防止恶意或错误长度导致内存耗尽
	for {
		// 查找起始字节
		b, err := r.ReadByte()
		if err != nil {
			if errors.Is(err, io.EOF) {
				return
			}
			logx.Errorf("read byte error: %v", err)
			return
		}
		if b != 0xF2 {
			// 不是起始字节，继续扫描
			continue
		}

		// 读取剩余 15 字节构成完整 16 字节固定报头
		rest := make([]byte, 15)
		if _, err := io.ReadFull(r, rest); err != nil {
			logx.Errorf("read rest header error: %v", err)
			return
		}
		headerBuf := append([]byte{b}, rest...)
		// 使用封装的读取函数以做边界检查
		dl, err := types.ReadUint32BE(headerBuf, 1)
		if err != nil {
			logx.Errorf("read header data length error: %v", err)
			return
		}
		ts, err := types.ReadUint64BE(headerBuf, 7)
		if err != nil {
			logx.Errorf("read header timestamp error: %v", err)
			return
		}
		hdr := types.FixedHeader{
			StartByte:    headerBuf[0],
			DataLength:   dl,
			DataCategory: headerBuf[5],
			Version:      headerBuf[6],
			Timestamp:    ts,
			Control:      headerBuf[15],
		}

		if hdr.DataLength > maxDataLen {
			logx.Errorf("data length too large: %d", hdr.DataLength)
			// 丢弃连接，避免资源被耗尽
			return
		}

		// 读取数据段
		var data []byte
		if hdr.DataLength > 0 {
			data = make([]byte, hdr.DataLength)
			if _, err := io.ReadFull(r, data); err != nil {
				logx.Errorf("read data error: %v", err)
				return
			}
		}

		// 记录接收到的长度，便于排查 header.DataLength 与实际 data 长度是否一致
		logx.Infof("recv category=%x version=%d header.DataLength=%d actualDataLen=%d from=%s",
			hdr.DataCategory, hdr.Version, hdr.DataLength, len(data), conn.RemoteAddr())

		// 处理不同数据类别
		switch hdr.DataCategory {
		case 0x0C: // HEARTBEAT 请求
			logx.Infof("receive HEARTBEAT from %s, reply HEARTBEAT_RES", conn.RemoteAddr())
			resp := buildHeartbeatResPacket()
			conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if _, err := conn.Write(resp); err != nil {
				logx.Errorf("write heartbeat_res error: %v", err)
				return
			}
		case 0x0D: // HEARTBEAT_RES（设备可能回复）
			logx.Infof("receive HEARTBEAT_RES from %s", conn.RemoteAddr())
		case 0x15: // VEH2CLOUD_STATE
			if hdr.Version == 0x01 {
				if err := s.handleVehicleState(data); err != nil {
					logx.Errorf("handle vehicle state v1 error: %v", err)
				}
			} else {
				logx.Infof("unsupported VEH2CLOUD_STATE version: %d", hdr.Version)
			}
		default:
			logx.Infof("unknown data category: %x", hdr.DataCategory)
		}
	}
}

// 发送 HEARTBEAT_RES 包，DataCategory=0x0D, DataLength=0
func buildHeartbeatResPacket() []byte {
	buf := make([]byte, 16)
	buf[0] = 0xF2
	binary.BigEndian.PutUint32(buf[1:5], 0)
	buf[5] = 0x0D
	buf[6] = 0x01
	binary.BigEndian.PutUint64(buf[7:15], uint64(time.Now().UnixMilli()))
	buf[15] = 0x00
	return buf
}

func (s *TCPServer) handleVehicleState(data []byte) error {
	// 解析按 service.api 中 VEH2CLOUD_STATE 的字段顺序
	// 固定最小长度约为 82 字节（不含可变的 PassPoints）
	const minLen = 82
	if len(data) < minLen {
		return fmt.Errorf("data too short for VEH2CLOUD_STATE v1: %d", len(data))
	}

	off := 0
	// VehicleId (8 bytes fixed string)
	vehicleId, err := types.ReadFixedString(data, off, 8)
	if err != nil {
		return fmt.Errorf("read vehicleId error: %w", err)
	}
	off += 8

	// MessageId (8 bytes raw)
	if len(data) < off+8 {
		return fmt.Errorf("buffer too small for messageId")
	}
	messageId := make([]byte, 8)
	copy(messageId, data[off:off+8])
	off += 8

	// TimestampGNSS (uint64)
	timestampGNSS, err := types.ReadUint64BE(data, off)
	if err != nil {
		return fmt.Errorf("read timestampGNSS error: %w", err)
	}
	off += 8

	// VelocityGNSS (uint16)
	velocityGNSS, err := types.ReadUint16BE(data, off)
	if err != nil {
		return fmt.Errorf("read velocityGNSS error: %w", err)
	}
	off += 2

	// Position (Longitude uint32, Latitude uint32, Elevation uint32)
	lon, err := types.ReadUint32BE(data, off)
	if err != nil {
		return fmt.Errorf("read longitude error: %w", err)
	}
	off += 4
	lat, err := types.ReadUint32BE(data, off)
	if err != nil {
		return fmt.Errorf("read latitude error: %w", err)
	}
	off += 4
	elev, err := types.ReadUint32BE(data, off)
	if err != nil {
		return fmt.Errorf("read elevation error: %w", err)
	}
	off += 4

	// Heading (uint32)
	heading, err := types.ReadUint32BE(data, off)
	if err != nil {
		return fmt.Errorf("read heading error: %w", err)
	}
	off += 4

	// TapPos (byte)
	if len(data) < off+1 {
		return fmt.Errorf("buffer too small for tapPos")
	}
	tapPos := data[off]
	off += 1

	// SteeringAngle (uint32)
	steeringAngle, err := types.ReadUint32BE(data, off)
	if err != nil {
		return fmt.Errorf("read steeringAngle error: %w", err)
	}
	off += 4

	// Velocity (uint16) 总线速度
	velocityBus, err := types.ReadUint16BE(data, off)
	if err != nil {
		return fmt.Errorf("read velocity(bus) error: %w", err)
	}
	off += 2

	// AccelerationLon, AccelerationLat, AccelerationVer (uint16 x3)
	accelerationLon, err := types.ReadUint16BE(data, off)
	if err != nil {
		return fmt.Errorf("read accelerationLon error: %w", err)
	}
	off += 2
	accelerationLat, err := types.ReadUint16BE(data, off)
	if err != nil {
		return fmt.Errorf("read accelerationLat error: %w", err)
	}
	off += 2
	accelerationVer, err := types.ReadUint16BE(data, off)
	if err != nil {
		return fmt.Errorf("read accelerationVer error: %w", err)
	}
	off += 2

	// YawRate (uint16)
	yawRate, err := types.ReadUint16BE(data, off)
	if err != nil {
		return fmt.Errorf("read yawRate error: %w", err)
	}
	off += 2

	// AccelPos (uint16)
	accelPos, err := types.ReadUint16BE(data, off)
	if err != nil {
		return fmt.Errorf("read accelPos error: %w", err)
	}
	off += 2

	// EngineSpeed (uint16)
	engineSpeed, err := types.ReadUint16BE(data, off)
	if err != nil {
		return fmt.Errorf("read engineSpeed error: %w", err)
	}
	off += 2

	// EngineTorque (uint32)
	engineTorque, err := types.ReadUint32BE(data, off)
	if err != nil {
		return fmt.Errorf("read engineTorque error: %w", err)
	}
	off += 4

	// BrakeFlag (byte)
	if len(data) < off+1 {
		return fmt.Errorf("buffer too small for brakeFlag")
	}
	brakeFlag := data[off]
	off += 1

	// BrakePos (uint16)
	brakePos, err := types.ReadUint16BE(data, off)
	if err != nil {
		return fmt.Errorf("read brakePos error: %w", err)
	}
	off += 2

	// BrakePressure (uint16)
	brakePressure, err := types.ReadUint16BE(data, off)
	if err != nil {
		return fmt.Errorf("read brakePressure error: %w", err)
	}
	off += 2

	// FuelConsumption (uint16)
	fuelConsumption, err := types.ReadUint16BE(data, off)
	if err != nil {
		return fmt.Errorf("read fuelConsumption error: %w", err)
	}
	off += 2

	// DriveMode (byte)
	if len(data) < off+1 {
		return fmt.Errorf("buffer too small for driveMode")
	}
	driveMode := data[off]
	off += 1

	// DestLocation (Position2D: Longitude uint32, Latitude uint32)
	destLon, err := types.ReadUint32BE(data, off)
	if err != nil {
		return fmt.Errorf("read dest longitude error: %w", err)
	}
	off += 4
	destLat, err := types.ReadUint32BE(data, off)
	if err != nil {
		return fmt.Errorf("read dest latitude error: %w", err)
	}
	off += 4

	// PassPointsNum (byte)
	if len(data) < off+1 {
		return fmt.Errorf("buffer too small for passPointsNum")
	}
	passPointsNum := data[off]
	off += 1

	// PassPoints (variable, each 8 bytes)
	passPoints := make([]types.Position2D, 0, passPointsNum)
	if passPointsNum > 0 {
		need := int(passPointsNum) * 8
		if len(data) < off+need {
			return fmt.Errorf("buffer too small for pass points: need %d, have %d", need, len(data)-off)
		}
		for i := 0; i < int(passPointsNum); i++ {
			pLon, err := types.ReadUint32BE(data, off)
			if err != nil {
				return fmt.Errorf("read passpoint longitude error: %w", err)
			}
			off += 4
			pLat, err := types.ReadUint32BE(data, off)
			if err != nil {
				return fmt.Errorf("read passpoint latitude error: %w", err)
			}
			off += 4
			passPoints = append(passPoints, types.Position2D{Longitude: pLon, Latitude: pLat})
		}
	}

	// 映射到 types.VEH2CLOUD_STATE
	req := &types.VEH2CLOUD_STATE{
		VehicleId:     vehicleId,
		MessageId:     messageId,
		TimestampGNSS: timestampGNSS,
		VelocityGNSS:  velocityGNSS,
		Position: types.Position{
			Longitude: lon,
			Latitude:  lat,
			Elevation: elev,
		},
		Heading:         heading,
		TapPos:          tapPos,
		SteeringAngle:   steeringAngle,
		Velocity:        velocityBus,
		AccelerationLon: accelerationLon,
		AccelerationLat: accelerationLat,
		AccelerationVer: accelerationVer,
		YawRate:         yawRate,
		AccelPos:        accelPos,
		EngineSpeed:     engineSpeed,
		EngineTorque:    engineTorque,
		BrakeFlag:       brakeFlag,
		BrakePos:        brakePos,
		BrakePressure:   brakePressure,
		FuelConsumption: fuelConsumption,
		DriveMode:       driveMode,
		DestLocation:    types.Position2D{Longitude: destLon, Latitude: destLat},
		PassPointsNum:   passPointsNum,
		PassPoints:      passPoints,
	}

	if s.ctx != nil {
		if err := s.ctx.ProcessState(req); err != nil {
			return err
		}
	}
	return nil
}
