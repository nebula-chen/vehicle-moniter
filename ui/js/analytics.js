// 使用 ECharts 构造柱状/折线图，保留刷新与导出功能
(function() {
    const sampleDates = ['08-18','08-19','08-20','08-21','08-22'];

    let tripsData = [6,8,4,9,16];
    let weightData = [17.2,8.5,16.1,8.2,23.8]; // kg
    let energyData = [2.1,2.66,1.39,3.35,4.71]; // kWh
    let ratioData = [100,100,100,100,99];

    let charts = {};

    function baseOption(title, color) {
        return {
            title: { text: title, left: 'center', textStyle: { color: '#1a56db', fontWeight: 600, fontSize: 14 } },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: 12, right: 12, top: 48, bottom: 12, containLabel: true },
            xAxis: {
                type: 'category',
                data: [],
                axisLine: { lineStyle: { color: '#e6e8ec' } },
                axisLabel: { color: '#374151' },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                axisLine: { show: false },
                splitLine: { lineStyle: { color: 'rgba(200,210,220,0.15)' } },
                axisLabel: { color: '#6b7280' }
            },
            series: [{
                type: 'bar',
                data: [],
                itemStyle: {
                    color: color,
                    borderRadius: [6,6,0,0]
                },
                barWidth: '48%'
            }]
        };
    }

    function renderAll(dates, trips, weight, energy, ratio) {
        // 销毁已有实例（防止重复初始化）
        Object.values(charts).forEach(c => c && c.dispose && c.dispose());
        charts = {};

        // 初始化容器
        charts.trips = echarts.init(document.getElementById('chartTrips'));
        charts.weight = echarts.init(document.getElementById('chartWeight'));
        charts.energy = echarts.init(document.getElementById('chartEnergy'));
        charts.ratio = echarts.init(document.getElementById('chartRatio'));

        // 构造 option（前三项用柱状，后两项改为折线）
        const optTrips = baseOption('飞行架次统计', '#22c55e');
        optTrips.xAxis.data = dates;
        optTrips.series[0].data = trips;

        const optWeight = baseOption('运输货量统计', '#1a56db');
        optWeight.xAxis.data = dates;
        optWeight.series[0].data = weight;

        // 第三张：折线
        const optEnergy = baseOption('飞行耗电统计', '#f59e42');
        optEnergy.xAxis.data = dates;
        optEnergy.series[0].data = energy;
        optEnergy.series[0].type = 'line';
        optEnergy.series[0].smooth = true;
        optEnergy.series[0].symbol = 'circle';
        optEnergy.series[0].lineStyle = { width: 2 };
        optEnergy.series[0].areaStyle = { opacity: 0.06 };

        // 第四张：准点率（改回折线图，平滑显示并带轻微面积）
        const optRatio = baseOption('准点率', '#6b7280');
        optRatio.xAxis.data = dates;
        optRatio.series[0].data = ratio;
        optRatio.series[0].type = 'line';
        optRatio.series[0].smooth = true;
        optRatio.series[0].symbol = 'circle';
        optRatio.series[0].lineStyle = { width: 2, color: '#6b7280' };
        optRatio.series[0].areaStyle = { opacity: 0.04, color: '#6b7280' };

        // 使纵向占满空间并限定为 0-100 的百分比显示
        optRatio.grid = { left: 12, right: 12, top: 40, bottom: 14, containLabel: true };
        optRatio.yAxis = {
            type: 'value',
            min: 0,
            max: 100,
            axisLine: { show: false },
            splitLine: { lineStyle: { color: 'rgba(200,210,220,0.06)' } },
            axisLabel: { formatter: '{value} %', color: '#6b7280' }
        };

        // 设置 option 到实例
        charts.trips.setOption(optTrips, true);
        charts.weight.setOption(optWeight, true);
        charts.energy.setOption(optEnergy, true);
        charts.ratio.setOption(optRatio, true);

        // 填充统计数值
        document.getElementById('totalTrips').innerText = '总数: ' + trips.reduce((a,b)=>a+b,0);
        document.getElementById('totalWeight').innerText = '总量: ' + (weight.reduce((a,b)=>a+b,0)).toFixed(2) + ' kg';
        document.getElementById('totalEnergy').innerText = '总数: ' + (energy.reduce((a,b)=>a+b,0)).toFixed(2) + ' kWh';

        // 确保在可视区域时正确渲染
        setTimeout(() => {
            Object.values(charts).forEach(c => c && c.resize && c.resize());
        }, 50);
    }

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

    // 单次绑定 resize 监听
    if (!window.__echarts_resize_bound) {
        window.addEventListener('resize', () => {
            Object.values(charts).forEach(c => c && c.resize && c.resize());
        });
        window.__echarts_resize_bound = true;
    }

    window.addEventListener('DOMContentLoaded', () => {
        renderAll(sampleDates, tripsData, weightData, energyData, ratioData);

        document.getElementById('refreshBtn').addEventListener('click', () => {
            tripsData = tripsData.slice().reverse();
            weightData = weightData.slice().reverse();
            energyData = energyData.slice().reverse();
            ratioData = ratioData.slice().reverse();
            renderAll(sampleDates, tripsData, weightData, energyData, ratioData);
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
