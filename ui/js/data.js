const vehiclesData = [
  {
    id: '渝S0001',
    type: '普通',
    status: '配送中',
    capacity: '6 m³',
    battery: '78%',
    routeId: 'route-001',
    createdAt: '2025-07-01 09:10',
    location: '科学谷（京东营业点）附近',
    lng: 106.3702018,
    lat: 29.52298757,
    speed: '4km/h'
  },
  {
    id: '渝S0002',
    type: '普通',
    status: '配送中',
    capacity: '6 m³',
    battery: '56%',
    routeId: 'route-002',
    createdAt: '2025-07-03 11:22',
    location: '科学谷西侧',
    lng: 106.3752018,
    lat: 29.52298757,
    speed: '20km/h'
  },
  {
    id: '渝E0001',
    type: '冷藏车',
    status: '已完成',
    capacity: '4 m³',
    battery: '92%',
    routeId: 'route-003',
    createdAt: '2025-06-18 08:05',
    location: '科学谷→大学城中段',
    lng: 106.3186,
    lat: 29.582,
    speed: '0km/h'
  },
  {
    id: '渝E0002',
    type: '普通',
    status: '配送中',
    capacity: '8 m³',
    battery: '45%',
    routeId: 'route-004',
    createdAt: '2025-08-01 13:40',
    location: '大学城北侧',
    lng: 106.3186,
    lat: 29.592,
    speed: '40km/h'
  },
  {
    id: '渝U0001',
    type: '冷藏车',
    status: '空闲',
    capacity: '4 m³',
    battery: '100%',
    routeId: 'route-005',
    createdAt: '2025-05-20 16:00',
    location: '重庆大学城（京东站点）',
    lng: 106.307549,
    lat: 29.57025,
    speed: '0km/h'
  },
  {
    id: '渝U0002',
    type: '冷冻车',
    status: '充电中',
    capacity: '4 m³',
    battery: '12%',
    routeId: 'route-006',
    createdAt: '2025-09-01 10:00',
    location: '大学城南侧',
    lng: 106.3035,
    lat: 29.595,
    speed: '0km/h'
  }
];

// expose to global for other scripts
window.vehiclesData = vehiclesData;

// 示例：仓库与门店（供地图与筛选使用，id 可用于订单/任务关联）
const WAREHOUSES = [
  { id: 'WH001', name: '大学城仓库', type: '仓库', manager: '刘经理', contactPhone: '18810000001', lng: 106.319, lat: 29.611, address: '重庆市大学城', area: '大学城片区', routeId: 'route-001', vehicles: ['渝S0001','渝S0002'], status: '空闲', openingHours: '08:00-20:00', capacityInfo: '可停放车辆20辆 / 仓储能力500m³', note: '' },
  { id: 'WH002', name: '白市驿仓库', type: '仓库', manager: '王主管', contactPhone: '18810000002', lng: 106.372, lat: 29.495, address: '重庆市白市驿', area: '白市驿片区', routeId: 'route-002', vehicles: ['渝E0001'], status: '拥挤', openingHours: '07:30-19:30', capacityInfo: '可停放车辆12辆 / 仓储能力300m³', note: '高峰期' },
  { id: 'WH003', name: '高新区仓库', type: '仓库', manager: '张主管', contactPhone: '18810000003', lng: 106.366, lat: 29.520, address: '重庆高新区', area: '高新区', routeId: 'route-004', vehicles: ['渝E0002','渝U0001'], status: '异常', openingHours: '24小时', capacityInfo: '可停放车辆30辆 / 仓储能力800m³', note: '临时停电，正在恢复中' }
];

const STORES = [
  { id: 'ST001', name: '金凤镇门店', type: '门店', manager: '陈店长', contactPhone: '18820000001', lng: 106.312, lat: 29.522, address: '重庆市金凤镇', area: '金凤镇', routeId: 'route-005', vehicles: [], status: '空闲', openingHours: '09:00-21:00', capacityInfo: '小型门店，收寄件台2个', note: '' },
  { id: 'ST002', name: '科学谷门店', type: '门店', manager: '李店长', contactPhone: '18820000002', lng: 106.393, lat: 29.537, address: '重庆市科学谷', area: '科学谷', routeId: 'route-001', vehicles: ['渝U0002'], status: '拥挤', openingHours: '08:30-20:00', capacityInfo: '门店靠近配送站，快件中转点', note: '临时加派人手' },
  { id: 'ST003', name: '大学城东门店', type: '门店', manager: '赵店长', contactPhone: '18820000003', lng: 106.307, lat: 29.573, address: '大学城东门', area: '大学城片区', routeId: 'route-005', vehicles: [], status: '空闲', openingHours: '10:00-22:00', capacityInfo: '社区型门店', note: '' }
];

const orders = [
  {
    id: 'PKG-CQ-001',
    type: '普通',
    weight: 5,
    sender: '张三',
    senderPhone: '18888888888',
    senderAddress: '科学谷（京东营业点）',
    addressee: '李四',
    addresseePhone: '18888888888',
    address: '大学城（京东站点）',
    startTime: '2025-09-10 10:10',
    endTime: null,
    status: '配送中',
    warehouseId: 'WH001',
    vehicleId: '渝S0001',
    gridMemberId: 'GM001',
    routeId: 'route-001',
    note: '',
  },
  {
    id: 'PKG-CQ-002',
    type: '特快',
    weight: 0.6,
    sender: '用户B',
    senderPhone: '18888888888',
    senderAddress: '渝北区',
    addressee: '用户C',
    addresseePhone: '18888888888',
    address: '大学城附近',
    startTime: '2025-09-10 09:32',
    endTime: null,
    status: '待取件',
    warehouseId: 'WH001',
    vehicleId: '渝S0002',
    gridMemberId: 'GM002',
    routeId: 'route-001',
    note: '',
  },
  {
    id: 'PKG-CQ-003',
    type: '冷藏',
    weight: 1.2,
    sender: '周边商家',
    senderPhone: '18888888888',
    senderAddress: '科学谷周边',
    addressee: '李四',
    addresseePhone: '18888888888',
    address: '科学谷附近',
    startTime: '2025-08-23 14:00',
    endTime: '2025-08-23 16:10',
    status: '已签收',
    warehouseId: 'WH002',
    vehicleId: '渝E0001',
    gridMemberId: 'GM003',
    routeId: 'route-002',
    note: '',
  },
  {
    id: 'PKG-CQ-004',
    type: '冷冻',
    weight: 3,
    sender: '商家D',
    senderPhone: '18888888888',
    senderAddress: '高新区仓库',
    addressee: '企业用户E',
    addresseePhone: '18888888888',
    address: '高新区XX路',
    startTime: '2025-09-01 10:00',
    endTime: null,
    status: '配送中',
    warehouseId: 'WH003',
    vehicleId: '渝E0002',
    gridMemberId: 'GM004',
    routeId: 'route-004',
    note: '',
  },
  {
    id: 'PKG-PER-001',
    type: '普通(个人)',
    weight: 5,
    sender: '张三',
    senderPhone: '18888888888',
    senderAddress: '科学谷（京东营业点）',
    addressee: '李四',
    addresseePhone: '18888888888',
    address: '大学城（京东站点）',
    startTime: '2025-09-10 10:10',
    endTime: null,
    status: '配送中',
    warehouseId: null,
    vehicleId: '渝S0001',
    gridMemberId: null,
    routeId: '楼间配送',
    note: '',
  },
  {
    id: 'PKG-PER-002',
    type: '特快(个人)',
    weight: 0.6,
    sender: '用户B',
    senderPhone: '18888888888',
    senderAddress: '渝北区',
    addressee: '用户C',
    addresseePhone: '18888888888',
    address: '大学城附近',
    startTime: '2025-09-10 09:32',
    endTime: null,
    status: '待取件',
    warehouseId: null,
    vehicleId: '渝S0002',
    gridMemberId: null,
    routeId: 'route-001',
    note: '',
  },
];

//    装货点（经度，纬度）		驿站（经度，纬度）
// 106.3807065	29.53001636	106.3693554	29.51897203
// 106.3700018	29.52095757	106.3693554	29.51897203
// 106.3665646	29.52046825	106.3684878	29.54788296
// 106.316618   29.566486	  106.303550	29.576060
// 106.316618	  29.566486	  106.327942	29.593256
// 106.316618	  29.566486	  106.299677	29.598135


// 模拟规划路线（供前端地图或路径规划使用）
const plannedRoutes = [
  {
    id: 'route-001',
    from: '科学谷',
    to: '大学城',
    status: '正常',
    createdAt: '2025-07-01 08:00',
    waypoints: [
      { lng: 106.3807065, lat: 29.53001636 }, // 起点
      { lng: 106.3693554, lat: 29.51897203 }  // 终点
    ],
    vehicles: ['渝E0002', '渝U0002'],
    estimatedDistanceKm: 7.2,
    estimatedTimeMin: 18,
    description: 'XXX送XXX'
  },
  {
    id: 'route-002',
    from: '科学谷西',
    to: '白市驿',
    status: '拥堵',
    createdAt: '2025-07-03 09:12',
    waypoints: [
      { lng: 106.3700018, lat: 29.52095757 }, // 起点
      { lng: 106.3693554, lat: 29.51897203 }  // 终点
    ],
    vehicles: ['渝S0001', '渝U0001'],
    estimatedDistanceKm: 16.8,
    estimatedTimeMin: 18,
    description: 'XXX送XXX'
  },
  {
    id: 'route-003',
    from: 'XXX',
    to: 'XXX',
    status: '测试',
    createdAt: '2025-06-18 07:50',
    waypoints: [
      { lng: 106.3665646, lat: 29.52046825 }, // 起点
      { lng: 106.3693554, lat: 29.51897203 }  // 终点
    ],
    vehicles: ['渝S0002'],
    estimatedDistanceKm: 5.2,
    estimatedTimeMin: 18,
    description: 'XXX送XXX'
  },
  {
    id: 'route-004',
    from: 'XXX',
    to: 'XXX',
    status: '正常',
    createdAt: '2025-08-01 12:00',
    waypoints: [
      { lng: 106.316618, lat: 29.566486 }, // 起点
      { lng: 106.303550, lat: 29.576060 }  // 终点
    ],
    vehicles: ['渝E0002', '渝U0001'],
    estimatedDistanceKm: 20.4,
    estimatedTimeMin: 18,
    description: 'XXX送XXX'
  },
  {
    id: 'route-005',
    from: '大学城南',
    to: '大学城北',
    status: '正常',
    createdAt: '2025-05-20 10:00',
    waypoints: [
      { lng: 106.316618, lat: 29.566486 }, // 起点
      { lng: 106.327942, lat: 29.593256 }  // 终点
    ],
    vehicles: ['渝E0002', '渝U0001'],
    estimatedDistanceKm: 10.2,
    estimatedTimeMin: 18,
    description: 'XXX送XXX'
  },
  {
    id: 'route-006',
    from: 'XXX',
    to: 'XXX',
    status: '正常',
    createdAt: '2025-05-20 10:02',
    waypoints: [
      { lng: 106.316618, lat: 29.566486 }, // 起点
      { lng: 106.299677, lat: 29.598135 }  // 终点
    ],
    vehicles: ['渝E0001', '渝S0002'],
    estimatedDistanceKm: 8.6,
    estimatedTimeMin: 18,
    description: 'XXX送XXX'
  },
];
window.plannedRoutes = plannedRoutes;

// expose warehouses/stores to global scope for pages that expect these variables
window.WAREHOUSES = WAREHOUSES;
window.STORES = STORES;

// helper: find station by id across WAREHOUSES and STORES
function getStationById(id) {
  if (!id) return null;
  const all = [].concat(WAREHOUSES || [], STORES || []);
  return all.find(s => String(s.id || '').toLowerCase() === String(id || '').toLowerCase()) || null;
}
window.getStationById = getStationById;

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

        // expose warehouses/stores to global scope for pages that expect these variables
        window.WAREHOUSES = WAREHOUSES;
        window.STORES = STORES;
    // ignore
  }
  return vehiclesData;
}


// 示例：车辆任务记录（用于 `car-tasks.html` 演示）
const vehicleTasks = [
  {
    taskId: 'TASK-1001',
    status: '配送中',
    type: '普件',
    count: 24,
    warehouseId: 'WH001',
    routeId: 'route-001',
    vehicleId: '渝S0001',
    gridMemberId: 'GM001',
    residualKm: 12.4, // 单位千米
    residualTime: 20, // 单位分钟
    startTime: '2025-09-15 08:30',
    endTime: null,
    note: ''
  },
  {
    taskId: 'TASK-1002',
    status: '待取件',
    type: '特快',
    count: 8,
    warehouseId: 'WH001',
    routeId: 'route-002',
    vehicleId: '渝S0002',
    gridMemberId: 'GM003',
    residualKm: 1.2, // 单位千米
    residualTime: 6, // 单位分钟
    startTime: '2025-09-15 09:00',
    endTime: null,
    note: ''
  },
  {
    taskId: 'TASK-1003',
    status: '已完成',
    type: '冷冻',
    count: 40,
    warehouseId: 'WH003',
    routeId: 'route-004',
    vehicleId: '渝U0002',
    gridMemberId: 'GM004',
    residualKm: null, // 单位千米
    residualTime: null, // 单位分钟
    startTime: '2025-09-14 07:50',
    endTime: '2025-09-15 12:40',
    note: ''
  }
];

window.fetchVehicles = fetchVehicles;
window.vehicleTasks = vehicleTasks;
