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
    }

    function clearHighlight(){
        highlightedRouteId = null;
        // restore style to default electric purple
        Object.keys(routePolylines).forEach(id=> routePolylines[id].setOptions({ strokeColor: '#6B48FF', strokeWeight:4 }));
        updateRouteListSelection();
    }

    function updateRouteListSelection(){
        const lis = document.querySelectorAll('#routeList li');
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
            grid: { left: 6, right: 6, top: 8, bottom: 4, containLabel: true },
            xAxis: { type: 'category', data: ['一','二','三','四','五','六','日'], axisTick:{show:false}, axisLine:{lineStyle:{color:'#e6e8ec'}}, axisLabel:{color:'#64748b'} },
            yAxis: { type: 'value', axisLine:{show:false}, splitLine:{ lineStyle:{ color:'rgba(200,210,220,0.12)' } }, axisLabel:{ color:'#94a3b8' } },
            series: [{ type:'bar', data: [12,18,9,20,16,22,15], barWidth:'56%', itemStyle:{ color, borderRadius:[6,6,0,0] }, label:{ show:true, position:'top', color:'#111827', fontWeight:600, formatter:v=>`${v.data}${unit||''}` } }]
        };
    }

    // 小型图表基础风格（白色文案、隐藏 y 轴刻度、简约网格）
    function smallChartBase(){
        return {
            grid:{ left:6, right:6, top:10, bottom:6, containLabel:true },
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
        charts.today = echarts.init(document.getElementById('chartTodayRadar'));

        (function(){
            const days = ['一','二','三','四','五','六','日'];
            // 样例数据：车次、订单数量、配送重量(kg)
            const tripCounts = [12, 18, 9, 20, 16, 22, 15];
            const orderCounts = [120, 98, 130, 150, 110, 140, 160];
            const weightKg = [320, 280, 410, 500, 360, 420, 480]; // 折线展示（单位：kg）

            const opt = {
                grid:{ left: 8, right: 8, top: 28, bottom: 6, containLabel:true },
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
                    { name:'车次', type:'bar', data: tripCounts, barWidth:'28%', itemStyle:{ color:'#66b1ff', borderRadius:[6,6,0,0] }, yAxisIndex:0 },
                    { name:'订单数量', type:'bar', data: orderCounts, barWidth:'28%', itemStyle:{ color:'#ffb86b', borderRadius:[6,6,0,0] }, yAxisIndex:0 },
                    { name:'配送重量', type:'line', smooth:true, data: weightKg, yAxisIndex:1, itemStyle:{ color:'#9ef27e' }, lineStyle:{ width:2 }, symbol:'circle', symbolSize:6 }
                ]
            };
            charts.orderDelivery.setOption(opt);
        })();

        // 车辆安全统计：事件数量（直方） + 误报率（折线） + 事件成功解决占比（折线）
        const effOpt = Object.assign({}, smallChartBase(), {
            xAxis: { type: 'category', data: ['一','二','三','四','五','六','日'], axisLabel: { color: '#ffffff' } },
            tooltip: { trigger: 'axis' },
            legend: false,
            series: [
                { name: '事件数量', type: 'bar', data: [10,8,6,8,12,4,2], barWidth: '36%', itemStyle: { color: '#6b7280', borderRadius: [6,6,0,0] } },
                { name: '已解决', type: 'bar',  data: [8,8,5,8,11,4,2], barWidth: '36%', itemStyle: { color: '#7ee787' , borderRadius: [6,6,0,0] } },
                { name: '误报率', type: 'line', smooth: true, data: [5,4,6,3,7,2,4], itemStyle: { color: '#ff6b6b' }, lineStyle: { width: 2 } },
            ]
        });
        charts.eff.setOption(effOpt);

        // 车辆效能统计：车辆耗电（直方） + 里程利用率（折线） + 平均耗时（折线）
        const perfBase = Object.assign({}, smallChartBase(), {
            tooltip: { trigger: 'axis' },
            legend: false,
            xAxis: { type: 'category', data: ['一','二','三','四','五','六','日'], axisLabel: { color: '#ffffff' } },
            series: [
                { name: '车辆耗电', type: 'bar', data: [40,45,38,50,42,48,55], barWidth: '36%', itemStyle: { color: '#1a56db', borderRadius: [6,6,0,0] } },
                { name: '里程利用率', type: 'line', smooth: true, data: [55,60,52,68,54,62,70], itemStyle: { color: '#f97316' }, lineStyle: { width: 2 } },
                { name: '平均耗时', type: 'line', smooth: true, data: [12,14,11,13,10,15,12], itemStyle: { color: '#9ef27e' }, lineStyle: { width: 2 } }
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

        // 优化后的雷达图（更清晰的网格、冷色渐变填充、文本样式）
        const radarOption = {
            tooltip: { show: true, trigger: 'item' },
            radar: {
                center: ['50%', '60%'],
                radius: '70%',
                startAngle: 90,
                splitNumber: 4,
                shape: 'circle',
                name: {
                    textStyle: { color: '#DFF6FB', fontSize: 12 }
                },
                nameGap: 18,
                axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 1)' } },
                splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 1)' } },
                splitArea: { areaStyle: { color: ['transparent','rgba(0,248,255,0.04)','transparent','rgba(0,248,255,0.02)'] } },
                indicator: [
                    { name: '已完成' },
                    { name: '未完成' },
                    { name: '异常' }
                ]
            },
            series: (function(){
                // 主区域数据
                const mainValues = [78,60,12];
                const mainSeries = {
                    type: 'radar',
                    symbol: 'none',
                    symbolSize: 0,
                    showSymbol: false,
                    data: [{
                        value: mainValues,
                        name: '今日订单',
                        lineStyle: { color: '#ecc03e', width: 2 },
                        // itemStyle: { color: '#00F8FF' },
                        areaStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: 'rgba(203, 158, 24, 0.8)' },
                                { offset: 1, color: 'rgba(190, 96, 20, 0.8)' }
                            ], false)
                        }
                    }],
                    emphasis: { lineStyle: { width: 3 } }
                };

                // 计算当前数据的最大值，作为外圈参考（避免固定常量）
                const mainValuesArr = mainValues.slice();
                const maxVal = Math.max.apply(null, mainValuesArr.map(v=> isFinite(v)?v:0 ));

                // 外圈边界（用 maxVal 连接每个指标的最外点）
                const outerArr = new Array(3).fill(maxVal);
                const outerBoundary = {
                    type: 'radar',
                    data: [{ value: outerArr }],
                    areaStyle: { color: 'transparent' },
                    itemStyle: { color: 'transparent' },
                    silent: true,
                    z: 1
                };

                // 在每个指标最外侧绘制一个点（颜色顺序：绿 / 白 / 红）
                const markerColors = ['#22c55e', '#DFF6FB', '#ef4444'];
                const markerSeries = [];
                for (let i=0;i<3;i++){
                    const arr = new Array(3).fill(null);
                    // 把非目标点设为 null，避免在中心绘制点
                    arr[i] = maxVal;
                    markerSeries.push({
                        type: 'radar',
                        data: [{ value: arr }],
                        symbol: 'circle',
                        symbolSize: 10,
                        lineStyle: { color: 'transparent' },
                        itemStyle: { color: markerColors[i] },
                        silent: true,
                        z: 3
                    });
                }
                return [mainSeries, outerBoundary].concat(markerSeries);
            })()
        };
        charts.today.setOption(radarOption);
    }

    function fillLists(){
        const statusUl = document.getElementById('orderStatusList');
        const routeUl = document.getElementById('routeList');
        statusUl.innerHTML = '';
        routeUl.innerHTML = '';
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
            statusUl.appendChild(li);
        });

        // 组装路线列表：优先展示来自 data.js 的测试线路（如果存在），并绑定锁定交互
        const routes = [];
        const _planned = getPlannedRoute();
        if (_planned && Array.isArray(_planned.waypoints)) {
            const tr = Object.assign({}, _planned, { id: 'R001', description: _planned.description || '测试线路（由 data.js 提供）' });
            routes.push(tr);
        }
        routes.push({ id:'R002', description:'城区环线配送' }, { id:'R003', description:'大学城夜间专线' });

        // 计算每条路线的在途车辆数（通过 packages.assignedVehicle 与 planned route id 之间的简单匹配）
        // 这里我们采用的匹配策略：如果 package.assignedVehicle 存在并且车辆当前经纬在路线 polyline 的 bbox 内则视为在途。为简单起见，先按 assignedVehicle 计数（如需精确定位可扩展）。
        const pkgByVehicle = computePackageCountsByVehicle();
        routes.forEach(r=>{
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
            li.innerHTML = `<div class="route-item" style="display:flex;align-items:center;width:100%"><span class="mono">${r.id}</span><span style="flex:1;margin-left:8px;color:#ffffff">${r.description || '规划路线'}</span><span style="margin-left:8px;color:#cfeff5">在途车辆: <b style=\"color:#00F8FF\">${inTransitCount}</b></span></div>`;
            routeUl.appendChild(li);
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
})();


