// 使用 ECharts 构造柱状/折线图，保留刷新与导出功能
/*
    全新的统计图表脚本
    - 按新需求呈现 7 个图表（订单、车辆、客户相关指标）
    - 柱状图在每个柱形上直接显示数值标签
    - 保持导出 / 刷新功能
    - 所有注释为中文，便于维护
*/
(function() {
    // 示例时间轴（可拓展为后端返回的真实时间序列）
    const sampleDates = ['08-18','08-19','08-20','08-21','08-22','08-23','08-24'];

    // 示例数据（按上述顺序与图表对应），真实数据应由后端提供
    const data = {
        orderCount: [120, 98, 130, 150, 110, 140, 160],            // 订单数量
        orderAmount: [3200, 2800, 4100, 5000, 3600, 4200, 4800],    // 订单金额（元）
        vehicleUtil: [72, 68, 75, 80, 70, 78, 82],                  // 车辆利用率（%）
        deliveryEff: [32, 28, 35, 30, 40, 26, 25],                  // 平均配送时长（分钟）
        efficiencyCompare: {                                         // 效能对比：示例按车型两类
            dates: sampleDates,
            series: {
                smallVan: [40,45,38,50,42,48,55],
                largeVan: [55,60,52,68,54,62,70]
            }
        },
        ratings: { good: [80,75,82,88,78,85,90], mid: [15,18,12,9,16,12,8], bad: [5,7,6,3,6,3,2] },
        complaints: [5,3,8,2,6,4,7]                                  // 投诉数量（按日或按类）
    };

    const charts = {};

    // 基本柱状图模板（包含在柱上显示数值的 label）
    function barOption(title, color, unit) {
        return {
            title: { text: title, left: 12, textStyle: { color: '#1a56db', fontWeight: 600, fontSize: 14 } },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: params => {
                // 自定义 tooltip，展示单位
                const p = params[0];
                return `${p.axisValue}<br/>${p.seriesName}: ${p.data}${unit || ''}`;
            }},
            grid: { left: 12, right: 12, top: 48, bottom: 28, containLabel: true },
            xAxis: { type: 'category', data: sampleDates, axisLine: { lineStyle: { color: '#e6e8ec' } }, axisLabel: { color: '#374151' }, axisTick: { show: false } },
            yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: 'rgba(200,210,220,0.12)' } }, axisLabel: { color: '#6b7280' } },
            series: [{
                name: title,
                type: 'bar',
                data: [],
                itemStyle: { color: color, borderRadius: [6,6,0,0] },
                barWidth: '56%',
                label: { show: true, position: 'top', color: '#0f172a', fontWeight:600, formatter: v => `${v.data}${unit||''}` }
            }]
        };
    }

    // 折线图模板（用于对比类指标）
    function lineOption(title) {
        return {
            title: { text: title, left: 12, textStyle: { color: '#1a56db', fontWeight: 600, fontSize: 14 } },
            tooltip: { trigger: 'axis' },
            legend: { top: 32, left: 'right', textStyle: { color: '#374151' } },
            grid: { left: 12, right: 12, top: 64, bottom: 28, containLabel: true },
            xAxis: { type: 'category', data: sampleDates, axisLine: { lineStyle: { color: '#e6e8ec' } }, axisLabel: { color: '#374151' } },
            yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: 'rgba(200,210,220,0.12)' } }, axisLabel: { color: '#6b7280' } },
            series: []
        };
    }

    // 初始化并渲染所有图表
    function renderAll() {
        // 销毁旧实例
        Object.values(charts).forEach(c => c && c.dispose && c.dispose());

        // 初始化
        charts.orderCount = echarts.init(document.getElementById('chartOrderCount'));
        charts.orderAmount = echarts.init(document.getElementById('chartOrderAmount'));
        charts.vehicleUtil = echarts.init(document.getElementById('chartVehicleUtil'));
        charts.deliveryEff = echarts.init(document.getElementById('chartDeliveryEff'));
        charts.effCompare = echarts.init(document.getElementById('chartEfficiencyCompare'));
        charts.ratings = echarts.init(document.getElementById('chartRatings'));
        charts.complaints = echarts.init(document.getElementById('chartComplaints'));

        // 图 1：订单数量（柱状，顶部显示数值）
        const optOrderCount = barOption('订单数量统计', '#1a56db', '');
        optOrderCount.series[0].data = data.orderCount;
        charts.orderCount.setOption(optOrderCount, true);
        document.getElementById('metaOrderCount').innerText = '总数: ' + data.orderCount.reduce((a,b)=>a+b,0);

        // 图 2：订单金额（柱状，显示单位元）
        const optOrderAmount = barOption('订单金额统计', '#22c55e', ' 元');
        optOrderAmount.series[0].data = data.orderAmount.map(v => Math.round(v));
        charts.orderAmount.setOption(optOrderAmount, true);
        document.getElementById('metaOrderAmount').innerText = '总额: ' + data.orderAmount.reduce((a,b)=>a+b,0).toFixed(0) + ' 元';

        // 图 3：车辆利用率（柱状 + 百分比标签）
        const optVehicleUtil = barOption('车辆利用率', '#f59e42', '%');
        optVehicleUtil.series[0].data = data.vehicleUtil;
        // 把 y 轴限制到 0-100
        optVehicleUtil.yAxis = { type:'value', min: 0, max: 100, axisLine:{show:false}, axisLabel:{color:'#6b7280', formatter: '{value} %'}, splitLine:{lineStyle:{color:'rgba(200,210,220,0.06)'}} };
        charts.vehicleUtil.setOption(optVehicleUtil, true);

        // 图 4：配送效率（折线或柱状都可，这里用柱状来显示每日报时长并显示数值）
        const optDelivery = barOption('平均配送时长(分钟)', '#6b7280', ' 分');
        optDelivery.series[0].data = data.deliveryEff;
        charts.deliveryEff.setOption(optDelivery, true);

        // 图 5：效能对比（多折线）
        const optEffCompare = lineOption('效能对比（车型）');
        optEffCompare.legend = { top: 32, left: 'center', textStyle: { color: '#374151' } };
        optEffCompare.series = [
            { name: '小型车', type: 'line', smooth: true, data: data.efficiencyCompare.series.smallVan, itemStyle: { color:'#1a56db' } },
            { name: '大型车', type: 'line', smooth: true, data: data.efficiencyCompare.series.largeVan, itemStyle: { color:'#f97316' } }
        ];
        charts.effCompare.setOption(optEffCompare, true);

        // 图 6：评价统计（堆叠柱状图，显示好评/中评/差评数）
        const optRatings = {
            title: { text: '评价统计', left: 12, textStyle: { color: '#1a56db', fontWeight:600, fontSize:14 } },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: { top: 32, left: 'right', data: ['好评','中评','差评'] },
            grid: { left: 12, right: 12, top: 64, bottom: 28, containLabel: true },
            xAxis: { type: 'category', data: sampleDates, axisLine: { lineStyle: { color: '#e6e8ec' } }, axisLabel: { color: '#374151' } },
            yAxis: { type: 'value', axisLine: { show:false }, splitLine:{ lineStyle: { color:'rgba(200,210,220,0.12)' } }, axisLabel: { color: '#6b7280' } },
            series: [
                { name: '好评', type: 'bar', stack: 'total', data: data.ratings.good, itemStyle:{color:'#22c55e'}, label:{show:true, position:'insideTop', formatter: '{c}'} },
                { name: '中评', type: 'bar', stack: 'total', data: data.ratings.mid, itemStyle:{color:'#f59e42'}, label:{show:true, position:'insideTop', formatter: '{c}'} },
                { name: '差评', type: 'bar', stack: 'total', data: data.ratings.bad, itemStyle:{color:'#ef4444'}, label:{show:true, position:'insideTop', formatter: '{c}'} }
            ]
        };
        charts.ratings.setOption(optRatings, true);

        // 图 7：投诉统计（按类型或按日），使用柱状显示数值
        const optComplaints = barOption('投诉统计（按日）', '#ef4444', ' 件');
        optComplaints.series[0].data = data.complaints;
        charts.complaints.setOption(optComplaints, true);

        // 触发一次 resize
        setTimeout(()=>{ Object.values(charts).forEach(c=>c && c.resize && c.resize()); }, 60);
    }

    // 导出全部图表为 PNG
    function exportAllCharts() {
        Object.keys(charts).forEach((key) => {
            const chart = charts[key];
            if (!chart) return;
            const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
            downloadURI(url, `chart-${key}.png`);
        });
    }
    function downloadURI(uri, name) {
        const a = document.createElement('a');
        a.href = uri;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // 单次绑定 resize
    if (!window.__echarts_resize_bound) {
        window.addEventListener('resize', () => { Object.values(charts).forEach(c=>c && c.resize && c.resize()); });
        window.__echarts_resize_bound = true;
    }

    // 页面加载后渲染
    window.addEventListener('DOMContentLoaded', () => {
        renderAll();
        document.getElementById('refreshBtn').addEventListener('click', () => {
            // 简单的刷新效果：数组逆序，模拟新的数据变化
            data.orderCount.reverse(); data.orderAmount.reverse(); data.vehicleUtil.reverse(); data.deliveryEff.reverse(); data.complaints.reverse();
            data.efficiencyCompare.series.smallVan.reverse(); data.efficiencyCompare.series.largeVan.reverse();
            data.ratings.good.reverse(); data.ratings.mid.reverse(); data.ratings.bad.reverse();
            renderAll();
        });
        document.getElementById('exportAllBtn').addEventListener('click', exportAllCharts);
    });

})();

// 目录展开/收起（保留原函数）
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
