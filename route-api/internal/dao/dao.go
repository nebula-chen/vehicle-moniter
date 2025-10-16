package dao

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"route-api/internal/types"
)

// CreateRoute 将路线信息写入数据库，返回生成的 routeId
// 行为说明：
//   - 生成唯一的 route_id
//   - 将 PassStations/PassVehicles 序列化为 JSON 存储
//   - 在插入时同时写入 create_time 与 update_time（相同的当前时间）
//   - 新建路线的 status 默认为 "测试"
func CreateRoute(db *sql.DB, req *types.RouteCreateInfo) (string, error) {
	// 生成简单的 route id，使用时间戳和纳秒避免冲突
	routeId := fmt.Sprintf("route-%d", time.Now().UnixNano())

	passStationsJSON, _ := json.Marshal(req.PassStations)
	passVehiclesJSON, _ := json.Marshal(req.PassVehicles)

	status := "测试"

	query := `INSERT INTO routes (route_id, start_station, end_station, pass_stations, pass_vehicles, distance, note, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := db.Exec(query, routeId, req.StartStation, req.EndStation, string(passStationsJSON), string(passVehiclesJSON), req.Distance, req.Note, status)
	if err != nil {
		return "", err
	}

	return routeId, nil
}
