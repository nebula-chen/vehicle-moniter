package svc

import (
	"database/sql"

	"orders-api/internal/config"
	"orders-api/internal/dao"
)

type ServiceContext struct {
	Config config.Config
	DB     *sql.DB
	Order  *dao.OrderDAO
}

func NewServiceContext(c config.Config, db *sql.DB) *ServiceContext {
	return &ServiceContext{
		Config: c,
		DB:     db,
		Order:  dao.NewOrderDAO(db),
	}
}
