// 历史车次数据示例
const historyTrips = [
    { id: 'T20230801', from: '重庆大学城', to: '重庆科学谷', start: '2023-08-01 08:00', end: '2023-08-01 10:30', avgSpeed: '26km/h', weight: '11.2kg' },
    { id: 'T20230802', from: '重庆大学城', to: '重庆科学谷', start: '2023-08-02 09:00', end: '2023-08-02 18:00', avgSpeed: '28km/h', weight: '9.8kg' }
];
    
// 车辆数据、地图、车辆标记
let vehicleInfos = vehiclesData || {};
let amap, vehicleMarkers = {};
let infoList;
    
// 统计卡片高亮切换
const statCards = document.querySelectorAll('.stat-card');
statCards.forEach(card => {
    card.addEventListener('click', function() {
        statCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
    });
});

// 高德地图初始化
window.onload = async function() {
    // 高德地图初始化
    if (window.AMap) {
        amap = new AMap.Map('amap', {
            zoom: 12,
            center: [106.372064, 29.534044],
            mapStyle: "amap://styles/macaron",
            resizeEnable: true
        });

        // load live vehicle infos (fallback to static)
        try {
            const map = await window.fetchVehicles();
            vehicleInfos = map || vehicleInfos;
        } catch (e) {}

        // add markers for current vehicles
        Object.values(vehicleInfos).forEach(info => {
            const marker = new AMap.Marker({
                position: [info.lng, info.lat],
                title: info.id,
                content: `<img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f69a.png" style="width:36px;height:36px;display:block;">`,
                offset: new AMap.Pixel(-14, -14),
                zIndex: 2000
            });
            marker.setMap(amap);
            marker.on('click', () => renderVehicleDetail(info.id, true));
            vehicleMarkers[info.id] = marker;
        });

        // 绘制模拟路线并标注顺序（来自 data.js 中的 plannedRoute / jdPoints）
        if (typeof plannedRoute !== 'undefined' && Array.isArray(plannedRoute.waypoints) && plannedRoute.waypoints.length) {
            const path = plannedRoute.waypoints.map(p => [p.lng, p.lat]);
            const routeLine = new AMap.Polyline({
                path,
                strokeColor: '#3366FF',
                strokeWeight: 4,
                strokeOpacity: 0.85,
                showDir: true,
                zIndex: 100
            });
            routeLine.setMap(amap);

            const siteInfoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -20) });

            plannedRoute.waypoints.forEach((p, idx) => {
                const seq = idx + 1;
                const seqHtml = `
                    <div style="
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        width:24px;
                        height:24px;
                        border-radius:50%;
                        background:#fff;
                        border:2px solid #3366FF;
                        color:#3366FF;
                        font-weight:700;
                        box-shadow:0 1px 3px rgba(0,0,0,0.15);
                        pointer-events: auto;
                    ">${seq}</div>
                `;
                const seqMarker = new AMap.Marker({
                    position: [p.lng, p.lat],
                    content: seqHtml,
                    offset: new AMap.Pixel(-12, -12),
                    zIndex: 150
                });
                seqMarker.setMap(amap);
                seqMarker.on('click', () => {
                    const infoWindow = new AMap.InfoWindow({
                        content: `<div style="font-size:13px;"><b>顺序 ${seq}</b><br>经度: ${p.lng}<br>纬度: ${p.lat}</div>`,
                        offset: new AMap.Pixel(0, -20)
                    });
                    infoWindow.open(amap, [p.lng, p.lat]);
                });
            });

            if (typeof jdPoints !== 'undefined' && jdPoints.scienceValley && jdPoints.universityTown) {
                const s = jdPoints.scienceValley;
                const e = jdPoints.universityTown;
                const makeSiteMarker = (site) => {
                    const content = `
                        <div style="width:28px;height:28px;border-radius:6px;background:#ff6f00;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">JD</div>
                    `;
                    const m = new AMap.Marker({ position: [site.lng, site.lat], content, offset: new AMap.Pixel(-14, -14), zIndex: 150 });
                    m.setMap(amap);
                    m.on('mouseover', () => {
                        const html = `<div style="font-size:13px;line-height:1.4;"><b>${site.name}</b><br>地址：${site.address}<br>经度：${site.lng}<br>纬度：${site.lat}</div>`;
                        siteInfoWindow.setContent(html);
                        siteInfoWindow.open(amap, [site.lng, site.lat]);
                    });
                    m.on('mouseout', () => siteInfoWindow.close());
                    return m;
                };
                makeSiteMarker(s);
                makeSiteMarker(e);
            }
        }
    }

    // 查询按钮交互
    const searchBtn = document.querySelector('.stat-search button');
    const searchInput = document.querySelector('.stat-search input');
    infoList = document.querySelector('.info-list');

    searchBtn.addEventListener('click', function() {
        const val = searchInput.value.trim();
        if (!val) { renderHistoryTrips(); return; }
        if (historyTrips.some(t => t.id === val)) { renderTripDetail(val); }
        else if (vehicleInfos[val]) { renderVehicleDetail(val, true); }
        else { infoList.innerHTML = `<h3>未找到相关信息</h3>`; }
    });

    // 页面加载时默认展示历史车次
    renderHistoryTrips();

    // start periodic polling to update vehicle locations
    setInterval(async () => {
        try {
            const map = await window.fetchVehicles();
            if (!map) return;
            vehicleInfos = map || vehicleInfos;
            Object.values(vehicleInfos).forEach(info => {
                if (vehicleMarkers[info.id]) {
                    vehicleMarkers[info.id].setPosition([info.lng, info.lat]);
                } else {
                    const m = new AMap.Marker({ position: [info.lng, info.lat], title: info.id, content: `<img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f69a.png" style="width:36px;height:36px;display:block;">`, offset: new AMap.Pixel(-14, -14), zIndex: 2000 });
                    m.setMap(amap);
                    m.on('click', () => renderVehicleDetail(info.id, true));
                    vehicleMarkers[info.id] = m;
                }
            });
        } catch (e) {}
    }, 5000);
};

// window.onload = function() {
//     if (window.AMap) {
//         amap = new AMap.Map('amap', {
//             zoom: 10,
//             center: [116.397428, 39.90923],
//             resizeEnable: true
//         });
//         // 添加车辆标记
//         Object.values(vehicleInfos).forEach(info => {
//             const marker = new AMap.Marker({
//                 position: [info.lng, info.lat],
//                 title: info.id,
//                 icon: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f69a.png', // 🚚 emoji图片
//                 offset: new AMap.Pixel(-16, -16)
//             });
//             marker.setMap(amap);
//             marker.on('click', () => {
//                 renderVehicleDetail(info.id, true);
//             });
//             vehicleMarkers[info.id] = marker;
//         });
//     }
// };

// 展示车辆详情（支持弹窗）
function renderVehicleDetail(vehicleId, showOnMap = false) {
    const info = vehicleInfos[vehicleId];

    // 地图弹窗展示
    if (showOnMap && amap && vehicleMarkers[vehicleId]) {
        amap.setCenter([info.lng, info.lat]);
        // 移除旧弹窗
        amap.getAllOverlays('infoWindow').forEach(win => amap.remove(win));
        const infoWindow = new AMap.InfoWindow({
            content: `
                <div style="color:#1890ff;font-size:16px;">
                    <b>车辆信息</b><br>
                    编号：${info.id}<br>
                    位置：${info.location}<br>
                    速度：${info.speed}<br>
                    限速：${info.limit}
                </div>
            `,
            offset: new AMap.Pixel(0, -30)
        });
        infoWindow.open(amap, [info.lng, info.lat]);
    }
}

// 默认展示历史车次
function renderHistoryTrips() {
    infoList.innerHTML = `
        <h3>历史车次记录</h3>
        <ul>
            ${historyTrips.map(trip => `<div>
                <b>${trip.id}</b>：${trip.from} → ${trip.to}<br>
                送达时间：${trip.end}<br>
                均速：${trip.avgSpeed}，载货：${trip.weight}
            </div>`).join('')}
        </ul>
    `;
}

// 展示车次详情
function renderTripDetail(tripId) {
    const trip = historyTrips.find(t => t.id === tripId);
    if (!trip) {
        infoList.innerHTML = `<h3>未找到车次</h3>`;
        return;
    }
    infoList.innerHTML = `
        <h3>车次详情</h3>
        <div>
            <b>${trip.id}</b>：${trip.from} → ${trip.to}<br>
            送达时间：${trip.end}<br>
            均速：${trip.avgSpeed}，载货：${trip.weight}
        </div>
    `;
}

// 目录展开/收起
function toggleSub(el) {
    const icon = el.querySelector('.bi');
    const nextUl = el.nextElementSibling;
    if (!nextUl || !nextUl.classList.contains('sub-list')) return;
    if (nextUl.classList.contains('show')) {
    nextUl.classList.remove('show');
    icon.classList.remove('bi-chevron-up');
    icon.classList.add('bi-chevron-down');
    } else {
    nextUl.classList.add('show');
    icon.classList.remove('bi-chevron-down');
    icon.classList.add('bi-chevron-up');
    }
}
