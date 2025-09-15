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

    // helpers to read globals declared with const/let (which may not be on window)
    function getVehiclesMap(){
        if (typeof vehiclesData !== 'undefined') return vehiclesData;
        if (typeof window !== 'undefined' && window.vehiclesData) return window.vehiclesData;
        return {};
    }

    function getPlannedRoute(){
        if (typeof plannedRoute !== 'undefined') return plannedRoute;
        if (typeof window !== 'undefined' && window.plannedRoute) return window.plannedRoute;
        return null;
    }

    function getJdPoints(){
        if (typeof jdPoints !== 'undefined') return jdPoints;
        if (typeof window !== 'undefined' && window.jdPoints) return window.jdPoints;
        return null;
    }

    // 计算每辆车对应的包裹件数（扫描全局 packages 列表）
    function computePackageCountsByVehicle(){
        const map = {};
        try {
            const list = (typeof packages !== 'undefined') ? packages : (window && window.packages) || [];
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
            zoom: 12,
            center: [106.336035, 29.512830],
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
                    const counts = computePackageCountsByVehicle();
                    const cnt = counts[info.id] || 0;
                    const win = new AMap.InfoWindow({
                        content: `<div style="font-size:13px;line-height:1.6"><b>${info.id}</b><br>位置：${info.location}<br>速度：${info.speed}，限速：${info.limit}<br>件数：${cnt} 件</div>`,
                        offset: new AMap.Pixel(0, -20)
                    });
                    win.open(amap, [info.lng, info.lat]);
                });
                vehicleMarkers[info.id] = marker;
            } catch(e){
                console.warn('failed to create vehicle marker', e);
            }
        });

        // 在地图上绘制仓库（蓝色小圆点）和门店（黄色小圆点）
        try {
            WAREHOUSES.forEach(function(w){
                // 小圆点与一个半透明填充圈以提升可见性
                const circle = new AMap.Circle({
                    center: [w.lng, w.lat],
                    radius: 45,
                    strokeWeight: 0,
                    fillColor: '#2b6cff',
                    fillOpacity: 0.95,
                    zIndex: 140
                });
                circle.setMap(amap);
                const marker = new AMap.Marker({ position: [w.lng, w.lat], content: '<div style="width:18px;height:18px;border-radius:50%;background:#2b6cff;border:2px solid #fff"></div>', offset: new AMap.Pixel(-6, -6), zIndex:150 });
                marker.setMap(amap);
                marker.on('mouseover', function(){
                    const iw = new AMap.InfoWindow({ content: `<div style="font-size:13px;color:#000"><b>${w.name}</b><br/>${w.address}</div>`, offset: new AMap.Pixel(0,-10) });
                    iw.open(amap, [w.lng, w.lat]);
                });
                // track markers so we can show/hide later
                siteMarkers.warehouses.push(circle);
                siteMarkers.warehouses.push(marker);
            });

            STORES.forEach(function(s){
                const circle = new AMap.Circle({
                    center: [s.lng, s.lat],
                    radius: 40,
                    strokeWeight: 0,
                    fillColor: '#ffd24d',
                    fillOpacity: 0.95,
                    zIndex: 140
                });
                circle.setMap(amap);
                const marker = new AMap.Marker({ position: [s.lng, s.lat], content: '<div style="width:18px;height:18px;border-radius:50%;background:#ffd24d;border:2px solid #fff"></div>', offset: new AMap.Pixel(-6, -6), zIndex:150 });
                marker.setMap(amap);
                marker.on('mouseover', function(){
                    const iw = new AMap.InfoWindow({ content: `<div style="font-size:13px;color:#000"><b>${s.name}</b><br/>${s.address}</div>`, offset: new AMap.Pixel(0,-10) });
                    iw.open(amap, [s.lng, s.lat]);
                });
                siteMarkers.stores.push(circle);
                siteMarkers.stores.push(marker);
            });
        } catch(e){ console.warn('draw warehouses/stores failed', e); }

        // 如果 data.js 中提供了 plannedRoute，则使用高德路径规划优先构造真实道路坐标并绘制三类线路：正常(绿)、拥挤(红)、测试(蓝)
        const _planned = getPlannedRoute();
        if (_planned && Array.isArray(_planned.waypoints) && _planned.waypoints.length >= 2){
            const origWaypoints = (_planned.waypoints||[]).map(p=>[+p.lng, +p.lat]);

            // fetch driving polyline for a segment via 高德 REST API
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

            // drawing implementation re-usable for arbitrary coords
            function drawFromCoords(coords){
                // helper: apply offset, rotate and optional mirror to an array of [lng,lat]
                function transformRoutePoints(points, opts){
                    opts = opts || {};
                    var offset = typeof opts.offset === 'number' ? opts.offset : 0.004;
                    var stepNormal = !!opts.stepNormal;
                    var rotateDeg = typeof opts.rotateDeg === 'number' ? opts.rotateDeg : 0;
                    var mirror = !!opts.mirror;
                    var out = [];
                    var cosr = Math.cos(rotateDeg * Math.PI / 180);
                    var sinr = Math.sin(rotateDeg * Math.PI / 180);
                    for (var i=0;i<points.length;i++){
                        var p = points[i];
                        var lng = +p[0], lat = +p[1];
                        var dx = 0, dy = 0;
                        if (stepNormal && i < points.length - 1){
                            var a = points[i], b = points[i+1];
                            var vx = b[0] - a[0], vy = b[1] - a[1];
                            var nx = -vy, ny = vx;
                            var nlen = Math.sqrt(nx*nx + ny*ny) || 1;
                            nx /= nlen; ny /= nlen;
                            dx = nx * offset; dy = ny * offset;
                        } else { dx = offset; dy = offset/2; }
                        if (mirror) dx = -dx;
                        var rx = dx * cosr - dy * sinr;
                        var ry = dx * sinr + dy * cosr;
                        out.push([lng + rx, lat + ry]);
                    }
                    return out;
                }

                // info window for markers
                var siteInfoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -20) });

                try {
                    const normalLine = new AMap.Polyline({ path: coords, strokeColor: '#04fd04', strokeWeight: 4, lineJoin: 'round', zIndex:120 });
                    normalLine.setMap(amap);
                    routePolylines['normal'] = normalLine;
                } catch(e){ console.warn('draw normal route failed', e); }

                // NOTE: congested route drawing intentionally disabled to avoid over-plotting

                // NOTE: test route drawing intentionally disabled to avoid over-plotting

                // also add original waypoint markers from planned (as before)
                try {
                    (_planned.waypoints || []).forEach((p, idx) => {
                        const isWarehouse = (idx % 2) === 0;
                        const name = isWarehouse ? ('途径点-仓库-' + (idx+1)) : ('途径点-门店-' + (idx+1));
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
            (async function(){
                var coords = origWaypoints.slice();
                try {
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
                } catch(e){ console.warn('failed to build full route via API', e); }

                // draw using the assembled coords (real route or fallback)
                drawFromCoords(coords);
            })();
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
                    // operation routes = normal + congested
                    if (routePolylines['normal'] && routePolylines['normal'].setMap) routePolylines['normal'].setMap(visible ? amap : null);
                    if (routePolylines['congested'] && routePolylines['congested'].setMap) routePolylines['congested'].setMap(visible ? amap : null);
                    break;
                case 'test':
                    if (routePolylines['test'] && routePolylines['test'].setMap) routePolylines['test'].setMap(visible ? amap : null);
                    break;
                default:
                    // unknown type
                    break;
            }
        } catch(e){ console.warn('toggleMapLayer error', e); }
    };

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

    window.addEventListener('DOMContentLoaded', ()=>{
        renderCharts();
        // try to initialize AMap; use retry wrapper in case script loads slowly
        ensureInitMap(12, 300);
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
    });

    // ECharts 地图模块已移除；下面保留仓库/门店模拟数据和车辆相关工具函数（用于非 ECharts 地图或未来迁移）
    // 仓库和门店的经纬度（重庆主城区附近）
    const WAREHOUSES = [
        { name: '大学城仓库', lng: 106.319, lat: 29.611, type: 'warehouse', address: '重庆市大学城' },
        { name: '白市驿仓库', lng: 106.372, lat: 29.495, type: 'warehouse', address: '重庆市白市驿' }
    ];
    const STORES = [
        { name: '大学城门店', lng: 106.311, lat: 29.579, type: 'store', address: '重庆市大学城' },
        { name: '金凤镇门店', lng: 106.312, lat: 29.522, type: 'store', address: '重庆市金凤镇' },
        { name: '科学谷门店', lng: 106.393, lat: 29.537, type: 'store', address: '重庆市科学谷' }
    ];

    // 构建仓库series
    function buildWarehouseSeries() {
        var tp = getMapTransformParams();
        var cMerc = tp.centerMerc, yaw = tp.yawRad, pitch = tp.pitchRad, vd = tp.viewerDist;
        var data = WAREHOUSES.map(function(w) {
            var t = transformCoordsRecursive([[w.lng, w.lat]], cMerc, yaw, pitch, vd);
            var out = t && t[0] ? t[0] : [w.lng, w.lat];
            return {
                name: w.name,
                value: [out[0], out[1]],
                address: w.address,
                symbol: 'circle',
                symbolSize: 20,
                itemStyle: { color: '#f59e42', borderColor: '#fff', borderWidth: 2, shadowBlur: 8, shadowColor: '#f59e42' },
                label: { show: false, color: '#fff', fontWeight: 700, fontSize: 13, formatter: w.name }
            };
        });
        return [{
            name: 'warehouses',
            id: 'warehouses',
            type: 'scatter',
            coordinateSystem: 'geo',
            zlevel: 8,
            z: 1100,
            symbol: 'circle',
            symbolSize: 20,
            label: { show: false, color: '#fff', fontWeight: 700, fontSize: 13, formatter: '{b}' },
            itemStyle: { color: '#f59e42', borderColor: '#fff', borderWidth: 2, shadowBlur: 8, shadowColor: '#f59e42' },
            tooltip: {
                show: true,
                formatter: function(p) {
                    return '<div style="font-size:13px;color:#fff"><b>' + p.name + '</b><br/>类型: 仓库<br/>地址: ' + (p.data.address||'') + '</div>';
                }
            },
            data: data
        }];
    }

    // 构建门店series
    function buildStoreSeries() {
        var tp = getMapTransformParams();
        var cMerc = tp.centerMerc, yaw = tp.yawRad, pitch = tp.pitchRad, vd = tp.viewerDist;
        var data = STORES.map(function(s) {
            var t = transformCoordsRecursive([[s.lng, s.lat]], cMerc, yaw, pitch, vd);
            var out = t && t[0] ? t[0] : [s.lng, s.lat];
            return {
                name: s.name,
                value: [out[0], out[1]],
                address: s.address,
                symbol: 'circle',
                symbolSize: 20,
                itemStyle: { color: '#60a5fa', borderColor: '#fff', borderWidth: 2, shadowBlur: 8, shadowColor: '#60a5fa' },
                label: { show: false, color: '#fff', fontWeight: 700, fontSize: 12, formatter: s.name }
            };
        });
        return [{
            name: 'stores',
            id: 'stores',
            type: 'scatter',
            coordinateSystem: 'geo',
            zlevel: 8,
            z: 1100,
            symbol: 'circle',
            symbolSize: 20,
            label: { show: false, color: '#fff', fontWeight: 700, fontSize: 12, formatter: '{b}' },
            itemStyle: { color: '#60a5fa', borderColor: '#fff', borderWidth: 2, shadowBlur: 8, shadowColor: '#60a5fa' },
            tooltip: {
                show: true,
                formatter: function(p) {
                    return '<div style="font-size:13px;color:#fff"><b>' + p.name + '</b><br/>类型: 门店<br/>地址: ' + (p.data.address||'') + '</div>';
                }
            },
            data: data
        }];
    }
    // ================== END 仓库/门店模拟数据 ==================

    // 构建路线 series（优先使用 getPlannedRoute）
    function buildRouteSeries(){
        var planned = getPlannedRoute();
        if (!planned || !Array.isArray(planned.waypoints) || planned.waypoints.length < 2) return [];
        var coords = (planned.waypoints||[]).map(function(p){ return [ +p.lng, +p.lat ]; });
        // helper: apply offset, rotate and optional mirror to an array of [lng,lat]
        function transformRoutePoints_local(points, opts){
            opts = opts || {};
            var offset = typeof opts.offset === 'number' ? opts.offset : 0.004;
            var stepNormal = !!opts.stepNormal;
            var rotateDeg = typeof opts.rotateDeg === 'number' ? opts.rotateDeg : 0;
            var mirror = !!opts.mirror;
            var out = [];
            var cosr = Math.cos(rotateDeg * Math.PI / 180);
            var sinr = Math.sin(rotateDeg * Math.PI / 180);
            for (var i=0;i<points.length;i++){
                var p = points[i];
                var lng = +p[0], lat = +p[1];
                var dx = 0, dy = 0;
                if (stepNormal && i < points.length - 1){
                    var a = points[i], b = points[i+1];
                    var vx = b[0] - a[0], vy = b[1] - a[1];
                    var nx = -vy, ny = vx;
                    var nlen = Math.sqrt(nx*nx + ny*ny) || 1;
                    nx /= nlen; ny /= nlen;
                    dx = nx * offset; dy = ny * offset;
                } else {
                    dx = offset; dy = offset/2;
                }
                if (mirror) dx = -dx;
                var rx = dx * cosr - dy * sinr;
                var ry = dx * sinr + dy * cosr;
                out.push([lng + rx, lat + ry]);
            }
            return out;
        }

        // 构造两条新路线（拥挤、测试），使用更明显的偏移/旋转/镜像
        var congestedCoords = transformRoutePoints_local(coords, { offset: 0.0075, stepNormal: true, rotateDeg: 6, mirror: false });
        var testCoords = transformRoutePoints_local(coords.slice().reverse(), { offset: 0.0095, stepNormal: true, rotateDeg: -12, mirror: true });

        // apply same yaw/pitch transform used for streets so lines 对齐轴测地图
        try {
            var tp = getMapTransformParams();
            var centerMerc = tp.centerMerc;
            var yaw = tp.yawRad; var pitch = tp.pitchRad; var vd = tp.viewerDist;
            coords = coords.map(function(ll){
                try {
                    var transformed = transformCoordsRecursive([ll], centerMerc, yaw, pitch, vd);
                    return transformed && transformed[0] ? [ +transformed[0][0], +transformed[0][1] ] : ll;
                } catch(e){ return ll; }
            });
            congestedCoords = congestedCoords.map(function(ll){
                try {
                    var transformed = transformCoordsRecursive([ll], centerMerc, yaw, pitch, vd);
                    return transformed && transformed[0] ? [ +transformed[0][0], +transformed[0][1] ] : ll;
                } catch(e){ return ll; }
            });
            testCoords = testCoords.map(function(ll){
                try {
                    var transformed = transformCoordsRecursive([ll], centerMerc, yaw, pitch, vd);
                    return transformed && transformed[0] ? [ +transformed[0][0], +transformed[0][1] ] : ll;
                } catch(e){ return ll; }
            });
        } catch(e){ /* ignore and use raw coords */ }

        return [
            {
                name: '正常路线',
                id: 'routes',
                type: 'lines',
                coordinateSystem: 'geo',
                polyline: true,
                silent: false,
                effect: { show: true, period: 6, trailLength: 0.2, symbol: 'arrow', symbolSize: 6, color: '#00F8FF' },
                lineStyle: { color: '#27e227', width: 3, opacity: 0.9, curveness: 0.1 },
                data: [ { coords: coords, routeId: planned.id || 'R001' } ]
            },
            {
                name: '拥挤路线',
                id: 'congested_route',
                type: 'lines',
                coordinateSystem: 'geo',
                polyline: true,
                silent: false,
                effect: { show: false },
                lineStyle: { color: '#ff3b3b', width: 3, opacity: 0.9, curveness: 0.1 },
                data: [ { coords: congestedCoords, routeId: 'congested' } ]
            },
            {
                name: '测试路线',
                id: 'test_route',
                type: 'lines',
                coordinateSystem: 'geo',
                polyline: true,
                silent: false,
                effect: { show: false },
                lineStyle: { color: '#3b7bff', width: 3, opacity: 0.9, curveness: 0.1 },
                data: [ { coords: testCoords, routeId: 'test' } ]
            }
        ];
    }

    // 构建车辆点位 series（从全局 vehiclesData 中读取）
    function buildVehicleSeries(vehicleMap){
        var list = [];
        try {
            var vals = Object.values(vehicleMap || {});
            var tp = getMapTransformParams();
            var cMerc = tp.centerMerc; var yaw = tp.yawRad; var pitch = tp.pitchRad; var vd = tp.viewerDist;
            vals.forEach(function(v){
                if (!v) return;
                if (!isFinite(+v.lng) || !isFinite(+v.lat)) return;
                try {
                    var transformed = transformCoordsRecursive([[+v.lng, +v.lat]], cMerc, yaw, pitch, vd);
                    var out = transformed && transformed[0] ? transformed[0] : [+v.lng, +v.lat];
                    list.push({ name: v.id || (v.vehicleId||'veh'), value: [ +out[0], +out[1], +(v.speed||0) ], raw: v,
                        symbol: 'image://' + VEHICLE_ICON, symbolSize: 32, symbolRotate: +(v.heading||0) });
                } catch(e){
                    list.push({ name: v.id || (v.vehicleId||'veh'), value: [ +v.lng, +v.lat, +(v.speed||0) ], raw: v,
                        symbol: 'image://' + VEHICLE_ICON, symbolSize: 32, symbolRotate: +(v.heading||0) });
                }
            });
        } catch(e){}
        return [{
            name: 'vehicles',
            id: 'vehicles',
            type: 'scatter',
            coordinateSystem: 'geo',
            // put vehicles on a higher zlevel so they always render above streets
            zlevel: 10,
            z: 1200,
            symbol: 'image://' + VEHICLE_ICON,
            symbolSize: 32,
            label: { show: false, formatter: '{b}', color: '#ffffff', position: 'right' },
            itemStyle: { borderColor: '#fff', borderWidth: 1, shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.35)' },
            tooltip: { 
                show: true,
                formatter: function (p) {
                    var v = p && p.data && p.data.raw ? p.data.raw : null;
                    var speed = (p && p.value && p.value[2]) ? p.value[2] : (v && v.speed ? v.speed : '-');
                    var pkgCnt = (v && v.id) ? (computePackageCountsByVehicle()[v.id] || 0) : 0;
                    return '<div style="font-size:12px;color:#fff">' + (p.name||'车辆') + '<br/>速度: ' + speed + ' km/h<br/>件数: ' + pkgCnt + '</div>';
                }
            },
            data: list
        }];
    }

    // 尝试从页面可用的 GeoJSON 中恢复用于几何旋转的参数（center, yaw, pitch）
    function getMapTransformParams(){
        try {
            var g = window.__SPB_MAP_TRANSFORM__;
            if (g && g.centerMerc && (typeof g.yawDeg !== 'undefined')){
                var yawRad = (g.yawDeg||0) * Math.PI / 180.0;
                var pitchRad = (g.pitchDeg||0) * Math.PI / 180.0;
                return { centerMerc: g.centerMerc, yawRad: yawRad, pitchRad: pitchRad, viewerDist: undefined };
            }
        } catch(e){}
        var candidate = window.streetsGeoJSON || window.streets || window.__SPB_STREETS__ || null;
        var center = null;
        if (candidate && candidate.features) center = computeGeoJSONBBoxCenter(candidate);
        if (!center) center = [106.372064, 29.534044];
        var yawDeg = -45; // fallback
        var pitchDeg = 45;
        var yawRad = (yawDeg||0) * Math.PI / 180.0;
        var pitchRad = (pitchDeg||0) * Math.PI / 180.0;
        var centerMerc = lonLatToMercator(center[0], center[1]);
        return { centerMerc: centerMerc, yawRad: yawRad, pitchRad: pitchRad, viewerDist: undefined };
    }

    // 简单沿路线模拟移动（当全局 vehiclesData 没有实时坐标时使用）
    var _simState = {};
    function ensureSimForVehicle(id, routeCoords){
        if (!_simState[id]){
            _simState[id] = { idx:0, progress:0 }; // idx 到下一点的索引，progress 0..1
        }
        var s = _simState[id];
        // 保证 idx 在范围内
        if (!routeCoords || routeCoords.length < 2) { s.idx = 0; s.progress = 0; }
        else { s.idx = Math.max(0, Math.min(s.idx, routeCoords.length - 2)); }
        return s;
    }

    function stepSimulateAlongRoute(routeCoords, state, stepFrac){
        if (!routeCoords || routeCoords.length < 2) return routeCoords && routeCoords[0] || [0,0];
        stepFrac = stepFrac || 0.02; // 每次前进的比例
        state.progress += stepFrac;
        while (state.progress >= 1 && state.idx < routeCoords.length - 2){ state.progress -= 1; state.idx++; }
        if (state.progress >=1) state.progress = 1;
        var a = routeCoords[state.idx];
        var b = routeCoords[Math.min(state.idx+1, routeCoords.length-1)];
        var lng = a[0] + (b[0]-a[0]) * state.progress;
        var lat = a[1] + (b[1]-a[1]) * state.progress;
        return [lng, lat];
    }

    // ECharts 车辆/线路层逻辑已移除（原 startEchartsVehicleLayer 已删除）。

    // 已移除 ECharts 地图自动初始化：保留占位，后续可在需要时调用地图初始化 API。
})();


