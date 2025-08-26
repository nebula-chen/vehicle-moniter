package types

import (
	"encoding/binary"
	"errors"
)

// 常用二进制类型别名（便于在协议定义中直接引用）
type BIT bool         // 1 bit, usually packed
type BYTE byte        // 1 byte
type WORD uint16      // 2 bytes
type DWORD uint32     // 4 bytes
type TIMESTAMP uint64 // 8 bytes, 建议使用 ms 或 s 由上下文决定

// ReadUint16BE 从字节切片指定偏移读取大端 uint16，要求 len(b) >= off+2
func ReadUint16BE(b []byte, off int) (uint16, error) {
	if len(b) < off+2 {
		return 0, errors.New("buffer too small for uint16")
	}
	return binary.BigEndian.Uint16(b[off : off+2]), nil
}

// ReadUint32BE 从字节切片指定偏移读取大端 uint32，要求 len(b) >= off+4
func ReadUint32BE(b []byte, off int) (uint32, error) {
	if len(b) < off+4 {
		return 0, errors.New("buffer too small for uint32")
	}
	return binary.BigEndian.Uint32(b[off : off+4]), nil
}

// ReadUint64BE 从字节切片指定偏移读取大端 uint64，要求 len(b) >= off+8
func ReadUint64BE(b []byte, off int) (uint64, error) {
	if len(b) < off+8 {
		return 0, errors.New("buffer too small for uint64")
	}
	return binary.BigEndian.Uint64(b[off : off+8]), nil
}

// ReadFixedString 从字节切片读取固定长度字符串并去除尾部的\x00
func ReadFixedString(b []byte, off int, n int) (string, error) {
	if len(b) < off+n {
		return "", errors.New("buffer too small for fixed string")
	}
	raw := b[off : off+n]
	// 去掉尾部的 0
	end := n
	for end > 0 && raw[end-1] == 0 {
		end--
	}
	return string(raw[:end]), nil
}

// WriteFixedString 将字符串写入定长字节切片（如果 s 长度不足则填充 0）
// buf 必须至少有 n 字节的可写空间
func WriteFixedString(buf []byte, off int, n int, s string) error {
	if len(buf) < off+n {
		return errors.New("buffer too small for write fixed string")
	}
	copy(buf[off:off+n], []byte(s))
	// 如果 s 短，余下保持为 0（已是默认）
	return nil
}
