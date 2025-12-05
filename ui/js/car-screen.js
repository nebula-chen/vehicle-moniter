(function(){
    // 已移除 ECharts 地图构造与相关 series 管理（保留页面其它交互与图表逻辑）。
    const charts = {};
    // 使用本地图片资源（图片位于 `ui/image/car1.png`）
    const VEHICLE_ICON = 'image/car1.png';
    let amap, vehicleMarkers = {};
    // keep lists of created site markers (warehouses/stores created as AMap.Marker or AMap.Circle)
    const siteMarkers = { warehouses: [], stores: [] };
    const routePolylines = {};
    const routeStartEnd = {};
    let highlightedRouteId = null;

    // Expose a global toggleMapLayer(type, visible) for floating panel to call
    window.toggleMapLayer = function(type, visible){
        try {
            switch(type){
                case 'vehicle':
                    Object.keys(vehicleMarkers).forEach(k=>{
                        var m = vehicleMarkers[k]; if (m && m.setMap) m.setMap(visible ? amap : null);
                    });
                    break;
                case 'warehouse':
                    setMarkersVisibility(siteMarkers.warehouses, visible);
                    break;
                case 'store':
                    setMarkersVisibility(siteMarkers.stores, visible);
                    break;
                case 'cargo':
                    // cargo layer not implemented as separate markers in current file; shadow toggle for future
                    // keep for API compatibility: no-op
                    break;
                case 'operation':
                    // operation routes = all 'normal-' and 'congested-' prefixed polylines (including halos)
                    Object.keys(routePolylines).forEach(k=>{
                        if (k.indexOf('normal-')===0 || k.indexOf('congested-')===0 || k.indexOf('halo-normal-')===0 || k.indexOf('halo-congested-')===0){ var l = routePolylines[k]; if (l && l.setMap) l.setMap(visible ? amap : null); }
                    });
                    break;
                case 'test':
                    Object.keys(routePolylines).forEach(k=>{
                        if (k.indexOf('test-')===0 || k.indexOf('halo-test-')===0){ var l = routePolylines[k]; if (l && l.setMap) l.setMap(visible ? amap : null); }
                    });
                    break;
                default:
                    // unknown type
                    break;
            }
        } catch(e){ console.warn('toggleMapLayer error', e); }
    };

    // 用于跟踪当前所有车辆状态的内部缓存
    const _vehicleStatusCache = {
        totalCount: 0,
        statusCounts: {
            '在途': 0,
            '空闲': 0,
            '充电中': 0,
            '异常': 0
        },
        vehicles: {} // vehicleId -> status
    };

    // 更新车辆状态计数
    function updateVehicleStatusCount(vehicleId, status) {
        const oldStatus = _vehicleStatusCache.vehicles[vehicleId];
        if (oldStatus === status) return; // 状态未变化，不需要更新计数

        // 如果是已知车辆，先减少原状态计数
        if (oldStatus) {
            _vehicleStatusCache.statusCounts[oldStatus] = 
                Math.max(0, (_vehicleStatusCache.statusCounts[oldStatus] || 0) - 1);
        } else {
            // 新车辆，增加总数
            _vehicleStatusCache.totalCount++;
        }

        // 更新新状态计数
        if (status) {
            _vehicleStatusCache.statusCounts[status] = 
                (_vehicleStatusCache.statusCounts[status] || 0) + 1;
            _vehicleStatusCache.vehicles[vehicleId] = status;
        }
    }

    // 数据接口：更新车辆信息面板
    window.updateVehiclePanel = function(data) {
        // 如果提供了 status，更新状态统计
        if (data.status && data.vehicleId) {
            updateVehicleStatusCount(data.vehicleId, data.status);
        }

        // 更新汇总统计
        document.getElementById('total-value').textContent = _vehicleStatusCache.totalCount || '0';
        document.getElementById('stat-onroad').textContent = '在途车辆';
        document.getElementById('onroad-value').textContent = _vehicleStatusCache.statusCounts['在途'] || '0';
        document.getElementById('stat-abnormal').textContent = '异常车辆';
        document.getElementById('abnormal-value').textContent = _vehicleStatusCache.statusCounts['异常'] || '0';
        document.getElementById('stat-idle').textContent = '空闲车辆';
        document.getElementById('idle-value').textContent = _vehicleStatusCache.statusCounts['空闲'] || '0';
        document.getElementById('stat-charging').textContent = '充电车辆';
        document.getElementById('charging-value').textContent = _vehicleStatusCache.statusCounts['充电中'] || '0';

        // 更新单车详细信息（保持原有的 nullish 合并逻辑）
        document.getElementById('vehicle-id').textContent = data.vehicleId ?? '--';
        document.getElementById('vehicle-type').textContent = data.vehicleType ?? '--';
        document.getElementById('vehicle-capacity').textContent = data.vehicleCapacity ?? '--';
        document.getElementById('vehicle-battery').textContent = data.vehicleBattery ?? '--';
        document.getElementById('vehicle-speed').textContent = data.vehicleSpeed ?? '--';
        document.getElementById('vehicle-route').textContent = data.vehicleRoute ?? '--';
        document.getElementById('vehicle-eta').textContent = data.vehicleEta ?? '--';
        // 实时画面接口预留
        if (data.videoElement) {
            const videoContainer = document.getElementById('vehicle-video');
            videoContainer.innerHTML = '';
            videoContainer.appendChild(data.videoElement);
        }
    };

    window.addEventListener('DOMContentLoaded', ()=>{
        renderCharts();
        // 页面加载时从后端 vehicle-api 拉取车辆汇总统计并更新界面
        try { fetchVehicleSummary(); } catch(e){}
        // 初始化 WebSocket 客户端，用于接收 TCP 转发的车辆实时广播数据
        try { initVehicleWS(); } catch(e){}
        // try to initialize AMap; use retry wrapper in case script loads slowly
        ensureInitMap(12, 300);
        // 如果 URL 中带有 vehicle 参数，尝试在地图与标记就绪后聚焦该车辆
        (function(){
            function getQueryParam(name){
                try{
                    const params = new URLSearchParams(window.location.search);
                    return params.get(name);
                }catch(e){
                    // fallback simple parse
                    const m = window.location.search.match(new RegExp('[?&]'+name+'=([^&]+)'));
                    return m && decodeURIComponent(m[1]);
                }
            }

            const vid = getQueryParam('vehicle');
            if (!vid) return;

            // wait for amap and vehicleMarkers to be ready
            let attempts = 0;
            const maxAttempts = 40; // ~40*300ms = 12s
            const tid = setInterval(function(){
                attempts++;
                if (typeof amap !== 'undefined' && amap && Object.keys(vehicleMarkers).length > 0) {
                    clearInterval(tid);
                    try { focusVehicleById(vid); } catch(e){ console.warn('focusVehicleById failed', e); }
                    return;
                }
                if (attempts >= maxAttempts) { clearInterval(tid); console.warn('focusVehicleById: vehicle markers not ready'); }
            }, 300);
        })();
        window.addEventListener('resize', onResize);
        // 点击页面空白处取消高亮（点击 route-item 会 stopPropagation）
        document.addEventListener('click', () => {
            clearHighlight();
        });
        // 点击地图空白也取消高亮（通过 amap 的 click 事件）
        if (amap && amap.on) {
            amap.on('click', () => { clearHighlight(); });
        }

        // 聚焦车辆并在右侧面板展示信息
        function focusVehicleById(id){
            if (!id) return;
            const marker = vehicleMarkers[id] || null;
            // try to find vehicle info from data source
            const vehicles = getVehiclesMap() || {};
            let info = null;
            if (Array.isArray(vehicles)) info = vehicles.find(v=> (v.id||v.vehicleId||v.carId) == id) || null;
            else if (vehicles && typeof vehicles === 'object') info = vehicles[id] || Object.values(vehicles).find(v=> (v.id||'')==id) || null;

            if (marker && amap) {
                try {
                    // set view
                    try { amap.setZoom(16); } catch(e){}
                    // marker.getPosition may return LngLat object
                    let pos = null;
                    try { pos = marker.getPosition(); } catch(e){}
                    if (pos && typeof pos.getLng === 'function') {
                        amap.setCenter([pos.getLng(), pos.getLat()]);
                    } else if (Array.isArray(pos) && pos.length>=2) {
                        amap.setCenter([pos[0], pos[1]]);
                    } else if (info && info.lng && info.lat) {
                        amap.setCenter([info.lng, info.lat]);
                    }

                    // 更新右侧信息面板（替代弹窗）
                    if (typeof window.updateVehiclePanel === 'function') {
                        try {
                            window.updateVehiclePanel({
                                vehicleId: id,
                                vehicleType: (info && (info.type||info.vehicleType)) || '',
                                vehicleCapacity: (info && (info.capacity||info.loadCapacity)) || '',
                                vehicleBattery: (info && (info.battery||info.batteryLevel)) || '',
                                vehicleSpeed: (info && info.speed) || '',
                                vehicleRoute: (info && (info.routeId||info.route)) || ''
                            });
                        } catch(e){ console.warn('updateVehiclePanel in focus failed', e); }
                    }
                } catch(e){ console.warn('focusVehicleById error', e); }
                return;
            }

            // fallback: if marker not found, try to center using info coords
            if (info && info.lng && info.lat && amap) {
                try { amap.setZoom(16); amap.setCenter([info.lng, info.lat]); } catch(e){ console.warn(e); }
                if (typeof window.updateVehiclePanel === 'function') {
                    window.updateVehiclePanel({
                        vehicleId: id,
                        vehicleType: (info && (info.type||info.vehicleType)) || '',
                        vehicleCapacity: (info && (info.capacity||info.loadCapacity)) || '',
                        vehicleBattery: (info && (info.battery||info.batteryLevel)) || '',
                        vehicleSpeed: (info && info.speed) || '',
                        vehicleRoute: (info && (info.routeId||info.route)) || ''
                    });
                }
            }
        }

        const panel = document.getElementById('floatingPanel');
        if (!panel) return;
        // helper to apply visual state on label
        function applyLabelState(checkbox){
            const label = checkbox && checkbox.closest('.panel-checkbox');
            if (!label) return;
            if (checkbox.checked) {
                label.classList.remove('panel-off');
                label.setAttribute('aria-pressed', 'true');
            } else {
                label.classList.add('panel-off');
                label.setAttribute('aria-pressed', 'false');
            }
            // small ripple animation
            label.classList.add('panel-toggle-anim');
            setTimeout(()=>label.classList.remove('panel-toggle-anim'), 220);
        }

        // on change, call toggleMapLayer and update visuals
        panel.addEventListener('change', function(e) {
        if (e.target && e.target.type === 'checkbox') {
            const type = e.target.getAttribute('data-type');
            const checked = e.target.checked;
            applyLabelState(e.target);
            if (window.toggleMapLayer) {
                window.toggleMapLayer(type, checked);
            }
        }
        });

        // initialize from current checkboxes so map layers reflect defaults
        const boxes = panel.querySelectorAll('input[type="checkbox"][data-type]');
        boxes.forEach(function(b){
            try { applyLabelState(b); } catch(e){}
            try { if (window.toggleMapLayer) window.toggleMapLayer(b.getAttribute('data-type'), b.checked); } catch(e){}
        });
    });

    const routeId = getQueryParam('route');
    const warehouseId = getQueryParam('warehouse');

    if (!routeId && !warehouseId) return;

    // wait for map and layers ready (similar polling used for vehicle)
    let attempts = 0;
    const maxAttempts = 40;
    const tid = setInterval(function(){
        attempts++;
        if (typeof amap !== 'undefined' && amap) {
            clearInterval(tid);
            try {
                if (routeId) {
                    // try to find polyline and focus it
                    // try to find a polyline keyed by type-routeId like 'normal-<id>' or 'congested-<id>'
                    let poly = null;
                    try {
                        const keys = Object.keys(routePolylines || {});
                        for (let k of keys) {
                            if (!k) continue;
                            if (k === routeId || k.endsWith('-' + routeId) || k.indexOf(routeId) !== -1) { poly = routePolylines[k]; break; }
                        }
                    } catch(e){ poly = routePolylines[routeId]; }
                    if (poly && (typeof poly.getPath === 'function' || typeof poly.getBounds === 'function')) {
                        try {
                            if (typeof amap.setFitView === 'function') amap.setFitView(poly);
                            else if (typeof poly.getBounds === 'function') amap.setBounds(poly.getBounds());
                        } catch(e){ /* ignore fit errors */ }
                        // highlight
                        try { poly.setOptions({ strokeWeight: 8 }); } catch(e){}
                        highlightedRouteId = routeId;
                        updateTripChartForRoute(routeId, null);
                    } else {
                        // fallback: if route start/end coords exist
                        const re = routeStartEnd[routeId];
                        if (re && re.start) {
                            amap.setCenter([re.start.lng, re.start.lat]);
                            amap.setZoom(14);
                        }
                    }
                }
                if (warehouseId) {
                    // find warehouse coords from WAREHOUSES or STORES
                    const find = (WAREHOUSES.concat(STORES)).find(s => (
                        s.name === warehouseId || String(s.name) === String(warehouseId) ||
                        s.warehouseId === warehouseId || String(s.warehouseId) === String(warehouseId) ||
                        s.id === warehouseId || String(s.id) === String(warehouseId)
                    ));
                    const found = find || (WAREHOUSES.concat(STORES)).find(s => (String(s.lng) && String(s.lat) && (s.name && s.name.includes(warehouseId))));
                    if (found && found.lng && found.lat) {
                        amap.setCenter([found.lng, found.lat]);
                        amap.setZoom(15);
                    }
                }
            } catch(e){ console.warn('focus route/warehouse failed', e); }
            return;
        }
        if (attempts >= maxAttempts) {
            clearInterval(tid);
            console.warn('amap not ready for route/warehouse focus');
        }
    }, 300);

    // helpers to read globals declared with const/let (which may not be on window)
    function getVehiclesMap(){
        // 优先使用运行时从后端拉取并缓存到 window.vehiclesData（首选）
        // 仅信任真实运行时从后端注入的 window.vehiclesData
        // 为了完全排除 `data.js` 中的静态示例数据影响（例如 window._vehiclesData 或 全局 vehiclesData），
        // 我们不再回退到这些静态变量，若没有后端数据则返回空对象，避免误用示例数据。
        if (typeof window !== 'undefined' && Array.isArray(window.vehiclesData) && window.vehiclesData.length > 0) return window.vehiclesData;
        return {};
    }

    function getPlannedRoutes(){
        // prefer an array named plannedRoutes, fall back to single plannedRoute wrapped as array
        if (typeof plannedRoutes !== 'undefined' && Array.isArray(plannedRoutes)) return plannedRoutes;
        if (typeof window !== 'undefined' && Array.isArray(window.plannedRoutes)) return window.plannedRoutes;
        if (typeof plannedRoute !== 'undefined' && plannedRoute) return [plannedRoute];
        if (typeof window !== 'undefined' && window.plannedRoute) return [window.plannedRoute];
        return [];
    }

    // 计算每辆车对应的包裹件数（扫描全局 orders 列表）
    function computePackageCountsByVehicle(){
        const map = {};
        try {
            const list = (typeof orders !== 'undefined') ? orders : (window && window.orders) || [];
            list.forEach(p => {
                const vid = p.assignedVehicle;
                if (!vid) return;
                map[vid] = (map[vid] || 0) + 1;
            });
        } catch (e) {
            // ignore
        }
        return map;
    }

    function clearHighlight(){
        highlightedRouteId = null;
        // 仅恢复线宽到默认（4），不改变线路颜色（保留按类型设置的颜色）
        try {
            Object.keys(routePolylines).forEach(id=>{
                const l = routePolylines[id];
                if (l) l.setOptions({ strokeWeight: 4 });
            });
        } catch(e){ /* ignore */ }
        // 清空或恢复 trip chart
    }

    function initMap(){
        if (!window.AMap) return;
        amap = new AMap.Map('amapCar', {
            zoom: 13,
            center: [106.336035, 29.562830],
            mapStyle: "amap://styles/macaron",
            resizeEnable: true
        });
        // amap.addControl(new AMap.Scale());
        // amap.addControl(new AMap.ToolBar());

        codeNameMap = {
            0:  "其他",
            1:  "乘用车",
            2:  "商用车",
            3:  "公交车",
            4:  "低速无人车",
            5:  "公务车辆",
            6:  "无人清扫车",
            7:  "渣土车",
            9:  "通勤车",
            10: "自动驾驶无人清扫车",
            11: "自动驾驶无人配送车",
            12: "自动驾驶无人售卖车",
            13: "多功能无人安防巡逻车",
            14: "自动驾驶接驳车",
            15: "自动驾驶环卫车",
            16: "社会车辆",
            17: "救火车",
            18: "救护车",
            19: "警车",
            20: "存量车-测试车",
            21: "引入车-有人",
            22: "存量车-渣土车",
            23: "存量车-私家车",
            24: "存量车-公交车",
            25: "仿真车",
            26: "存量车-特殊车",
            27: "存量车-通勤车",
            98: "公交车",
            99: "渣土车",
        }

        // 添加车辆标记（使用 VEHICLE_ICON 图片）
        const infos = getVehiclesMap() || {};
        Object.values(infos).forEach(info => {
            try {
                // 创建 img 元素作为 marker 内容，便于控制大小与旋转
                const img = document.createElement('img');
                img.src = VEHICLE_ICON;
                img.style.width = '32px';
                img.style.height = '32px';
                img.style.display = 'block';
        		categoryName = codeNameMap[info.CategoryCode]
        		if (categoryName === "") {
        			categoryName = "其他"
        		}

                const marker = new AMap.Marker({
                    position: [info.lng, info.lat],
                    title: info.id,
                    content: img,
                    offset: new AMap.Pixel(-16, -16),
                    zIndex: 2000
                });
                marker.setMap(amap);
                marker.on('click', () => {
                    // 切换为更新右侧信息面板（避免在地图上再弹窗）
                    try {
                        if (typeof window.updateVehiclePanel === 'function') {
                            window.updateVehiclePanel({
                                vehicleId: info.id,
                                vehicleType: categoryName || '',
                                vehicleCapacity: info.capacity || info.loadCapacity || '',
                                vehicleBattery: info.battery || info.batteryLevel || '',
                                vehicleSpeed: info.speed || '',
                                vehicleRoute: info.routeId || info.route || ''
                            });
                        }
                        // 同时将地图居中到该车辆
                        try { amap.setZoom(16); } catch(e){}
                        try {
                            const p = marker.getPosition();
                            if (p && typeof p.getLng === 'function') amap.setCenter([p.getLng(), p.getLat()]);
                        } catch(e){ if (info && info.lng && info.lat) try{ amap.setCenter([info.lng, info.lat]); }catch(e){} }
                    } catch(e){ console.warn('marker click updateVehiclePanel failed', e); }
                });
                vehicleMarkers[info.id] = marker;
            } catch(e){
                console.warn('failed to create vehicle marker', e);
            }
        });

        // 在地图上绘制仓库（蓝色小圆点）和门店（黄色小圆点）
        try {
            WAREHOUSES.forEach(function(w){
                const marker = new AMap.Marker({ position: [w.lng, w.lat], content: '<div style="width:18px;height:18px;border-radius:50%;background:#2b6cff;border:2px solid #fff"></div>', offset: new AMap.Pixel(-6, -6), zIndex:150 });
                marker.setMap(amap);
                marker.on('mouseover', function(){
                    const iw = new AMap.InfoWindow({ content: `<div style="font-size:13px;color:#000"><b>${w.name}</b><br/>${w.address}</div>`, offset: new AMap.Pixel(0,-10) });
                    iw.open(amap, [w.lng, w.lat]);
                });
                // track markers so we can show/hide later
                siteMarkers.warehouses.push(marker);
            });

            STORES.forEach(function(s){
                const marker = new AMap.Marker({ position: [s.lng, s.lat], content: '<div style="width:18px;height:18px;border-radius:50%;background:#ffd24d;border:2px solid #fff"></div>', offset: new AMap.Pixel(-6, -6), zIndex:150 });
                marker.setMap(amap);
                marker.on('mouseover', function(){
                    const iw = new AMap.InfoWindow({ content: `<div style="font-size:13px;color:#000"><b>${s.name}</b><br/>${s.address}</div>`, offset: new AMap.Pixel(0,-10) });
                    iw.open(amap, [s.lng, s.lat]);
                });
                siteMarkers.stores.push(marker);
            });
        } catch(e){ console.warn('draw warehouses/stores failed', e); }

        // 如果 data.js 中提供了 plannedRoute，则使用高德路径规划优先构造真实道路坐标并绘制三类线路：正常(绿)、拥挤(红)、测试(蓝)
        const _plannedList = getPlannedRoutes();
        if (_plannedList && Array.isArray(_plannedList) && _plannedList.length){

            // fetch driving polyline for a segment via 高德 REST API (single helper reused for all routes)
            // Adds timeout and optional retries. Returns an array of [lng,lat] pairs or rejects.
            function fetchDrivingRoute(origin, destination, opts){
                opts = opts || {};
                var timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 5000;
                var retries = typeof opts.retries === 'number' ? opts.retries : 1;

                function extractKey(){
                    var key = (window.AMAP_KEY || '');
                    if (key) return key;
                    var scripts = document.getElementsByTagName('script');
                    for (var i=0;i<scripts.length;i++){
                        var s = scripts[i];
                        if (s && s.src && s.src.indexOf('webapi.amap.com')!==-1 && s.src.indexOf('key=')!==-1){
                            var m = s.src.match(/[?&]key=([^&]+)/);
                            if (m && m[1]) { return decodeURIComponent(m[1]); }
                        }
                    }
                    return '';
                }

                function singleAttempt(){
                    return new Promise(function(resolve, reject){
                        try {
                            var key = extractKey();
                            if (!key) { reject(new Error('AMap key not found')); return; }
                            var url = 'https://restapi.amap.com/v3/direction/driving?origin=' + origin[0] + ',' + origin[1] + '&destination=' + destination[0] + ',' + destination[1] + '&extensions=all&key=' + key;
                            var abortCtl = null;
                            // use AbortController if available for timeout
                            if (typeof AbortController !== 'undefined') {
                                abortCtl = new AbortController();
                                setTimeout(function(){ try{ abortCtl.abort(); }catch(e){} }, timeoutMs);
                            }
                            var fetchOpts = abortCtl ? { signal: abortCtl.signal } : {};
                            fetch(url, fetchOpts).then(function(res){ return res.json(); }).then(function(data){
                                try {
                                    if (!data || data.status != '1' || !data.route || !data.route.paths || data.route.paths.length === 0) { reject(new Error('no route')); return; }
                                    var path = data.route.paths[0];
                                    var raw = '';
                                    if (path && path.steps && path.steps.length) raw = path.steps.map(function(st){ return st.polyline; }).join(';');
                                    if (!raw) raw = path.polyline;
                                    if (!raw) { reject(new Error('no polyline')); return; }
                                    var pts = raw.split(';').map(function(pair){ var a = pair.split(','); return [ +a[0], +a[1] ]; });
                                    resolve(pts);
                                } catch(e){ reject(e); }
                            }).catch(function(err){ reject(err); });
                        } catch(e){ reject(e); }
                    });
                }

                // attempt up to retries (including first attempt)
                var attempt = 0;
                return new Promise(function(resolve, reject){
                    function tryOnce(){
                        attempt++;
                        singleAttempt().then(resolve).catch(function(err){
                            if (attempt < retries) {
                                // small backoff
                                setTimeout(tryOnce, 300);
                            } else {
                                reject(err);
                            }
                        });
                    }
                    tryOnce();
                });
            }

            // For each planned route, build and draw asynchronously
            _plannedList.forEach(function(route, rindex){
                if (!route || !Array.isArray(route.waypoints) || route.waypoints.length < 2) return;
                (async function(_route, idx){
                    var origWaypoints = (_route.waypoints||[]).map(p=>[+p.lng, +p.lat]);
                    try {
                        var rid = _route.id || ('route-' + idx);
                        // store start/end as fallback for focus logic (used before polyline is ready)
                        if (!routeStartEnd[rid]) {
                            routeStartEnd[rid] = {
                                start: { lng: origWaypoints[0][0], lat: origWaypoints[0][1] },
                                end: { lng: origWaypoints[origWaypoints.length-1][0], lat: origWaypoints[origWaypoints.length-1][1] }
                            };
                        }
                    } catch(e){ /* ignore */ }

                    // drawing implementation re-usable for this route's coords
                    function drawFromCoordsForRoute(coords){
                        // info window for markers
                        var siteInfoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -20) });
                        try {
                            var routeId = _route.id || ('route-' + idx);
                            // determine route type: default normal; route-002 -> congested; route-003 -> test
                            var routeType = 'normal';
                            if ((routeId && routeId.toString() === 'route-002') || (_route && _route.id && _route.id === 'route-002')) routeType = 'congested';
                            else if ((routeId && routeId.toString() === 'route-003') || (_route && _route.id && _route.id === 'route-003')) routeType = 'test';

                            var key = routeType + '-' + routeId;
                            var color = '#04fd04';
                            var strokeWeight = 4;
                            var strokeStyleOpt = null;
                            var zIndex = 120;
                            if (routeType === 'congested'){
                                color = '#ff4d4f'; // red
                                strokeWeight = 6;
                                zIndex = 130;
                            } else if (routeType === 'test'){
                                color = '#0084ff'; // blue
                                strokeWeight = 4;
                                zIndex = 115;
                            }
                            // main colors
                            var opts = { path: coords, strokeColor: color, strokeWeight: strokeWeight, lineJoin: 'round', zIndex: zIndex };
                            if (strokeStyleOpt) opts.strokeStyle = strokeStyleOpt;

                            // Draw a subtle halo (background) line first to improve contrast when overlapping
                            try {
                                var haloKey = 'halo-' + key;
                                var haloOpts = { path: coords, strokeColor: false, strokeWeight: false, lineJoin: 'round', zIndex: zIndex - 2, strokeOpacity: 0.95 };
                                var haloLine = new AMap.Polyline(haloOpts);
                                haloLine.setMap(amap);
                                routePolylines[haloKey] = haloLine;
                            } catch(e){ /* ignore halo errors */ }

                            // main line - ensure full opacity and solid color to avoid blend mixing
                            opts.strokeOpacity = 1;
                            if (strokeStyleOpt) opts.strokeStyle = strokeStyleOpt;
                            const routeLine = new AMap.Polyline(opts);
                            routeLine.setMap(amap);
                            routePolylines[key] = routeLine;
                        } catch(e){ console.warn('draw route failed', e); }

                        // also add original waypoint markers from planned (as before)
                        try {
                            (_route.waypoints || []).forEach((p, idx2) => {
                                const isWarehouse = (idx2 % 2) === 0;
                                const name = isWarehouse ? ('途径点-仓库-' + (idx2+1)) : ('途径点-门店-' + (idx2+1));
                                const addr = `经度: ${p.lng}，纬度: ${p.lat}`;
                                const content = isWarehouse
                                    ? '<div style="width:12px;height:12px;border-radius:50%;background:#2b6cff;border:2px solid #fff"></div>'
                                    : '<div style="width:12px;height:12px;border-radius:50%;background:#ffd24d;border:2px solid #fff"></div>';
                                const m = new AMap.Marker({ position: [p.lng, p.lat], content: content, offset: new AMap.Pixel(-6, -6), zIndex:150 });
                                m.setMap(amap);
                                m.on('mouseover', () => { siteInfoWindow.setContent(`<div style="font-size:13px;color:#000"><b>${name}</b><br/>${addr}</div>`); siteInfoWindow.open(amap, [p.lng, p.lat]); });
                                m.on('mouseout', () => siteInfoWindow.close());
                                siteMarkers[(isWarehouse ? 'warehouses' : 'stores')].push(m);
                            });
                        } catch(e){ console.warn('render waypoints failed', e); }
                    }

                    // assemble route by fetching driving segments between consecutive original waypoints
                    try {
                        var coords = origWaypoints.slice();
                        var segPromises = [];
                        for (var i=0;i<origWaypoints.length-1;i++){
                            var a = origWaypoints[i], b = origWaypoints[i+1];
                            // set a modest timeout and allow 2 attempts for each segment
                            segPromises.push(fetchDrivingRoute(a, b, { timeoutMs: 5000, retries: 2 }).then(function(res){ return { ok: true, pts: res }; }).catch(function(err){ return { ok: false, err: err }; }));
                        }

                        var results = await Promise.all(segPromises);
                        var all = [];
                        var anySuccess = false;
                        for (var si=0; si<results.length; si++){
                            var r = results[si];
                            var a = origWaypoints[si];
                            var b = origWaypoints[si+1];
                            if (r && r.ok && Array.isArray(r.pts) && r.pts.length){
                                anySuccess = true;
                                var seg = r.pts.slice();
                                // avoid duplicating adjacent points
                                if (all.length && all[all.length-1][0]===seg[0][0] && all[all.length-1][1]===seg[0][1]) seg.shift();
                                all = all.concat(seg);
                            } else {
                                // fallback for this segment: use straight line (a -> b)
                                if (!anySuccess && all.length===0) all.push(a);
                                all.push(b);
                            }
                        }

                        if (anySuccess && all.length >= 2) coords = all;
                        else {
                            // no segment succeeded - use original waypoints as fallback
                            coords = origWaypoints.slice();
                        }

                        // draw using the assembled coords (real route or fallback)
                        drawFromCoordsForRoute(coords);
                    } catch(e){ console.warn('failed to build full route via API', e); }
                })(route, rindex);
            });
        }

        // 地图初始化完成后，尝试将之前通过 WebSocket 收到但因地图未就绪而缓存的更新应用到地图上
        try { flushPendingWsUpdates(); } catch(e) { /* ignore */ }
    }

    // toggle visibility helper exposed to UI
    function setMarkersVisibility(list, visible){
        if (!list || !Array.isArray(list)) return;
        list.forEach(function(item){
            try {
                if (item && typeof item.setMap === 'function') {
                    item.setMap(visible ? amap : null);
                }
            } catch(e){}
        });
    }

    // ensure AMap is ready before initializing - retry wrapper to handle slow script/network
    function ensureInitMap(retries, interval){
        retries = typeof retries === 'number' ? retries : 10;
        interval = typeof interval === 'number' ? interval : 300; // ms
        if (window.AMap) {
            try { initMap(); return; } catch(e){ /* fallthrough to retry */ }
        }
        var attempts = 0;
        var tid = setInterval(function(){
            attempts++;
            if (window.AMap) {
                clearInterval(tid);
                try { initMap(); } catch(e){ console.error('initMap failed', e); }
                return;
            }
            if (attempts >= retries){
                clearInterval(tid);
                console.warn('AMap not available after retries; map initialization skipped');
            }
        }, interval);
    }

    function renderCharts(){
        // 简单 HTML 转义工具，防止插入不可信的 HTML
        function escapeHtml(s){
            try { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); } catch(e){ return ''+s; }
        }

        // 更新页面上四个订单统计的显示（通过 id 定位 .summary-num 子节点）
        function setOrderMetric(elemId, value){
            try {
                var el = document.getElementById(elemId);
                if (!el) return;
                var num = el.querySelector('.summary-num');
                if (!num) {
                    // 兼容直接把数字放在元素内的情况
                    el.textContent = value;
                } else {
                    num.textContent = value;
                }
            } catch(e){ /* ignore */ }
        }

        // 基于订单列表计算各项统计量（总数、今日已完成、在途、异常）
        // 注：尽量兼容后端返回的多种字段命名。
        function computeOrderCounts(list){
            var counts = { total: 0, finishedToday: 0, inTransit: 0, abnormal: 0 };
            if (!list || !Array.isArray(list)) return counts;
            counts.total = list.length;
            var today = new Date();
            function isSameDay(d){
                if (!d) return false;
                try {
                    var dt = (typeof d === 'number') ? new Date(d) : new Date(String(d));
                    return dt.getFullYear()===today.getFullYear() && dt.getMonth()===today.getMonth() && dt.getDate()===today.getDate();
                } catch(e){ return false; }
            }

            list.forEach(function(it){
                try {
                    var status = it.status || it.Status || it.orderStatus || it.state || '';
                    var statusStr = String(status || '').trim();

                    // 优先使用完成时间判断是否为“今日已完成”，兼容多个可能的字段名
                    var finishedAt = it.finishedAt || it.finishTime || it.completedAt || it.completedTime || it.finish_at || it.completed_at;
                    if (finishedAt && isSameDay(finishedAt)) {
                        counts.finishedToday++;
                    } else if (/已?完成/.test(statusStr)) {
                        // 若没有时间字段，回退到按状态判断
                        counts.finishedToday++;
                    }

                    if (/配送中|在途|已出库|配送中/.test(statusStr)) counts.inTransit++;
                    // 有些系统把异常标记为 '异常' 或 '问题'，尽量宽松匹配
                    if (/异常|问题|failed|error/i.test(statusStr)) counts.abnormal++;
                } catch(e){ /* ignore per-item errors */ }
            });
            return counts;
        }

        // 订单列表用原生ul/li渲染，并在数据到达时更新顶部统计
        try {
            var orderEl = document.getElementById('orderListChart');
            if (orderEl) {
                // 从后端 orders-api 获取订单列表并渲染到大屏（优先使用后端数据，失败时回退到示例）
                orderEl.innerHTML = '';
                // 请求后端列表接口：GET /api/order/list
                fetch('/api/order/list', { method: 'GET', cache: 'no-store' })
                    .then(function(resp){
                        if (!resp.ok) return resp.text().then(t => { throw new Error(t || resp.statusText); });
                        return resp.json().catch(()=>({}));
                    })
                    .then(function(json){
                        // 后端返回 types.OrderListResp { ordersList: [], total }
                        var list = [];
                        if (json) {
                            if (Array.isArray(json)) list = json;
                            else if (Array.isArray(json.ordersList)) list = json.ordersList;
                            else if (Array.isArray(json.data)) list = json.data;
                        }

                        // 计算并更新指标
                        var counts = computeOrderCounts(list);
                        setOrderMetric('order-total', counts.total);
                        setOrderMetric('order-finished', counts.finishedToday);
                        setOrderMetric('order-intransit', counts.inTransit);
                        setOrderMetric('order-abnormal', counts.abnormal);

                        if (!list || list.length === 0) {
                            // 若返回为空，显示占位文本
                            var li0 = document.createElement('li');
                            li0.className = 'table-empty';
                            li0.style.padding = '8px';
                            li0.innerText = '暂无近期订单';
                            orderEl.appendChild(li0);
                            return;
                        }

                        list.forEach(function(it){
                            try {
                                var id = it.orderId || it.OrderId || it.id || it.ID || '';
                                var type = it.type || it.Type || '';
                                // 优先使用收件地址作为目的地展示，若无则使用收件人字段
                                var dest = it.address || it.Address || it.addressee || it.Addressee || '';
                                var status = it.status || it.Status || '';
                                var note = it.note || it.Note || '--';

                                var li = document.createElement('li');
                                li.style.display = 'flex';
                                li.style.alignItems = 'center';
                                li.style.borderBottom = '1px solid rgba(255,255,255,0.08)';
                                li.style.padding = '6px 0 6px 0';
                                li.style.minHeight = '48px';
                                li.style.wordBreak = 'break-all';
                                li.style.fontSize = '14px';
                                li.innerHTML =
                                    '<div style="flex:1.2;text-align:center;font-weight:600;color:#cfeff5;word-break:break-all;">'+escapeHtml(id)+'</div>'+
                                    '<div style="flex:1;text-align:center;color:#9FD8F2;word-break:break-all;">'+escapeHtml(type)+'</div>'+
                                    '<div style="flex:2;text-align:center;color:#DFF6FB;word-break:break-all;">'+escapeHtml(dest)+'</div>'+
                                    '<div style="flex:1.2;text-align:center;color:'+(String(status)==='异常'?'#ff8989':(String(status)==='配送中'?'#27e227':'#7ef27e'))+';font-weight:600;word-break:break-all;">'+escapeHtml(status)+'</div>'+
                                    '<div style="flex:2;text-align:center;color:#94d1e8;word-break:break-all;">'+escapeHtml(note)+'</div>';
                                orderEl.appendChild(li);
                            } catch (e) {
                                console.warn('渲染单条订单失败', e);
                            }
                        });
                    })
                    .catch(function(err){
                        console.warn('获取订单列表失败，使用本地示例回退', err);
                        // 回退到示例数据，保证大屏不空白
                        var orders = [
                            {id:'XXXX<br>-0001', type:'普件', dest:'送科学谷', status:'异常', note:'未处理<br>2025-9-11<br>18:00'},
                            {id:'XXXX<br>-0002', type:'冷藏', dest:'送大学城', status:'配送中', note:'预计明天送达'},
                            {id:'XXXX<br>-0003', type:'加急', dest:'送白市驿', status:'待取件', note:'已送达<br>2025-9-11<br>18:00'}
                        ];

                        // 计算并更新指标（回退数据）
                        var counts = computeOrderCounts(orders);
                        setOrderMetric('order-total', counts.total);
                        setOrderMetric('order-finished', counts.finishedToday);
                        setOrderMetric('order-intransit', counts.inTransit);
                        setOrderMetric('order-abnormal', counts.abnormal);

                        orders.forEach(function(o){
                            var li = document.createElement('li');
                            li.style.display = 'flex';
                            li.style.alignItems = 'center';
                            li.style.borderBottom = '1px solid rgba(255,255,255,0.08)';
                            li.style.padding = '6px 0 6px 0';
                            li.style.minHeight = '48px';
                            li.style.wordBreak = 'break-all';
                            li.style.fontSize = '14px';
                            li.innerHTML =
                                '<div style="flex:1.2;text-align:center;font-weight:600;color:#cfeff5;word-break:break-all;">'+escapeHtml(o.id)+'</div>'+
                                '<div style="flex:1;text-align:center;color:#9FD8F2;word-break:break-all;">'+escapeHtml(o.type)+'</div>'+
                                '<div style="flex:2;text-align:center;color:#DFF6FB;word-break:break-all;">'+escapeHtml(o.dest)+'</div>'+
                                '<div style="flex:1.2;text-align:center;color:'+(o.status==='异常'?'#ff8989':(o.status==='配送中'?'#27e227':'#7ef27e'))+';font-weight:600;word-break:break-all;">'+escapeHtml(o.status)+'</div>'+
                                '<div style="flex:2;text-align:center;color:#94d1e8;word-break:break-all;">'+escapeHtml(o.note)+'</div>';
                            orderEl.appendChild(li);
                        });
                    });
            }
        } catch (e) { console.warn('订单列表渲染失败', e); }
    }

    // 从后端 vehicle-api 获取车辆汇总数据并更新页面右侧的车辆统计面板
    // 返回结构遵循 vehicle-api 的 types.VehicleSummaryResp：
    // { total, inTransit, idle, charging, abnormal }
    function fetchVehicleSummary(){
        // 使用 no-store 确保获取到最新数据
        fetch('/api/vehicles/summary', { method: 'GET', cache: 'no-store' })
            .then(function(resp){
                if (!resp.ok) return resp.text().then(function(t){ throw new Error(t || resp.statusText); });
                return resp.json().catch(function(){ return {}; });
            })
            .then(function(json){
                if (!json || typeof json !== 'object') return;
                try {
                    // 重置状态缓存
                    _vehicleStatusCache.totalCount = json.total || 0;
                    _vehicleStatusCache.statusCounts = {
                        '在途': json.inTransit || 0,
                        '空闲': json.idle || 0,
                        '充电中': json.charging || 0,
                        '异常': json.abnormal || 0
                    };
                    // 清空车辆缓存，等待 WebSocket 更新
                    _vehicleStatusCache.vehicles = {};

                    // 更新界面显示
                    document.getElementById('total-value').textContent = _vehicleStatusCache.totalCount;
                    document.getElementById('onroad-value').textContent = _vehicleStatusCache.statusCounts['在途'];
                    document.getElementById('idle-value').textContent = _vehicleStatusCache.statusCounts['空闲'];
                    document.getElementById('charging-value').textContent = _vehicleStatusCache.statusCounts['充电中'];
                    document.getElementById('abnormal-value').textContent = _vehicleStatusCache.statusCounts['异常'];
                } catch(e){ console.warn('渲染车辆汇总数据失败', e); }
            })
            .catch(function(err){
                console.warn('获取车辆汇总失败，保留现有数据显示', err);
            });
    }

    // ================= WebSocket 客户端逻辑 =================
    // 说明：
    // - 连接到后端 /api/vehicle/ws，接收 JSON 格式的车辆实时状态广播
    // - 将接收到的数据映射到地图上的车辆 marker（存在则移动，不存在则创建）
    // - 在页面右上角显示一个 WS 连接状态指示器，便于调试

    // 规范化经纬度：有些上报为整数（乘以1e7），若数值异常大则除以1e7
    function normalizeCoord(v) {
        if (v == null) return 0;
        var n = Number(v);
        if (!isFinite(n)) return 0;
        // 若大于 1000，视为被放大（例如 1063360350 表示 106.3360350）
        if (Math.abs(n) > 1000) return n / 1e7;
        return n;
    }

    // 创建或更新车辆 marker（保证 amap 就绪时生效）
    const _pendingWsUpdates = {}; // vehicleId -> {lng,lat,extra}
    function createOrUpdateMarker(vehicleId, lng, lat, extra) {
        try {
            var x = normalizeCoord(lng);
            var y = normalizeCoord(lat);
            if (!amap || typeof AMap === 'undefined') {
                // map 未就绪，缓存更新，等待 initMap 时再处理
                _pendingWsUpdates[vehicleId] = { lng: x, lat: y, extra: extra };
                return;
            }

            var marker = vehicleMarkers[vehicleId];
            if (marker && marker.setPosition) {
                // 更新位置和标题
                try { 
                    marker.setPosition([x, y]); 
                    // 更新标记标题（鼠标悬停时显示）
                    if (extra) {
                        var title = [
                            extra.plateNumber ? ('车牌: ' + extra.plateNumber) : ('ID: ' + vehicleId),
                            extra.type ? ('类型: ' + extra.type) : '',
                            extra.status ? ('状态: ' + extra.status) : '',
                            extra.velocity ? ('速度: ' + extra.velocity + 'km/h') : ''
                        ].filter(Boolean).join('\n');
                        marker.setTitle(title);
                    }
                    
                    // 根据状态更新图标样式
                    if (extra && extra.status) {
                        var img = marker.getContent();
                    }
                } catch(e){}
                return;
            }

            // 创建 img 元素作为 marker 内容，和 initMap 中保持一致样式
            var img = document.createElement('img');
            img.src = VEHICLE_ICON;
            img.style.width = '32px';
            img.style.height = '32px';
            img.style.display = 'block';
            img.style.transform = 'rotate(0deg)';

            // 构建标记标题（鼠标悬停显示）
            var title = [
                extra && extra.plateNumber ? ('车牌: ' + extra.plateNumber) : ('ID: ' + vehicleId),
                extra && extra.type ? ('类型: ' + extra.type) : '',
                extra && extra.status ? ('状态: ' + extra.status) : '',
                extra && extra.velocity ? ('速度: ' + extra.velocity + 'km/h') : ''
            ].filter(Boolean).join('\n');

            var m = new AMap.Marker({
                position: [x, y],
                title: title,
                content: img,
                offset: new AMap.Pixel(-16, -16),
                zIndex: 2000
            });
            m.setMap(amap);
            m.on('click', function(){
                try {
                    if (typeof window.updateVehiclePanel === 'function') {
                        window.updateVehiclePanel({ vehicleId: vehicleId });
                    }
                } catch(e){}
            });
            vehicleMarkers[vehicleId] = m;
        } catch (e) { console.warn('createOrUpdateMarker failed', e); }
    }

    // 将 pending 更新应用到地图（在 initMap 完成后调用）
    function flushPendingWsUpdates(){
        try {
            Object.keys(_pendingWsUpdates).forEach(function(vid){
                var u = _pendingWsUpdates[vid];
                createOrUpdateMarker(vid, u.lng, u.lat, u.extra);
                delete _pendingWsUpdates[vid];
            });
        } catch(e){}
    }

    // 在页面上创建一个 WebSocket 状态指示器（右上角）
    var _wsStatusEl = null;
    function ensureWsStatusEl(){
        if (_wsStatusEl) return _wsStatusEl;
        var el = document.createElement('div');
        el.id = 'ws-status-badge';
        el.style.position = 'fixed';
        el.style.top = '12px';
        el.style.right = '12px';
        el.style.padding = '6px 10px';
        el.style.background = 'rgba(0,0,0,0.6)';
        el.style.color = '#fff';
        el.style.borderRadius = '6px';
        el.style.fontSize = '13px';
        el.style.zIndex = 9999;
        el.style.backdropFilter = 'blur(4px)';
        el.textContent = 'WS: disconnected';
        document.body.appendChild(el);
        _wsStatusEl = el;
        return el;
    }

    function setWsStatus(status){
        var el = ensureWsStatusEl();
        el.textContent = 'WS: ' + status;
        switch(status){
            case 'connected': el.style.background = 'rgba(24,128,24,0.9)'; break;
            case 'connecting': el.style.background = 'rgba(200,140,0,0.9)'; break;
            case 'disconnected': el.style.background = 'rgba(120,12,12,0.9)'; break;
            default: el.style.background = 'rgba(0,0,0,0.6)'; break;
        }
    }

    // 初始化 WebSocket 并处理消息，包含自动重连机制
    function initVehicleWS(){
        ensureWsStatusEl();
        var scheme = (location.protocol === 'https:') ? 'wss' : 'ws';
        // 使用相同 origin（host:port），若你通过反向代理可直接使用相对路径
        var host = location.hostname || 'localhost';
        var port = location.port ? (':' + location.port) : '';
        var url = scheme + '://' + host + port + '/api/vehicle/ws';

        var wsConn = null;
        var reconnectDelay = 1000; // 起始重连间隔 ms
        var maxDelay = 30000;

        function connect(){
            setWsStatus('connecting');
            try {
                wsConn = new WebSocket(url);
            } catch(e){
                setWsStatus('disconnected');
                scheduleReconnect();
                return;
            }

            wsConn.onopen = function(){
                setWsStatus('connected');
                reconnectDelay = 1000; // reset
                // flush any pending marker updates
                flushPendingWsUpdates();
            };

            wsConn.onmessage = function(ev){
                try {
                    var data = JSON.parse(ev.data);
                    // 后端可能推送单条对象，也可能推送一个批量数组（我们的 Processor 现在会广播数组）
                    var items = Array.isArray(data) ? data : [data];
                    // 逐条处理每一条数据，保持向后兼容
                    items.forEach(function(item){
                        try {
                            // 支持多种命名：vehicleId / vehicleid / id
                            var vid = item.vehicleId ?? item.vehicleid ?? item.id ?? null;
                            if (!vid) return;

                            // 支持多种经纬字段命名：lon / longitude / lng
                            var lon = item.lon ?? item.longitude ?? item.lng ?? null;
                            var lat = item.lat ?? item.latitude ?? item.lat ?? null;

                            // 仅在经纬度有效时创建或移动 marker，同时更新面板信息
                            if (lon !== null && lat !== null) {
                                // 转换车辆类型文本（优先使用 categoryCode，兼容多种命名）：
                                // 后端现在会推送 categoryCode，优先使用它；若不存在再退回到旧的 type 字段。
                                if (typeof item.categoryCode !== 'undefined' || typeof item.CategoryCode !== 'undefined') {
                                    var typeCode = item.categoryCode ?? item.CategoryCode;
                                } else var typeCode = 0;
                                var typeText = codeNameMap[typeCode];

                                // 确定车辆状态（若上报则使用，上报缺失时根据速度/电量做简单推断）
                                var status = item.status;
                                if (!status) {
                                    if (typeof item.battery !== 'undefined' && Number(item.battery) < 20) status = '充电中';
                                    else if ((item.velocityGNSS && Number(item.velocityGNSS) > 0) || (item.velocity && Number(item.velocity) > 0)) status = '在途';
                                    else status = '空闲';
                                }

                                // 更新车辆面板信息（仅传需要的字段）
                                updateVehiclePanel({
                                    vehicleId: vid,
                                    plateNumber: item.plateNumber ?? '--',
                                    vehicleType: typeText,
                                    vehicleCapacity: (item.capacity ? item.capacity + '立方' : '--'),
                                    vehicleBattery: (typeof item.battery !== 'undefined') ? ('' + item.battery + '%') : '--',
                                    vehicleSpeed: ((item.velocityGNSS || item.velocity || 0) + 'km/h'),
                                    vehicleRoute: item.routeId ?? '--',
                                    vehicleEta: item.eta ?? '--',
                                    status: status
                                });

                                // 更新地图上的车辆标记，确保把 heading/velocity 等字段传入
                                createOrUpdateMarker(vid, lon, lat, {
                                    heading: item.heading,
                                    velocity: item.velocityGNSS || item.velocity,
                                    plateNumber: item.plateNumber,
                                    type: typeText,
                                    status: status
                                });
                            }
                        } catch(errItem){ console.warn('process ws item failed', errItem, item); }
                    });
                } catch(e){
                    console.warn('ws message parse error', e, ev.data);
                }
            };

            wsConn.onerror = function(e){
                console.error('ws error', e);
            };

            wsConn.onclose = function(){
                setWsStatus('disconnected');
                scheduleReconnect();
            };
        }

        function scheduleReconnect(){
            setTimeout(function(){
                reconnectDelay = Math.min(reconnectDelay * 1.5, maxDelay);
                connect();
            }, reconnectDelay);
        }

        // 开始首次连接
        connect();
        // 返回关闭函数（未使用，但方便将来扩展）
        return function close(){ if (wsConn) wsConn.close(); };
    }

    function onResize(){ Object.values(charts).forEach(c=>c && c.resize && c.resize()); }

    // 新增：支持 route 和 warehouse 参数的自动聚焦
    function getQueryParam(name){
        try {
            const params = new URLSearchParams(window.location.search);
            return params.get(name);
        } catch(e) { return null; }
    }

})();


