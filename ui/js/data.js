const vehiclesData = {
  "渝S0001": {
    "id": "渝S0001",
    "location": "科学谷（京东营业点）附近 - 经度:106.360834, 纬度:29.550626",
    "lng": 106.360834,
    "lat": 29.550626,
    "speed": "4km/h",
    "limit": "30km/h"
  },
  "渝S0002": {
    "id": "渝S0002",
    "location": "科学谷西侧 - 经度:106.358500, 纬度:29.552000",
    "lng": 106.3585,
    "lat": 29.552,
    "speed": "20km/h",
    "limit": "30km/h"
  },
  "渝E0001": {
    "id": "渝E0001",
    "location": "科学谷→大学城中段 - 经度:106.340000, 纬度:29.570000",
    "lng": 106.34,
    "lat": 29.57,
    "speed": "28km/h",
    "limit": "30km/h"
  },
  "渝E0002": {
    "id": "渝E0002",
    "location": "大学城北侧 - 经度:106.315000, 纬度:29.592000",
    "lng": 106.315,
    "lat": 29.592,
    "speed": "40km/h",
    "limit": "30km/h"
  },
  "渝U0001": {
    "id": "渝U0001",
    "location": "重庆大学城（京东站点） - 经度:106.307549, 纬度:29.612250",
    "lng": 106.307549,
    "lat": 29.612250,
    "speed": "0km/h",
    "limit": "30km/h"
  },
  "渝U0002": {
    "id": "渝U0002",
    "location": "大学城南侧 - 经度:106.303500, 纬度:29.595000",
    "lng": 106.3035,
    "lat": 29.595,
    "speed": "0km/h",
    "limit": "30km/h"
  }
}

const packages = [
    {
        id: 'PKG-CQ-001',
        sender: '京东科学谷营业点',
        senderAddress: '科学谷（京东营业点）',
        addressee: '重庆大学城用户A',
        addresseePhone: '18600001111',
        address: '大学城（京东站点）',
        point: '科学谷京东营业点 → 大学城京东站点',
        status: '配送中',
        assignedVehicle: '渝S0001',
        endTime: null,
        detail: '快递公司：京东物流<br>包裹重量：5kg<br>出发时间：2025-08-24 09:00<br>备注：从科学谷京东营业点到大学城京东站点，优先路线配送'
    },
    {
        id: 'PKG-CQ-002',
        sender: '用户B',
        senderAddress: '渝北区',
        addressee: '用户C（大学城）',
        addresseePhone: '18600002222',
        address: '大学城附近',
        point: '同城配送',
        status: '待取件',
        endTime: null,
        detail: '快递公司：京东物流<br>包裹重量：1.2kg<br>入库时间：2025-08-24 08:30<br>备注：同城短途'
    },
    {
        id: 'PKG-CQ-003',
        sender: '周边商家',
        senderAddress: '科学谷周边',
        addressee: '用户D',
        addresseePhone: '18600003333',
        address: '科学谷附近',
        point: '同区域配送',
        status: '已签收',
        endTime: '2025-08-23 16:10',
        detail: '快递公司：京东物流<br>包裹重量：0.8kg<br>入库时间：2025-08-23 14:00<br>备注：已配送到京东营业点'
    }
];

// 新增：京东点位与模拟规划路线（供前端地图或路径规划使用）
const jdPoints = {
  scienceValley: {
    id: '科学谷-京东营业点',
    name: '科学谷京东营业点',
    lng: 106.364234,
    lat: 29.547626,
    address: '科学谷（京东营业点）'
  },
  universityTown: {
    id: '大学城-京东站点',
    name: '大学城京东站点',
    lng: 106.30853,
    lat: 29.598915,
    address: '重庆大学城（京东站点）'
  }
};

const plannedRoute = {
  id: 'route-SciToUni-001',
  from: jdPoints.scienceValley.id,
  to: jdPoints.universityTown.id,
  waypoints: [
    { lng: 106.364234, lat: 29.547626 }, // 科学谷起点
    { lng: 106.350000, lat: 29.560000 },
    { lng: 106.340000, lat: 29.570000 }, // 中段（配合车辆渝E0001）
    { lng: 106.330000, lat: 29.582000 },
    { lng: 106.315000, lat: 29.592000 }, // 大学城前段（配合车辆渝E0002）
    { lng: 106.308530, lat: 29.598915 }  // 大学城终点
  ],
  estimatedDistanceKm: 7.2,
  estimatedTimeMin: 18,
  description: '科学谷送大学城'
};

// Try to fetch live vehicles from backend; fallback to static vehiclesData
async function fetchVehicles() {
  try {
    const res = await fetch('/api/vehicles');
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    // server returns an array of summaries; convert to map by id
    const map = {};
    if (Array.isArray(data)) {
      data.forEach(item => {
        const id = item.vehicleId || item.VehicleId || item.vehicleId;
        if (!id) return;
        map[id] = {
          id,
          location: `${item.latitude || item.Latitude || ''}, ${item.longitude || item.Longitude || ''}`,
          lng: item.longitude || item.Longitude || item.lng || item.Lng || 0,
          lat: item.latitude || item.Latitude || item.lat || item.Lat || 0,
          speed: item.velocity ? `${item.velocity} m/s` : (item.Speed || ''),
        };
      });
      return map;
    }
  } catch (e) {
    // ignore
  }
  return vehiclesData;
}

window.fetchVehicles = fetchVehicles;