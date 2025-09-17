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

    // 数据接口预留示例
    window.updateVehiclePanel = function(data) {
        document.getElementById('total-value').textContent = data.totalValue || '128';
        document.getElementById('stat-onroad').textContent = data.onroadTitle || '在途车辆';
        document.getElementById('onroad-value').textContent = data.onroadValue || '56';
        document.getElementById('stat-abnormal').textContent = data.abnormalTitle || '异常车辆';
        document.getElementById('abnormal-value').textContent = data.abnormalValue || '2';
        document.getElementById('stat-idle').textContent = data.idleTitle || '空闲车辆';
        document.getElementById('idle-value').textContent = data.idleValue || '60';
        document.getElementById('stat-charging').textContent = data.chargingTitle || '充电车辆';
        document.getElementById('charging-value').textContent = data.chargingValue || '10';
        document.getElementById('vehicle-id').textContent = data.vehicleId || '000001';
        document.getElementById('vehicle-type').textContent = data.vehicleType || '普通';
        document.getElementById('vehicle-capacity').textContent = data.vehicleCapacity || '6立方';
        document.getElementById('vehicle-battery').textContent = data.vehicleBattery || '100%';
        document.getElementById('vehicle-speed').textContent = data.vehicleSpeed || '10km/h';
        document.getElementById('vehicle-route').textContent = data.vehicleRoute || 'xx->xxx';
        document.getElementById('vehicle-eta').textContent = data.vehicleEta || '2025-9-11 18:00';
        // 实时画面接口预留
        if (data.videoElement) {
            const videoContainer = document.getElementById('vehicle-video');
            videoContainer.innerHTML = '';
            videoContainer.appendChild(data.videoElement);
        }
    };

    window.addEventListener('DOMContentLoaded', ()=>{
        renderCharts();
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
        // initialize trip chart and show default or mock data
        initTripChart();
        updateTripChartForRoute(null, null);
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
        if (typeof vehiclesData !== 'undefined') return vehiclesData;
        if (typeof window !== 'undefined' && window.vehiclesData) return window.vehiclesData;
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

    function getJdPoints(){
        if (typeof jdPoints !== 'undefined') return jdPoints;
        if (typeof window !== 'undefined' && window.jdPoints) return window.jdPoints;
        return null;
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

    function highlightRoute(routeId){
        highlightedRouteId = routeId;
        focusRoute(routeId);
        updateRouteListSelection();
        // update trip chart for selected route
        updateTripChartForRoute(routeId, null);
    }

    // --- Trip detail chart (速度 / 距离 / 耗电) ---
    function initTripChart(){
        const el = document.getElementById('prototypeChart');
        if (!el || !window.echarts) return null;
        charts.trip = echarts.init(el);
        const opt = {
            tooltip: { trigger: 'axis' },
            legend: { data: ['速度(km/h)','累计距离(km)','耗电(%)'], textStyle:{ color: '#cfeff5' } },
            grid: { left: 12, right: 12, top: 30, bottom: 10, containLabel: true },
            xAxis: { type: 'category', data: [], axisLine:{ lineStyle:{ color:'rgba(255,255,255,0.12)'} }, axisLabel:{ color:'#dfeffb' }, splitLine: { show: true, interval: 0, lineStyle: { color: 'rgba(53,170,174,1)', type: 'solid', width: 1.5 } } },
            yAxis: [
                { type: 'value', position:'left', axisLine:{ show:false }, axisLabel:{ show:false }, axisTick:{ show:false }, splitNumber: 10, splitLine:{ lineStyle:{ color:'rgba(53,170,174,1)', type: 'solid', width: 1.5 } } },
                { type: 'value', position:'right', offset: 0, axisLine:{ show:false }, axisLabel:{ show:false }, axisTick:{ show:false }, splitLine:{ show:false } },
                { type: 'value', position:'right', offset: 48, axisLine:{ show:false }, axisLabel:{ show:false }, axisTick:{ show:false }, splitLine:{ show:false } }
            ],
            series: [
                { name: '速度(km/h)', type: 'line', smooth: true, data: [], yAxisIndex: 0, itemStyle:{ color:'#60a5fa' } },
                { name: '累计距离(km)', type: 'line', smooth: true, data: [], yAxisIndex: 1, itemStyle:{ color:'#f59e42' } },
                { name: '耗电(%)', type: 'line', smooth: true, data: [], yAxisIndex: 2, itemStyle:{ color:'#9ef27e' } }
            ],
            graphic: [
                // outer border around full chart container
                {
                    type: 'rect',
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    shape: null,
                    style: {
                        stroke: 'rgba(53,170,174,1)',
                        fill: 'transparent',
                        lineWidth: 2
                    }
                },
                // border around grid area to match grid edges
                {
                    type: 'rect',
                    left: 8,
                    top: 30,
                    right: 10,
                    bottom: 12,
                    style: {
                        stroke: 'rgba(53,170,174,1)',
                        fill: 'transparent',
                        lineWidth: 2
                    }
                }
            ],
            textStyle: { color: '#ffffff' }
        };
        charts.trip.setOption(opt);
        return charts.trip;
    }

    // Generate fallback/mock trip data for a routeId (if real trip logs aren't provided)
    function generateMockTripData(routeId){
        // create 12 sample points (每 5 分钟) — 速度、累计距离、耗电
        const points = 12;
        const labels = [];
        const speeds = [];
        const dists = [];
        const soc = [];
        let cum = 0;
        let remaining = 100 - (Math.abs(hashCode(routeId)) % 30); // seed soc start
        for (let i=0;i<points;i++){
            labels.push((i*5) + 'm');
            const sp = Math.max(5, Math.round( (Math.sin(i/2)+1.5) * (30 + (i%3)*5) ));
            cum += +(sp/60*5).toFixed(2); // approximate km per 5 minutes
            speeds.push(sp);
            dists.push(+cum.toFixed(2));
            remaining = Math.max(10, remaining - (0.5 + Math.random()*1.5));
            soc.push(+remaining.toFixed(1));
        }
        return { labels, speeds, dists, soc };
    }

    function hashCode(str){
        let h = 0; for (let i=0;i<str.length;i++){ h = (h<<5)-h + str.charCodeAt(i); h|=0; } return h;
    }

    // Update trip chart with given dataset
    function updateTripChartForRoute(routeId, data){
        const chart = charts.trip || initTripChart();
        if (!chart) return;
        const d = data || generateMockTripData(routeId || 'default');
        chart.setOption({
            xAxis: { data: d.labels },
            series: [
                { name: '速度(km/h)', data: d.speeds },
                { name: '累计距离(km)', data: d.dists },
                { name: '耗电(%)', data: d.soc }
            ]
        });
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
        updateTripChartForRoute(null, null);
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
                // rotate via CSS transform; AMap 的 icon rotation 支持有限，使用 CSS 最简单
                img.style.transform = `rotate(${+(info.heading||0)}deg)`;

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
                                vehicleType: info.type || info.vehicleType || '',
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
            function fetchDrivingRoute(origin, destination){
                return new Promise(function(resolve, reject){
                    try {
                        var key = (window.AMAP_KEY || '');
                        if (!key){
                            // try to extract from amap script tag
                            var scripts = document.getElementsByTagName('script');
                            for (var i=0;i<scripts.length;i++){
                                var s = scripts[i];
                                if (s && s.src && s.src.indexOf('webapi.amap.com')!==-1 && s.src.indexOf('key=')!==-1){
                                    var m = s.src.match(/[?&]key=([^&]+)/);
                                    if (m && m[1]) { key = decodeURIComponent(m[1]); break; }
                                }
                            }
                        }
                        if (!key) { reject(new Error('AMap key not found')); return; }
                        var url = 'https://restapi.amap.com/v3/direction/driving?origin=' + origin[0] + ',' + origin[1] + '&destination=' + destination[0] + ',' + destination[1] + '&extensions=all&key=' + key;
                        fetch(url).then(function(res){ return res.json(); }).then(function(data){
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

            // For each planned route, build and draw asynchronously
            _plannedList.forEach(function(route, rindex){
                if (!route || !Array.isArray(route.waypoints) || route.waypoints.length < 2) return;
                (async function(_route, idx){
                    var origWaypoints = (_route.waypoints||[]).map(p=>[+p.lng, +p.lat]);

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
                        var all = [];
                        for (var i=0;i<origWaypoints.length-1;i++){
                            var a = origWaypoints[i], b = origWaypoints[i+1];
                            try {
                                var seg = await fetchDrivingRoute(a,b);
                                if (seg && seg.length){
                                    if (all.length && all[all.length-1][0]===seg[0][0] && all[all.length-1][1]===seg[0][1]) seg.shift();
                                    all = all.concat(seg);
                                } else {
                                    if (all.length===0) all.push(a);
                                    all.push(b);
                                }
                            } catch(e){
                                console.warn('segment fetch failed, fallback to straight', e);
                                if (all.length===0) all.push(a);
                                all.push(b);
                            }
                        }
                        if (all && all.length >= 2) coords = all;
                        // draw using the assembled coords (real route or fallback)
                        drawFromCoordsForRoute(coords);
                    } catch(e){ console.warn('failed to build full route via API', e); }
                })(route, rindex);
            });
        }
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

    // 通用小型柱状图配置
    function smallBarOption(color, unit){
        return {
            grid: { left: 6, right: 6, top: 8, bottom: 0, containLabel: true },
            xAxis: { type: 'category', data: ['一','二','三','四','五','六','日'], axisTick:{show:false}, axisLine:{lineStyle:{color:'#e6e8ec'}}, axisLabel:{color:'#64748b'} },
            yAxis: { type: 'value', axisLine:{show:false}, splitLine:{ lineStyle:{ color:'rgba(200,210,220,0.12)' } }, axisLabel:{ color:'#94a3b8' } },
            series: [{ type:'bar', data: [12,18,9,20,16,22,15], barWidth:'56%', itemStyle:{ color, borderRadius:[6,6,0,0] }, label:{ show:true, position:'top', color:'#111827', fontWeight:600, formatter:v=>`${v.data}${unit||''}` } }]
        };
    }

    function renderCharts(){
        // 订单列表用原生ul/li渲染
        try {
            var orderEl = document.getElementById('orderListChart');
            if (orderEl) {
                // 示例数据，可替换为后端/全局变量
                var orders = [
                    {id:'XXXX<br>-0001', type:'普件', dest:'送科学谷', status:'异常', note:'未处理<br>2025-9-11<br>18:00'},
                    {id:'XXXX<br>-0002', type:'冷藏', dest:'送大学城', status:'配送中', note:'预计明天送达'},
                    {id:'XXXX<br>-0003', type:'加急', dest:'送白市驿', status:'待取件', note:'已送达<br>2025-9-11<br>18:00'}
                ];
                orderEl.innerHTML = '';
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
                        '<div style="flex:1.2;text-align:center;font-weight:600;color:#cfeff5;word-break:break-all;">'+o.id+'</div>'+
                        '<div style="flex:1;text-align:center;color:#9FD8F2;word-break:break-all;">'+o.type+'</div>'+
                        '<div style="flex:2;text-align:center;color:#DFF6FB;word-break:break-all;">'+o.dest+'</div>'+
                        '<div style="flex:1.2;text-align:center;color:'+(o.status==='异常'?'#ff8989':(o.status==='配送中'?'#27e227':'#7ef27e'))+';font-weight:600;word-break:break-all;">'+o.status+'</div>'+
                        '<div style="flex:2;text-align:center;color:#94d1e8;word-break:break-all;">'+o.note+'</div>';
                    orderEl.appendChild(li);
                });
            }
        } catch (e) { console.warn('订单列表渲染失败', e); }
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


