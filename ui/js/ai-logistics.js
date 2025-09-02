// ai-logistics 页面交互脚本（骨架）
(function(){
    function init(){
        // 绑定 resize
        window.addEventListener('resize', onResize);
        // 初始化右侧面板图表与列表
        initRightPanel();
        // 占位：未来用于初始化地图/三维视图/echarts 等
        const mapEl = document.getElementById('aiMap');
        if (mapEl){
            // 点击示例
            mapEl.addEventListener('click', ()=>{
                mapEl.classList.add('clicked');
                setTimeout(()=> mapEl.classList.remove('clicked'), 500);
            });
        }
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

    function onResize(){
        // resize charts/maps
        try { if (window._aiCharts) Object.values(window._aiCharts).forEach(c=>c&&c.resize&&c.resize()); } catch(e){}
    }

    // --------------------- 右侧面板实现 ---------------------
    function initRightPanel(){
        // ensure echarts present
        const ensureECharts = () => {
            if (window.echarts) return Promise.resolve(window.echarts);
            // try to load from local file if available
            return new Promise((resolve)=>{
                const s = document.createElement('script');
                s.src = 'js/echarts.min.js';
                s.onload = ()=> resolve(window.echarts);
                s.onerror = ()=> resolve(null);
                document.head.appendChild(s);
            });
        };

        ensureECharts().then(e => {
            if (!e) return;
            const charts = {};
            window._aiCharts = charts;

        // 合并后的订单配送统计图（柱状 + 折线）
        charts.orderDelivery = echarts.init(document.getElementById('chartOrderDelivery'));
        charts.util = echarts.init(document.getElementById('chartUtil'));
        charts.eff = echarts.init(document.getElementById('chartEff'));
        charts.perf = echarts.init(document.getElementById('chartPerf'));

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

            // 填充列表：使用 data.js 中的 packages / plannedRoute
            try{ fillLists(); } catch(e){ console.warn('fillLists failed', e) }

            // resize on window
            window.addEventListener('resize', ()=>{ try{ Object.values(charts).forEach(c=>c&&c.resize&&c.resize()) }catch(e){} });
        });
    }

    function fillLists(){
        const statusUl = document.getElementById('orderStatusList');
        const routeUl = document.getElementById('routeList');

        // render order status list if present
        if (statusUl){
            statusUl.innerHTML = '';
            const items = (typeof packages !== 'undefined') ? packages.slice(0,6) : [ { id:'PKG-CQ-001', status:'配送中' }, { id:'PKG-CQ-002', status:'待取件' }, { id:'PKG-CQ-003', status:'已签收' }, { id:'PKG-CQ-004', status:'异常' } ];
            items.forEach(it=>{
                const li = document.createElement('li');
                const st = it.status || '配送中';
                const badgeCls = st.replace(/\s+/g,'');
                const vehicleLabel = it.assignedVehicle ? `<span class="mono" style="margin-left:8px;color:#cfeff5">${it.assignedVehicle}</span>` : '';
                li.innerHTML = `<span style="display:flex;align-items:center;gap:8px"><span class="badge ${badgeCls}">${st}</span><span class="mono">${it.id}</span>${vehicleLabel}</span>`;
                statusUl.appendChild(li);
            });
        }

        // render route list if present
        if (routeUl){
            routeUl.innerHTML = '';
            const routes = [];
            if (typeof plannedRoute !== 'undefined' && plannedRoute && Array.isArray(plannedRoute.waypoints)){
                routes.push(Object.assign({}, plannedRoute, { id: 'R001', description: plannedRoute.description || '测试线路 (来自 data.js)'}));
            }
            routes.push({ id:'R002', description:'城区环线配送' }, { id:'R003', description:'大学城夜班专线' });

            // compute in-transit counts by vehicle for R001 (if packages available)
            const pkgByVehicle = {};
            try{
                const list = (typeof packages !== 'undefined') ? packages : (window && window.packages) || [];
                list.forEach(p=>{ if (p.assignedVehicle) pkgByVehicle[p.assignedVehicle] = (pkgByVehicle[p.assignedVehicle]||0)+1; });
            }catch(e){ }

            routes.forEach(r=>{
                const li = document.createElement('li');
                li.dataset.routeId = r.id;
                let inTransitCount = 0;
                try{
                    if (r.id === 'R001'){
                        // number of unique assigned vehicles in packages
                        const s = new Set();
                        const list = (typeof packages !== 'undefined') ? packages : (window && window.packages) || [];
                        list.forEach(p=>{ if (p.assignedVehicle) s.add(p.assignedVehicle); });
                        inTransitCount = s.size;
                    } else {
                        // fallback: sum of package counts as a proxy
                        inTransitCount = Object.keys(pkgByVehicle).length;
                    }
                }catch(e){ inTransitCount = 0; }

                li.innerHTML = `<div class="route-item" style="display:flex;align-items:center;width:100%"><span class="mono">${r.id}</span><span style="flex:1;margin-left:8px;color:#ffffff">${r.description || '规划路线'}</span><span style="margin-left:8px;color:#cfeff5">在途车辆: <b style=\"color:#00F8FF\">${inTransitCount}</b></span></div>`;
                li.addEventListener('click', (ev)=>{ ev.stopPropagation(); document.querySelectorAll('#routeList li').forEach(x=>x.classList.remove('selected')); li.classList.add('selected'); });
                routeUl.appendChild(li);
            });
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
