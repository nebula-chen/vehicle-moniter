(function(){
    const charts = {};
    let amap, vehicleMarkers = {};
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

    // 简单 KPI 计算
    function computeKPIs(map){
        const ids = Object.keys(map||{});
        const trips = 268; // 示例静态
        const orders = 1350;
        const routes = 42;
        const onRoad = ids.length;
        return { trips, orders, routes, onRoad };
    }

    function setKPIs(k){
        document.getElementById('kpiTrips').innerText = k.trips + ' 次';
        document.getElementById('kpiOrders').innerText = k.orders;
        document.getElementById('kpiRoutes').innerText = k.routes;
        document.getElementById('kpiOnRoad').innerText = k.onRoad;
    }

    // 将路线聚焦并高亮
    function focusRoute(routeId){
        const line = routePolylines[routeId];
        if (!line) return;
        // fit bounds
        const path = line.getPath();
        if (path && path.length) {
            const bounds = new AMap.Bounds();
            path.forEach(p=> bounds.extend(new AMap.LngLat(p.lng || p[0], p.lat || p[1])));
            amap.setFitView([line], true, [40,40,40,40]);
        }
        // 高亮样式（默认电光紫，高亮霓虹绿）
        Object.keys(routePolylines).forEach(id=>{
            const l = routePolylines[id];
            l.setOptions({ strokeColor: id===routeId ? '#7FFF00' : '#6B48FF', strokeWeight: id===routeId ? 6 : 4 });
        });
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
        // restore style to default electric purple
        Object.keys(routePolylines).forEach(id=> routePolylines[id].setOptions({ strokeColor: '#6B48FF', strokeWeight:4 }));
        updateRouteListSelection();
        // 清空或恢复 trip chart
        updateTripChartForRoute(null, null);
    }

    function updateRouteListSelection(){
        const lis = document.querySelectorAll('#routeList li');
        if (!lis || lis.length === 0) return;
        lis.forEach(li=>{
            const id = li.dataset.routeId;
            if (!id) return;
            if (highlightedRouteId === id) {
                li.classList.add('selected');
            } else {
                li.classList.remove('selected');
            }
        });
    }

    function initMap(){
        if (!window.AMap) return;
        amap = new AMap.Map('amapCar', {
            zoom: 12,
            center: [106.372064, 29.534044],
            mapStyle: "amap://styles/darkblue",
            resizeEnable: true
        });
        // amap.addControl(new AMap.Scale());
        // amap.addControl(new AMap.ToolBar());

        // 添加车辆标记
        const infos = getVehiclesMap() || {};
        Object.values(infos).forEach(info => {
            const marker = new AMap.Marker({
                position: [info.lng, info.lat],
                title: info.id,
                content: `<img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f69a.png" style="width:28px;height:28px;display:block;">`,
                offset: new AMap.Pixel(-12, -12),
                zIndex: 2000
            });
            marker.setMap(amap);
            marker.on('click', () => {
                // 计算该车件数并显示在信息窗体中
                const counts = computePackageCountsByVehicle();
                const cnt = counts[info.id] || 0;
                const win = new AMap.InfoWindow({
                    content: `<div style="font-size:13px;line-height:1.6"><b>${info.id}</b><br>位置：${info.location}<br>速度：${info.speed}，限速：${info.limit}<br>件数：${cnt} 件</div>`,
                    offset: new AMap.Pixel(0, -20)
                });
                win.open(amap, [info.lng, info.lat]);
            });
            vehicleMarkers[info.id] = marker;
        });

        // 如果 data.js 中提供了 plannedRoute，则以其为基础创建一个“测试线路编号001”并渲染
        const _planned = getPlannedRoute();
        if (_planned && Array.isArray(_planned.waypoints)){
            const base = _planned;
            const testRoute = Object.assign({}, base, { id: 'R001', description: '测试线路编号001' });
            const path = (testRoute.waypoints||[]).map(p=>[p.lng,p.lat]);
            const line = new AMap.Polyline({ path, strokeColor:'#E0E0E0', strokeWeight:4, showDir:true, zIndex:100 });
            line.setMap(amap);
            routePolylines[testRoute.id] = line;

            // 为途径点添加顺序标记（可点击显示经纬信息），参考 dashboard.js 的表现
            const siteInfoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -20) });
            (testRoute.waypoints || []).forEach((p, idx) => {
                const seq = idx + 1;
                const seqHtml = `
                    <div style="display:flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:#001233;border:2px solid #00F0FF;color:#00F0FF;font-weight:520;box-shadow:0 1px 6px rgba(0,240,255,0.12);pointer-events:auto">${seq}</div>
                `;
                const seqMarker = new AMap.Marker({ position: [p.lng, p.lat], content: seqHtml, offset: new AMap.Pixel(-12, -12), zIndex:150 });
                seqMarker.setMap(amap);
                seqMarker.on('click', () => {
                    const infoWindow = new AMap.InfoWindow({ content: `<div style="font-size:13px;"><b>顺序 ${seq}</b><br>经度: ${p.lng}<br>纬度: ${p.lat}</div>`, offset: new AMap.Pixel(0, -20) });
                    infoWindow.open(amap, [p.lng, p.lat]);
                });
            });

            // 绘制起止点并改为鼠标悬停显示信息面板（参考 dashboard.js）
            const _jd = getJdPoints();
            if (_jd && _jd.scienceValley && _jd.universityTown) {
                const s = _jd.scienceValley;
                const e = _jd.universityTown;
                const makeSiteMarker = (site) => {
                    const content = `
                        <div style="width:28px;height:28px;border-radius:6px;background:linear-gradient(90deg,#00F0FF,#E0E0E0);display:flex;align-items:center;justify-content:center;color:#000;font-weight:700;font-size:14px;">JD</div>
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

    // 通用小型柱状图配置
    function smallBarOption(color, unit){
        return {
            grid: { left: 6, right: 6, top: 8, bottom: 0, containLabel: true },
            xAxis: { type: 'category', data: ['一','二','三','四','五','六','日'], axisTick:{show:false}, axisLine:{lineStyle:{color:'#e6e8ec'}}, axisLabel:{color:'#64748b'} },
            yAxis: { type: 'value', axisLine:{show:false}, splitLine:{ lineStyle:{ color:'rgba(200,210,220,0.12)' } }, axisLabel:{ color:'#94a3b8' } },
            series: [{ type:'bar', data: [12,18,9,20,16,22,15], barWidth:'56%', itemStyle:{ color, borderRadius:[6,6,0,0] }, label:{ show:true, position:'top', color:'#111827', fontWeight:600, formatter:v=>`${v.data}${unit||''}` } }]
        };
    }

    // 小型图表基础风格（白色文案、隐藏 y 轴刻度、简约网格）
    function smallChartBase(){
        return {
            grid:{ left:6, right:6, top:8, bottom:0, containLabel:true },
            xAxis:{ type:'category', axisLine:{ lineStyle:{ color:'rgba(255,255,255,0.18)' } }, axisLabel:{ color:'#ffffff' } },
            yAxis:[ { type:'value', axisLine:{ show:false }, axisLabel:{ show:false }, splitLine:{ lineStyle:{ color:'rgba(255,255,255,0.06)' } } } ],
            textStyle:{ color:'#ffffff' }
        };
    }

    function renderCharts(){
        // 合并后的订单配送统计图（柱状 + 折线）
        charts.orderDelivery = echarts.init(document.getElementById('chartOrderDelivery'));
        charts.util = echarts.init(document.getElementById('chartUtil'));
        charts.eff = echarts.init(document.getElementById('chartEff'));
        charts.perf = echarts.init(document.getElementById('chartPerf'));

        // 共享的数据集（从订单配送统计中提取以便在多个图表复用）
        const days = ['一','二','三','四','五','六','日'];
        // 样例数据：车次、订单数量、配送重量(kg)
        const tripCounts = [12, 18, 9, 20, 16, 22, 15];
        const orderCounts = [120, 98, 130, 150, 110, 140, 160];

        // 复用的车次 series（直接从订单配送统计剪切过来）
        const tripSeries = { name:'车次', type:'bar', data: tripCounts, barWidth:'28%', itemStyle:{ color:'#66b1ff', borderRadius:[6,6,0,0] }, yAxisIndex:0 };

        const opt = {
            grid:{ left: 6, right: 6, top: 8, bottom: 0, containLabel:true },
            tooltip:{ trigger:'axis', axisPointer:{ type:'shadow' }, formatter: params => {
                let tpl = params[0].axisValueLabel + '<br/>';
                params.forEach(p => {
                    if (p.seriesType === 'bar') {
                        tpl += `${p.marker}${p.seriesName}: ${p.data}${p.seriesName==='车次' ? ' 次' : ' 单'}<br/>`;
                    } else if (p.seriesType === 'line') {
                        tpl += `${p.marker}${p.seriesName}: ${p.data} kg<br/>`;
                    }
                });
                return tpl;
            }},
            // 在 panel 标题中显示外部 legend，ECharts 内部 legend 关闭
            legend: false,
            xAxis:{ type:'category', data: days, axisLine:{ lineStyle:{ color:'rgba(255,255,255,0.18)' } }, axisLabel:{ color:'#ffffff' } },
            // 隐藏纵轴刻度与轴线，仅保留网格参考线（可选）
            yAxis:[
                { type:'value', position:'left', axisLine:{ show:false }, axisLabel:{ show:false }, splitLine:{ lineStyle:{ color:'rgba(255,255,255,0.06)' } } },
                { type:'value', position:'right', axisLine:{ show:false }, axisLabel:{ show:false }, splitLine:{ show:false } }
            ],
            // 直方效果：无空隙，直观高度对比
            barGap: 0,
            barCategoryGap: '20%',
            series:[
                { name:'订单数量', type:'bar', data: orderCounts, barWidth:'28%', itemStyle:{ color:'#ffb86b', borderRadius:[6,6,0,0] }, yAxisIndex:0 },
            ]
        };
        charts.orderDelivery.setOption(opt);

        // 车辆安全统计：事件数量（直方） + 误报率（折线） + 事件成功解决占比（折线）
        const effOpt = Object.assign({}, smallChartBase(), {
            xAxis: { type: 'category', data: ['一','二','三','四','五','六','日'], axisLabel: { color: '#ffffff' } },
            tooltip: { trigger: 'axis' },
            legend: false,
            series: [
                { name: '事件数量', type: 'bar', data: [10,8,6,8,12,4,2], barWidth: '36%', itemStyle: { color: '#6b7280', borderRadius: [6,6,0,0] } },
            ]
        });
        charts.eff.setOption(effOpt);

        // 车辆效能统计：车辆耗电（直方） + 里程利用率（折线） + 平均耗时（折线）
        const perfBase = Object.assign({}, smallChartBase(), {
            tooltip: { trigger: 'axis' },
            legend: false,
            xAxis: { type: 'category', data: ['一','二','三','四','五','六','日'], axisLabel: { color: '#ffffff' } },
            series: [
                tripSeries,
            ]
        });
        charts.perf.setOption(perfBase);

        // XXX统计，待补充
        const utilOpt = Object.assign({}, smallChartBase(), {
            xAxis: { type: 'category', data: ['一','二','三','四','五','六','日'], axisLabel: { color: '#ffffff' } },
            tooltip: { trigger: 'axis' },
            legend: false,
            series:[
                { type:'bar', data:[72,68,75,80,70,78,82], barWidth:'36%', itemStyle:{ color:'#f59e42', borderRadius:[6,6,0,0] } }
            ],
        });
        charts.util.setOption(utilOpt);
    }

    function fillLists(){
        const statusUl = document.getElementById('orderStatusList');
        const routeUl = document.getElementById('routeList');
        if (statusUl) statusUl.innerHTML = '';
        // 当 routeList 已由外部（panel-prototype.js）填充时，避免清空它以免破坏交互；仅在不存在 children 时进行填充
        const shouldFillRouteUl = routeUl && routeUl.children.length === 0;
        if (shouldFillRouteUl) routeUl.innerHTML = '';
        const items = [
            { id:'PKG-CQ-001', status:'配送中' },
            { id:'PKG-CQ-002', status:'待取件' },
            { id:'PKG-CQ-003', status:'已签收' },
            { id:'PKG-CQ-004', status:'异常' }
        ];
        // 为订单状态列表加入指派车辆编号（若 packages 数据包含 assignedVehicle 字段）
        items.forEach(it=>{
            const li = document.createElement('li');
            // 尝试从全局 packages 查找对应订单并读取 assignedVehicle
            let vehicleLabel = '';
            try {
                const list = (typeof packages !== 'undefined') ? packages : (window && window.packages) || [];
                const found = list.find(p => p.id === it.id);
                if (found && found.assignedVehicle) vehicleLabel = `<span class="mono" style="margin-left:8px;color:#cfeff5">${found.assignedVehicle}</span>`;
            } catch(e) {}
            li.innerHTML = `<span style="display:flex;align-items:center;gap:8px"><span class="badge ${it.status}">${it.status}</span><span class="mono">${it.id}</span>${vehicleLabel}</span>`;
            if (statusUl) statusUl.appendChild(li);
        });

        // 组装路线列表：优先展示来自 data.js 的测试线路（如果存在），并绑定锁定交互
        const routes = [];
        const _planned = getPlannedRoute();
        if (_planned && Array.isArray(_planned.waypoints)) {
            const tr = Object.assign({}, _planned, { id: 'R001', description: _planned.description || '测试线路（由 data.js 提供）' });
            routes.push(tr);
        }
        routes.push({ id:'R002', description:'城区环线配送' }, { id:'R003', description:'大学城夜间专线' }, { id:'R004', description:'测试线路' }, { id:'测试编号', description:'测试线路' });

        // 计算每条路线的在途车辆数（通过 packages.assignedVehicle 与 planned route id 之间的简单匹配）
        // 这里我们采用的匹配策略：如果 package.assignedVehicle 存在并且车辆当前经纬在路线 polyline 的 bbox 内则视为在途。为简单起见，先按 assignedVehicle 计数（如需精确定位可扩展）。
        const pkgByVehicle = computePackageCountsByVehicle();
        routes.forEach(r=>{
            // 如果 routeList 已由 prototype 填充，跳过重复添加默认 routes
            if (!shouldFillRouteUl) return;
            const li = document.createElement('li');
            li.dataset.routeId = r.id;
            // 计算在途车辆数：如果 route.id === 'R001'（来自 plannedRoute）则统计所有有 assignedVehicle 的包裹作为在途车辆数的近似
            let inTransitCount = 0;
            try {
                const list = (typeof packages !== 'undefined') ? packages : (window && window.packages) || [];
                if (r.id === 'R001') {
                    // 统计不同车辆数
                    const s = new Set();
                    list.forEach(p=>{ if (p.assignedVehicle) s.add(p.assignedVehicle); });
                    inTransitCount = s.size;
                } else {
                    // 其他路线路径暂无绑定数据，使用 0 或者基于 pkgByVehicle 聚合的估算（这里取 0）
                    inTransitCount = 0;
                }
            } catch(e){ inTransitCount = 0; }

            // 将 id、描述、以及在途车辆计数显示在列表中
            li.innerHTML = `<div class="route-item" ><span class="mono">${r.id}</span><span style="flex:1;color:#ffffff">${r.description || '规划路线'}</span><span style="margin-left:8px;color:#cfeff5"><b style=\"color:#00F8FF\">${inTransitCount}</b></span></div>`;
            if (routeUl) routeUl.appendChild(li);
            // 点击组件高亮并聚焦（阻止事件冒泡以避免 document 点击清除）
            li.addEventListener('click', (ev)=>{ ev.stopPropagation(); highlightRoute(r.id); });
        });
    updateRouteListSelection();
    }

    function onResize(){ Object.values(charts).forEach(c=>c && c.resize && c.resize()); }

    window.addEventListener('DOMContentLoaded', ()=>{
        renderCharts();
        initMap();
        fillLists();
    setKPIs(computeKPIs(getVehiclesMap()));
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

    // ------------------ ECharts 地图模块（从 map_prototype.html 迁移） ------------------
    // ===== Helpers: 投影与几何旋转 =====
    // Web-Mercator projection helpers (EPSG:3857) - works well for local/城市级别的旋转
    function lonLatToMercator(lon, lat){
        var x = lon * 20037508.34 / 180.0;
        var y = Math.log(Math.tan((90 + lat) * Math.PI / 360.0)) / (Math.PI / 180.0);
        y = y * 20037508.34 / 180.0;
        return [x, y];
    }
    function mercatorToLonLat(x, y){
        var lon = (x / 20037508.34) * 180.0;
        var lat = (y / 20037508.34) * 180.0;
        lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180.0)) - Math.PI / 2.0);
        return [lon, lat];
    }

    // 先保留简单的绕 Z 轴旋转点方法，但主要使用下面的复合变换：Yaw(绕Z) + Pitch(绕X) + 透视投影
    function rotatePointAround(centerXY, pointXY, angleRad){
        var dx = pointXY[0] - centerXY[0];
        var dy = pointXY[1] - centerXY[1];
        var cosA = Math.cos(angleRad);
        var sinA = Math.sin(angleRad);
        var rx = centerXY[0] + (dx * cosA - dy * sinA);
        var ry = centerXY[1] + (dx * sinA + dy * cosA);
        return [rx, ry];
    }

    // 复合变换：先绕中心做 yaw (Z 轴) 旋转，再围绕 X 轴做 pitch（俯仰），最后用简单的透视投影将 z 映射到平面
    function transformPointYawPitch(centerXY, pointXY, yawRad, pitchRad, viewerDist){
        // 平移到中心
        var dx = pointXY[0] - centerXY[0];
        var dy = pointXY[1] - centerXY[1];
        var dz = 0;
        // yaw (绕 Z轴)
        var cosy = Math.cos(yawRad || 0), siny = Math.sin(yawRad || 0);
        var x1 = dx * cosy - dy * siny;
        var y1 = dx * siny + dy * cosy;
        var z1 = dz;
        // pitch (绕 X 轴)
        var cosp = Math.cos(pitchRad || 0), sinp = Math.sin(pitchRad || 0);
        var x2 = x1;
        var y2 = y1 * cosp - z1 * sinp;
        var z2 = y1 * sinp + z1 * cosp;
        // 透视投影，viewerDist 为视距（单位与 mercator 相同），避免穿透
        var D = (typeof viewerDist === 'number' && isFinite(viewerDist)) ? viewerDist : 2e7;
        var denom = (D - z2) || D; // 防止除以 0
        var scale = D / denom;
        var xp = centerXY[0] + x2 * scale;
        var yp = centerXY[1] + y2 * scale;
        return [xp, yp];
    }

    // 递归变换 coordinates 数组（支持 Point/LineString/Polygon 等任意深度）
    function transformCoordsRecursive(coords, centerXY, yawRad, pitchRad, viewerDist){
        if (!Array.isArray(coords)) return coords;
        // 如果是数字坐标点 [lon, lat]
        if (typeof coords[0] === 'number' && typeof coords[1] === 'number'){
            var p = lonLatToMercator(+coords[0], +coords[1]);
            var tp = transformPointYawPitch(centerXY, p, yawRad, pitchRad, viewerDist);
            var ll = mercatorToLonLat(tp[0], tp[1]);
            return [ +ll[0], +ll[1] ];
        }
        // 否则递归映射子数组
        return coords.map(function(c){ return transformCoordsRecursive(c, centerXY, yawRad, pitchRad, viewerDist); });
    }

    function computeGeoJSONBBoxCenter(geo){
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        function scanCoords(coords){
            if (!Array.isArray(coords)) return;
            if (typeof coords[0] === 'number' && typeof coords[1] === 'number'){
                var lon = +coords[0], lat = +coords[1];
                if (isFinite(lon) && isFinite(lat)){
                    minX = Math.min(minX, lon); minY = Math.min(minY, lat);
                    maxX = Math.max(maxX, lon); maxY = Math.max(maxY, lat);
                }
                return;
            }
            for (var i=0;i<coords.length;i++) scanCoords(coords[i]);
        }
        if (geo && geo.features && Array.isArray(geo.features)){
            geo.features.forEach(function(f){ if (f && f.geometry && f.geometry.coordinates) scanCoords(f.geometry.coordinates); });
        }
        if (!isFinite(minX)) return null;
        return [ (minX+maxX)/2, (minY+maxY)/2 ];
    }

    // 将 GeoJSON 的所有几何绕指定经纬中心旋转 angleDeg（度）并返回新对象（不修改原对象）
    // 旋转/俯仰 GeoJSON：centerLonLat 为轴心经纬，angleDeg 为 yaw（绕Z），pitchDeg 为绕X 的俯仰角度，viewerDist 为透视视距（mercator 单位）
    function rotateGeoJSON(geojson, centerLonLat, angleDeg, pitchDeg, viewerDist){
        if (!geojson) return geojson;
        var yawRad = (angleDeg || 0) * Math.PI / 180.0;
        var pitchRad = (pitchDeg || 0) * Math.PI / 180.0;
        var centerMerc = lonLatToMercator(centerLonLat[0], centerLonLat[1]);
        // deep clone minimal structure while mapping coordinates
        var out = Object.assign({}, geojson);
        out.features = (geojson.features || []).map(function(f){
            var nf = Object.assign({}, f);
            if (f.geometry){
                nf.geometry = Object.assign({}, f.geometry);
                try {
                    nf.geometry.coordinates = transformCoordsRecursive(f.geometry.coordinates, centerMerc, yawRad, pitchRad, viewerDist);
                } catch(e){ nf.geometry.coordinates = f.geometry.coordinates; }
            }
            return nf;
        });
        return out;
    }

    function registerStreetsIfAvailableEcharts(streetsGeoJSON, chartInstance) {
        try {
            if (!streetsGeoJSON || !streetsGeoJSON.type) return false;
            // 只保留以下指定的街道/镇名称，其他区域将被隐藏
            var allowedNames = [
                '虎溪街道','香炉山街道','西永街道','曾家镇','含谷镇','金凤镇','白市驿镇','走马镇','石板镇','巴福镇'
            ];

            // 过滤 features：根据 properties 中可能存在的多个字段匹配名称（name/NAME/NAME_CH 等）
            var rawFiltered = (streetsGeoJSON.features || []).filter(function(f){
                var props = f.properties || {};
                var cand = (props.name || props.NAME || props.NAME_CH || props.adname || props.adcode || '').toString().trim();
                if (!cand) return false;
                // 精确匹配（不区分大小写）
                return allowedNames.some(function(n){ return n.toLowerCase() === cand.toLowerCase(); });
            });

            // 去重：有的 GeoJSON 在合并/导出时可能包含重复的几何（导致地图上重复描边）
            // 优先用规范化名称去重，若名称缺失则用 geometry 的 JSON 签名去重，最后回退为整个 feature 的字符串。
            var seen = Object.create(null);
            var features = [];
            rawFiltered.forEach(function(f){
                var props = f.properties || {};
                var nameKey = (props.name || props.NAME || props.adname || props.adcode || '').toString().trim().toLowerCase();
                var geomKey = '';
                try {
                    if (f.geometry && typeof f.geometry.coordinates !== 'undefined') geomKey = JSON.stringify(f.geometry.coordinates);
                } catch (e) { geomKey = ''; }
                var key = nameKey || geomKey;
                if (!key) {
                    try { key = JSON.stringify(f); } catch (e) { key = Math.random().toString(36).slice(2); }
                }
                if (!seen[key]) { seen[key] = true; features.push(f); }
            });

            // 构造仅包含允许且已去重的 features 的新 GeoJSON（以免破坏原始对象）
            var filteredGeo = Object.assign({}, streetsGeoJSON, { features: features });

            if (!features.length) {
                console.warn('未在提供的 GeoJSON 中找到任何允许的街道名称，地图将不会显示区域。');
            }

            echarts.registerMap('SPB_STREETS', filteredGeo);
            var streetData = (filteredGeo.features || []).map(function (f) {
                var name = (f.properties && (f.properties.name || f.properties.NAME || f.properties.adname)) || '未知';
                return { name: name, value: Math.round(Math.random() * 1000) };
            });

            // // 直接使用完整的 GeoJSON（不做过滤）
            // echarts.registerMap('SPB_STREETS', streetsGeoJSON);
            // var streetData = (streetsGeoJSON.features || []).map(function (f) {
            //     var name = (f.properties && (f.properties.name || f.properties.NAME || f.properties.adcode || f.properties.code)) || '未知';
            //     return { name: name, value: Math.round(Math.random() * 1000) };
            // });

            // 在注册到 ECharts 之前对几何做旋转（以几何 bbox 中心为轴，避免旋转文本/label）
            var center = computeGeoJSONBBoxCenter(filteredGeo) || [106.372064, 29.534044];
            // 旋转角度：45度（顺时针为正）
            var yawDeg = -45;
            var pitchDeg = 45;
            var rotatedGeo = rotateGeoJSON(filteredGeo, center, yawDeg, pitchDeg);

            // 将变换参数导出到全局，供路线与车辆的坐标变换复用，保证完全一致的轴测对齐
            try {
                var centerMerc = lonLatToMercator(center[0], center[1]);
                window.__SPB_MAP_TRANSFORM__ = { center: center, centerMerc: centerMerc, yawDeg: yawDeg, pitchDeg: pitchDeg };
            } catch(e){}

            // 先只设置街道系列（避免在多次调用时重复添加图层）；使用旋转后的 geojson
            var baseOption = {
                backgroundColor: 'transparent',
                geo: {
                    map: 'SPB_STREETS',
                    aspectScale: 0.85,
                    layoutCenter: ['50%', '50%'],
                    layoutSize: '108%',
                    // 禁止鼠标事件与 hover 效果，避免高亮遮挡路线
                    silent: true,
                    itemStyle: {
                        normal: {
                            shadowColor: '#276fce',
                            shadowOffsetX: 0,
                            shadowOffsetY: 15,
                            opacity: 0.88
                        },
                        // 取消鼠标悬停时的视觉高亮与 label 显示（保持与 normal 一致）
                        emphasis: {
                            areaColor: 'rgba(4, 34, 80, 1)',
                            label: { show: false }
                        }
                    },
                },
                series: [
                    {
                        name: '街道',
                        type: 'map',
                        mapType: 'SPB_STREETS',
                        aspectScale: 0.85,
                        layoutCenter: ["50%", "50%"], //地图位置
                        layoutSize: '108%',
                        zoom: 1, //当前视角的缩放比例
                        // roam: true, //是否开启平游或缩放
                        scaleLimit: { //滚轮缩放的极限控制
                            min: 1,
                            max: 2
                        },
                        // 禁止鼠标事件与 hover 高亮，降低 zlevel 以让路线/车辆始终绘制在上方
                        silent: true,
                        itemStyle: {
                            normal: {
                                areaColor: 'rgba(4, 34, 80, 1)',
                                borderColor: 'rgba(80,160,255,0.75)',
                                borderWidth: 1.2,
                            },
                            emphasis: {
                                areaColor: 'rgba(4, 34, 80, 1)',
                                label: { show: false }
                            }
                        },
                        // 不在街道图层显示 tooltip
                        tooltip: { show: false },
                    },
                ]
            };

            // 注册旋转后的地图并设置基础街道图层
            echarts.registerMap('SPB_STREETS', rotatedGeo);
            chartInstance.setOption(baseOption);

            // 旧方案（DOM 旋转）已替换为几何旋转；保留作为视觉备选（注释）
            console.log('已注册街道图层，街道数量：', streetData.length);
            return true;
        } catch (e) {
            console.error('注册街道数据失败', e);
            return false;
        }
    }

    function initEchartsMap(){
        if (typeof echarts === 'undefined') return;
        var el = document.getElementById('mapContainerEcharts');
        if (!el) return;
        // wrapper used for 3d transform and float
        var wrap = el.closest('.map-3d-wrap') || null;
        var myChart = echarts.init(el);
        var baseOption = {
            backgroundColor: 'transparent',
            // tooltip: { trigger: 'item', formatter: function (params) { return params.name + '<br/>值：' + (params.value == null ? '-' : params.value); } },
            // visualMap intentionally removed to hide the value legend / color bar in the corner
            series: []
        };
        myChart.setOption(baseOption);

        // 尝试使用全局变量或本地文件
        if (window.streetsGeoJSON) {
            registerStreetsIfAvailableEcharts(window.streetsGeoJSON, myChart);
        } else if (window.streets && typeof streets === 'object') {
            registerStreetsIfAvailableEcharts(window.streets, myChart);
        } else if (window.__SPB_STREETS__ && typeof window.__SPB_STREETS__ === 'object') {
            registerStreetsIfAvailableEcharts(window.__SPB_STREETS__, myChart);
        } else {
            // 尝试用内置合并文件（如果项目提供了 js/500106_500107_streets.js 并将其暴露为 streetsGeoJSON）
            if (window.streetsGeoJSON) {
                registerStreetsIfAvailableEcharts(window.streetsGeoJSON, myChart);
            } else {
                // 也可能项目引入了 js/500106_500107_streets.js，该文件在 car-screen.html 已被引入，尝试 registry
                try {
                    // fetch fallback JSON (will fail on file:// in some browsers), kept for server usage
                    fetch('geojson/gson/500106_500107_streets.json').then(function(r){ if (!r.ok) throw new Error('no'); return r.json(); }).then(function(json){ registerStreetsIfAvailableEcharts(json, myChart); }).catch(function(){
                        // 最后尝试查找 any global that looks like GeoJSON
                        var candidate = window.streetsGeoJSON || window.SPB_STREETS || window.__SPB_STREETS__ || null;
                        if (candidate) registerStreetsIfAvailableEcharts(candidate, myChart);
                        else {
                            console.warn('街道 GeoJSON 未找到，若需离线查看请把合并的 GeoJSON 包为 JS 变量并在页面前引入，或使用本地静态服务器。');
                            var tip = document.createElement('div');
                            tip.style.position = 'absolute';
                            tip.style.left = '10px';
                            tip.style.bottom = '10px';
                            tip.style.padding = '8px 10px';
                            tip.style.background = 'rgba(0,0,0,0.5)';
                            tip.style.color = '#fff';
                            tip.style.fontSize = '12px';
                            tip.style.zIndex = 200;
                            tip.innerText = '街道数据未加载：若需离线直接打开，请把合并的 GeoJSON 包裹为 JS 变量并引入，或用本地服务器打开页面。';
                            el.appendChild(tip);
                        }
                    });
                } catch (e) {
                    console.warn('尝试加载街道数据失败', e);
                }
            }
        }

        // resize on window resize
        window.addEventListener('resize', function(){ try{ myChart.resize(); }catch(e){} });

        // 启动微浮动动画（如果存在 wrapper）
        try {
            if (wrap) {
                // 延迟一点再启用动画，避免页面 load 时抖动
                setTimeout(function(){ wrap.classList.add('map-float'); }, 200);
            }
        } catch(e){}
        
        // 启动车辆与线路的 ECharts 层（绘制并每秒更新位置）
        try {
            startEchartsVehicleLayer(myChart);
        } catch(e) {
            console.warn('启动 ECharts 车辆层失败', e);
        }
    }

    // 构建路线 series（优先使用 getPlannedRoute）
    function buildRouteSeries(){
        var planned = getPlannedRoute();
        if (!planned || !Array.isArray(planned.waypoints) || planned.waypoints.length < 2) return [];
        var coords = (planned.waypoints||[]).map(function(p){ return [ +p.lng, +p.lat ]; });
        // apply same yaw/pitch transform used for streets so lines 对齐轴测地图
        try {
            var tp = getMapTransformParams();
            var centerMerc = tp.centerMerc;
            var yaw = tp.yawRad; var pitch = tp.pitchRad; var vd = tp.viewerDist;
            // 使用 transformCoordsRecursive 对单点数组进行批量变换，保持与 rotateGeoJSON 一致
            coords = coords.map(function(ll){
                try {
                    var transformed = transformCoordsRecursive([ll], centerMerc, yaw, pitch, vd);
                    return transformed && transformed[0] ? [ +transformed[0][0], +transformed[0][1] ] : ll;
                } catch(e){ return ll; }
            });
        } catch(e){ /* ignore and use raw coords */ }
        return [{
            name: 'routes',
            id: 'routes',
            type: 'lines',
            coordinateSystem: 'geo',
            polyline: true,
            silent: false,
            effect: { show: true, period: 6, trailLength: 0.2, symbol: 'arrow', symbolSize: 6, color: '#00F8FF' },
            lineStyle: { color: '#6B48FF', width: 3, opacity: 0.9, curveness: 0.1 },
            data: [ { coords: coords, routeId: planned.id || 'R001' } ]
        }];
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
                    list.push({ name: v.id || (v.vehicleId||'veh'), value: [ +out[0], +out[1], +(v.speed||0) ], raw: v });
                } catch(e){
                    list.push({ name: v.id || (v.vehicleId||'veh'), value: [ +v.lng, +v.lat, +(v.speed||0) ], raw: v });
                }
            });
        } catch(e){}
        return [{
            name: 'vehicles',
            id: 'vehicles',
            type: 'scatter',
            coordinateSystem: 'geo',
            z: 999,
            symbol: 'circle',
            symbolSize: 12,
            label: { show: true, formatter: '{b}', color: '#ffffff', position: 'right' },
            itemStyle: { color: '#ff6b6b' },
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

    // 启动车辆/线路 layer 并每秒更新（优先使用全局 vehiclesData，否则沿 plannedRoute 模拟）
    function startEchartsVehicleLayer(chartInstance){
        if (!chartInstance) return;
        var planned = getPlannedRoute();
        var routeCoords = (planned && Array.isArray(planned.waypoints)) ? planned.waypoints.map(function(p){ return [ +p.lng, +p.lat ]; }) : null;

        // 初始绘制
        var vehicleMap = getVehiclesMap() || {};
        var routeSeries = buildRouteSeries();
        var vehicleSeries = buildVehicleSeries(vehicleMap);
        // set initial series: 保持 geo/map 已注册，向图上添加 lines + scatter
        // 不要覆盖已有 series（例如街道 map），而是 append 或更新特定 id 的 series
        // 若已有 series，使用 replaceMerge 更新相应 id，否则追加
        // 将新 series 追加到已有 series（不替换已有的街道 map series）
        chartInstance.setOption({ series: [].concat(routeSeries, vehicleSeries) });

        // 每秒更新一次位置
        var tick = function(){
            try {
                var vm = getVehiclesMap() || {};
                var vehData = [];
                var vals = Object.values(vm || {});
                // 获取地图变换参数（centerMerc, yawRad, pitchRad）并将原始 routeCoords 转换为绘制坐标
                var tp = getMapTransformParams();
                var cMerc = tp.centerMerc; var yaw = tp.yawRad; var pitch = tp.pitchRad; var vd = tp.viewerDist;
                var transformedRouteCoords = null;
                if (routeCoords) {
                    try {
                        // transformCoordsRecursive supports nested arrays, so pass each point as [lon,lat]
                        transformedRouteCoords = routeCoords.map(function(ll){
                            try {
                                var transformed = transformCoordsRecursive([ll], cMerc, yaw, pitch, vd);
                                return transformed && transformed[0] ? [ +transformed[0][0], +transformed[0][1] ] : ll;
                            } catch(e){ return ll; }
                        });
                    } catch(e){ transformedRouteCoords = routeCoords; }
                }

                if (vals.length === 0 && routeCoords) {
                    // 没有真实车辆数据：生成一些模拟车辆（最多 6 个），仿真点也要转换
                    for (var i=0;i<6;i++){
                        var vid = 'SIM-' + (i+1);
                        ensureSimForVehicle(vid, routeCoords);
                        var pRaw = stepSimulateAlongRoute(routeCoords, _simState[vid], 0.04 + Math.random()*0.02);
                        var plotted = pRaw;
                        try {
                            var m2 = lonLatToMercator(pRaw[0], pRaw[1]);
                            var t2 = transformPointYawPitch(cMerc, m2, yaw, pitch, vd);
                            var out2 = mercatorToLonLat(t2[0], t2[1]);
                            plotted = [ +out2[0], +out2[1] ];
                        } catch(e){}
                        vehData.push({ name: vid, value: [plotted[0], plotted[1], Math.round(20 + Math.random()*40)] });
                    }
                } else {
                    // 有车辆数据：优先使用经纬；若某车辆缺失坐标且有 routeCoords，则沿 route 模拟
                    vals.forEach(function(v){
                        var id = v.id || v.vehicleId || ('veh_' + Math.random().toString(36).slice(2,6));
                        if (isFinite(+v.lng) && isFinite(+v.lat)) {
                            var plotted = [ +v.lng, +v.lat ];
                            try {
                                var transformed = transformCoordsRecursive([[+v.lng, +v.lat]], cMerc, yaw, pitch, vd);
                                if (transformed && transformed[0]) plotted = [ +transformed[0][0], +transformed[0][1] ];
                            } catch(e){}
                            vehData.push({ name: id, value: [ plotted[0], plotted[1], +(v.speed||0) ] });
                        } else if (routeCoords) {
                            ensureSimForVehicle(id, routeCoords);
                            var pRaw2 = stepSimulateAlongRoute(routeCoords, _simState[id], 0.02 + Math.random()*0.02);
                            var plotted2 = pRaw2;
                            try {
                                var transformed2 = transformCoordsRecursive([pRaw2], cMerc, yaw, pitch, vd);
                                if (transformed2 && transformed2[0]) plotted2 = [ +transformed2[0][0], +transformed2[0][1] ];
                            } catch(e){}
                            vehData.push({ name: id, value: [ plotted2[0], plotted2[1], +(v.speed||0) ] });
                        }
                    });
                }

                // apply update: update by id/name to avoid 替换掉已有的街道 series
                chartInstance.setOption({ series: [
                    { id: 'routes', name: 'routes', data: (transformedRouteCoords ? [ { coords: transformedRouteCoords } ] : (routeCoords ? [ { coords: routeCoords } ] : [])) },
                    { id: 'vehicles', name: 'vehicles', data: vehData }
                ] });
            } catch(e){ console.warn('更新车辆数据失败', e); }
        };
        // 立刻跑一次再启动定时
        tick();
        var timer = setInterval(tick, 1000);
        // 清理：当页面卸载时取消定时器
        try { window.addEventListener('beforeunload', function(){ clearInterval(timer); }); } catch(e){}
    }

    // 在 DOMContentLoaded 时也初始化 ECharts 地图
    try { if (document.readyState === 'complete' || document.readyState === 'interactive') { setTimeout(initEchartsMap, 50); } else { window.addEventListener('DOMContentLoaded', initEchartsMap); } } catch(e){}
})();


