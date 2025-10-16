package dao

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"route-api/internal/types"
)

// ErrNoUpdate 表示请求没有任何字段需要更新
var ErrNoUpdate = errors.New("no fields to update")

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

// UpdateRoute 根据传入的 RouteUpdateReq 更新数据库中的路线信息
// 行为说明：
//   - 仅更新请求中非空/非零值的字段
//   - 将 PassStations/PassVehicles 序列化为 JSON 存储
//   - 同步更新 update_time 为当前时间
//   - 如果没有字段需要更新，则直接返回 nil
//   - 如果未找到对应 route_id，则返回 sql.ErrNoRows
func UpdateRoute(db *sql.DB, req *types.RouteUpdateReq) error {
	// 构建动态更新子句
	sets := []string{}
	args := []interface{}{}

	if req.Status != "" {
		sets = append(sets, "status = ?")
		args = append(args, req.Status)
	}
	if req.StartStation != "" {
		sets = append(sets, "start_station = ?")
		args = append(args, req.StartStation)
	}
	if req.EndStation != "" {
		sets = append(sets, "end_station = ?")
		args = append(args, req.EndStation)
	}
	if req.PassStations != nil {
		bs, _ := json.Marshal(req.PassStations)
		sets = append(sets, "pass_stations = ?")
		args = append(args, string(bs))
	}
	if req.PassVehicles != nil {
		bv, _ := json.Marshal(req.PassVehicles)
		sets = append(sets, "pass_vehicles = ?")
		args = append(args, string(bv))
	}
	if req.Distance != 0 {
		sets = append(sets, "distance = ?")
		args = append(args, req.Distance)
	}
	if req.Note != "" {
		sets = append(sets, "note = ?")
		args = append(args, req.Note)
	}

	if len(sets) == 0 {
		// nothing to update
		return ErrNoUpdate
	}

	// 构造最终 SQL
	query := fmt.Sprintf("UPDATE routes SET %s WHERE route_id = ?", strings.Join(sets, ", "))
	args = append(args, req.RouteId)

	res, err := db.Exec(query, args...)
	if err != nil {
		return err
	}

	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return sql.ErrNoRows
	}

	return nil
}

// GetRouteByID 根据 route_id 查询单条路线记录并解析为 RouteInfoResp
func GetRouteByID(db *sql.DB, routeId string) (*types.RouteInfoResp, error) {
	query := `SELECT route_id, create_time, update_time, status, start_station, end_station, pass_stations, pass_vehicles, distance, note
		FROM routes WHERE route_id = ?`

	var r types.RouteInfoResp
	var ps sql.NullString
	var pv sql.NullString

	row := db.QueryRow(query, routeId)
	err := row.Scan(&r.RouteId, &r.CreateTime, &r.UpdateTime, &r.Status, &r.StartStation, &r.EndStation, &ps, &pv, &r.Distance, &r.Note)
	if err != nil {
		return nil, err
	}

	if ps.Valid {
		_ = json.Unmarshal([]byte(ps.String), &r.PassStations)
	}
	if pv.Valid {
		_ = json.Unmarshal([]byte(pv.String), &r.PassVehicles)
	}

	return &r, nil
}

// ListRoutes 根据筛选条件查询多条路线记录
func ListRoutes(db *sql.DB, req *types.RouteListReq) ([]types.RouteInfoResp, error) {
	where := []string{"1=1"}
	args := []interface{}{}

	if req.RouteId != "" {
		where = append(where, "route_id = ?")
		args = append(args, req.RouteId)
	}
	if req.Status != "" {
		where = append(where, "status = ?")
		args = append(args, req.Status)
	}
	// 对于 stationId 与 vehicleId，存储为 JSON 字符串，使用 LIKE 进行模糊匹配
	if req.StationId != "" {
		where = append(where, "pass_stations LIKE ?")
		args = append(args, "%"+req.StationId+"%")
	}
	if req.VehicleId != "" {
		where = append(where, "pass_vehicles LIKE ?")
		args = append(args, "%"+req.VehicleId+"%")
	}

	query := fmt.Sprintf("SELECT route_id, create_time, update_time, status, start_station, end_station, pass_stations, pass_vehicles, distance, note FROM routes WHERE %s", strings.Join(where, " AND "))

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := []types.RouteInfoResp{}
	for rows.Next() {
		var r types.RouteInfoResp
		var ps sql.NullString
		var pv sql.NullString
		if err := rows.Scan(&r.RouteId, &r.CreateTime, &r.UpdateTime, &r.Status, &r.StartStation, &r.EndStation, &ps, &pv, &r.Distance, &r.Note); err != nil {
			return nil, err
		}
		if ps.Valid {
			_ = json.Unmarshal([]byte(ps.String), &r.PassStations)
		}
		if pv.Valid {
			_ = json.Unmarshal([]byte(pv.String), &r.PassVehicles)
		}
		res = append(res, r)
	}

	return res, nil
}

// DeleteRoute 根据 route_id 删除记录
func DeleteRoute(db *sql.DB, routeId string) error {
	res, err := db.Exec("DELETE FROM routes WHERE route_id = ?", routeId)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
