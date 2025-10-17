package dao

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// MySQLDao 包含 DB 引用
type MySQLDao struct {
	DB *sql.DB
}

// NewMySQLDao 创建 MySQLDao
func NewMySQLDao(db *sql.DB) *MySQLDao { return &MySQLDao{DB: db} }

// AutoMigrate 用于创建 grid_members 表（如果不存在）
func (d *MySQLDao) AutoMigrate() error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao 未初始化")
	}
	_, err := d.DB.Exec(`
    CREATE TABLE IF NOT EXISTS gridmembers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        grid_member_id VARCHAR(64) NOT NULL UNIQUE,
        entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        grid_member_name VARCHAR(128),
        grid_member_phone VARCHAR(64),
        is_grid_id VARCHAR(64),
        status VARCHAR(64),
        note VARCHAR(255)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
	return err
}

// InsertGridMember 插入一条网格员记录，EntryTime 由 DB 自动填充
func (d *MySQLDao) InsertGridMember(gridMemberId, name, phone, isGridId, status, note string) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao 未初始化")
	}
	_, err := d.DB.Exec(`INSERT INTO gridmembers (grid_member_id, grid_member_name, grid_member_phone, is_grid_id, status, note) VALUES (?, ?, ?, ?, ?, ?)`, gridMemberId, name, phone, isGridId, status, note)
	return err
}

// GetGridMemberByID 供查询详情使用
func (d *MySQLDao) GetGridMemberByID(gridMemberId string) (map[string]interface{}, error) {
	if d == nil || d.DB == nil {
		return nil, fmt.Errorf("mysql dao 未初始化")
	}
	row := d.DB.QueryRow(`SELECT id, grid_member_id, entry_time, grid_member_name, grid_member_phone, is_grid_id, status, note FROM gridmembers WHERE grid_member_id = ?`, gridMemberId)
	var id int
	var gid, name, phone, isGridId, status, note string
	var entryTime time.Time
	if err := row.Scan(&id, &gid, &entryTime, &name, &phone, &isGridId, &status, &note); err != nil {
		return nil, err
	}
	out := map[string]interface{}{
		"id":              id,
		"gridMemberId":    gid,
		"entryTime":       entryTime.Format("20060102"), // 格式化为 yyyymmdd
		"gridMemberName":  name,
		"gridMemberPhone": phone,
		"isGridId":        isGridId,
		"status":          status,
		"note":            note,
	}
	return out, nil
}

// UpdateGridMemberByID 根据 grid_member_id 更新可选字段：status, grid_member_phone, is_grid_id, note
// 只会更新非空字符串字段
func (d *MySQLDao) UpdateGridMemberByID(gridMemberId, status, phone, isGridId, note string) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao 未初始化")
	}

	// 动态构建 SET 子句，仅包含非空字段
	sets := []string{}
	args := []interface{}{}
	if status != "" {
		sets = append(sets, "status = ?")
		args = append(args, status)
	}
	if phone != "" {
		sets = append(sets, "grid_member_phone = ?")
		args = append(args, phone)
	}
	if isGridId != "" {
		sets = append(sets, "is_grid_id = ?")
		args = append(args, isGridId)
	}
	if note != "" {
		sets = append(sets, "note = ?")
		args = append(args, note)
	}

	if len(sets) == 0 {
		// nothing to update
		return nil
	}

	query := fmt.Sprintf("UPDATE gridmembers SET %s WHERE grid_member_id = ?", strings.Join(sets, ", "))
	args = append(args, gridMemberId)

	_, err := d.DB.Exec(query, args...)
	return err
}

// GetGridMembers 支持根据入网时间范围、状态和 is_grid_id 筛选，并返回分页结果和总数（简单实现，不分页）
func (d *MySQLDao) GetGridMembers(startTime, endTime, status, isGridId string) ([]map[string]interface{}, int, error) {
	if d == nil || d.DB == nil {
		return nil, 0, fmt.Errorf("mysql dao 未初始化")
	}

	// 基本查询
	where := []string{"1=1"}
	args := []interface{}{}

	// entry_time 存为 TIMESTAMP，接收格式为 yyyyMMddHHmmss（或部分），转换并比较时使用字符串比较的简单方案
	if startTime != "" {
		where = append(where, "entry_time >= ?")
		args = append(args, startTime)
	}
	if endTime != "" {
		where = append(where, "entry_time <= ?")
		args = append(args, endTime)
	}
	if status != "" {
		where = append(where, "status = ?")
		args = append(args, status)
	}
	if isGridId != "" {
		where = append(where, "is_grid_id = ?")
		args = append(args, isGridId)
	}

	query := fmt.Sprintf("SELECT id, grid_member_id, entry_time, grid_member_name, grid_member_phone, is_grid_id, status, note FROM gridmembers WHERE %s", strings.Join(where, " AND "))
	rows, err := d.DB.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	results := []map[string]interface{}{}
	for rows.Next() {
		var id int
		var gid, name, phone, isGridIdVal, statusVal, note string
		var entryTime time.Time
		if err := rows.Scan(&id, &gid, &entryTime, &name, &phone, &isGridIdVal, &statusVal, &note); err != nil {
			return nil, 0, err
		}
		m := map[string]interface{}{
			"id":              id,
			"gridMemberId":    gid,
			"entryTime":       entryTime.Format("20060102"),
			"gridMemberName":  name,
			"gridMemberPhone": phone,
			"isGridId":        isGridIdVal,
			"status":          statusVal,
			"note":            note,
		}
		results = append(results, m)
	}

	// 获取总数（简单实现，单次查询）
	countQuery := fmt.Sprintf("SELECT COUNT(1) FROM gridmembers WHERE %s", strings.Join(where, " AND "))
	var total int
	if err := d.DB.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	return results, total, nil
}

// DeleteGridMemberByID 根据 grid_member_id 删除记录
func (d *MySQLDao) DeleteGridMemberByID(gridMemberId string) error {
	if d == nil || d.DB == nil {
		return fmt.Errorf("mysql dao 未初始化")
	}
	_, err := d.DB.Exec("DELETE FROM gridmembers WHERE grid_member_id = ?", gridMemberId)
	return err
}
