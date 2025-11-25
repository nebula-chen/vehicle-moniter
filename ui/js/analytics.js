// orders-stats 页面图表逻辑
// 功能：
// 1) 从后端 /api/order/list 获取订单数据（若失败使用内置示例回退）
// 2) 支持按年 / 月 / 日 三种维度聚合（x轴最多显示最近 5 个柱）
// 3) 绘制“订单总量统计”柱状图和“订单种类统计”堆叠柱状图
// 注释使用中文，方便维护

document.addEventListener('DOMContentLoaded', () => {
    const timeModeSelect = document.getElementById('timeModeSelect');
    const refreshBtn = document.getElementById('refreshBtn');

    // 初始化图表实例
    const totalChartDom = document.getElementById('totalChart');
    const typeChartDom = document.getElementById('typeChart');
    const totalChart = echarts.init(totalChartDom);
    const typeChart = echarts.init(typeChartDom);
    // 预留两个占位图表实例
    const extraChart1Dom = document.getElementById('extraChart1');
    const extraChart2Dom = document.getElementById('extraChart2');
    const extraChart1 = extraChart1Dom ? echarts.init(extraChart1Dom) : null;
    const extraChart2 = extraChart2Dom ? echarts.init(extraChart2Dom) : null;
    // 收集所有 chart 以便统一 resize
    const allCharts = [totalChart, typeChart];
    if (extraChart1) allCharts.push(extraChart1);
    if (extraChart2) allCharts.push(extraChart2);

    // 窗口大小变化时调整图表尺寸，保证网格布局下图表正确渲染
    window.addEventListener('resize', () => {
        allCharts.forEach(c => { try { c && c.resize(); } catch (e) { /* ignore */ } });
    });

    // 绑定交互
    refreshBtn.addEventListener('click', () => refreshAndRender());
    timeModeSelect.addEventListener('change', () => refreshAndRender());

    // 首次渲染
    refreshAndRender();

    // --------------------------------------------------
    // 数据获取与聚合逻辑
    // --------------------------------------------------

    // 尝试从后端获取订单列表；如失败使用内置示例数据回退
    async function fetchOrders() {
        try {
            const res = await fetch('/api/order/list');
            if (!res.ok) throw new Error('后端返回非 2xx');
            const json = await res.json();
            // 兼容各种返回格式：优先使用 ordersList 字段
            if (json && Array.isArray(json.ordersList)) {
            return json.ordersList;
            }
            // 直接返回数组（某些实现可能直接返回数组）
            if (Array.isArray(json)) return json;
        } catch (e) {
            // console.warn('fetchOrders failed, use fallback sample', e);
        }

        // 回退示例数据（结构尽量与后端一致，StartTime 字段格式可能不同，解析时会兼容）
        return [
            { orderId: 'SAMPLE-001', type: '普通', startTime: '2025-09-10 10:10' },
            { orderId: 'SAMPLE-002', type: '特快', startTime: '2025-09-10 09:32' },
            { orderId: 'SAMPLE-003', type: '冷藏', startTime: '2025-08-23 14:00' },
            { orderId: 'SAMPLE-004', type: '冷冻', startTime: '2025-09-01 10:00' },
            { orderId: 'SAMPLE-005', type: '普通', startTime: '2024-06-01 08:00' },
        ];
    }

    // 一次性调用后端统计接口 /api/order/stats?limit=5（mode 为空，返回 year/month/day 全部粒度）
    // 返回格式：{ totalCount: { yearStats: [{date,count}], monthStats: [...], dayStats: [...] }, typeCount: { typeName: { yearStats:[], monthStats:[], dayStats:[] } } }
    // 前端会缓存该结果（页面生命周期内）并在视图切换时直接从缓存取对应粒度数据。
    let statsCache = null;
    async function fetchStatsAll() {
        if (statsCache) return statsCache;
        try {
            // mode 传空以请求后端返回所有粒度的统计结果
            const url = '/api/order/stats?limit=5';
            const res = await fetch(url);
            if (!res.ok) throw new Error('stats api returned non-2xx');
            const json = await res.json();
            if (json && json.totalCount) {
                statsCache = json;
                return json;
            }
        } catch (e) {
            // console.warn('fetchStatsAll failed', e);
        }
        return null;
    }

  // 解析后端 / data.js 中可能的时间字符串，返回 Date 对象（尽量兼容多种格式）
    function parseTime(ts) {
        if (!ts) return null;
        // 后端注释中提到可能是 yyyyMMddHHmmss
        if (/^\d{14}$/.test(ts)) {
            const y = ts.substr(0,4), m = ts.substr(4,2), d = ts.substr(6,2), hh = ts.substr(8,2), mm = ts.substr(10,2), ss = ts.substr(12,2);
            return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`);
        }
        // 常见带空格格式：2025-09-10 10:10 或 2025/09/10 10:10
        const normalized = ts.replace(/\s+/, 'T').replace(/\//g, '-');
        const d = new Date(normalized);
        if (!isNaN(d)) return d;
        // try fallback parse
        const tryDate = Date.parse(ts);
        if (!isNaN(tryDate)) return new Date(tryDate);
        return null;
    }

  // 根据 mode（year/month/day）构建 key 字符串
    function bucketKey(date, mode) {
        if (!date) return '未知';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        if (mode === 'year') return String(y);
        if (mode === 'month') return `${y}-${m}`;
        return `${y}-${m}-${d}`; // day
    }

    // 获取最近最多 5 个桶（按时间排序，取最新的 5 个）
    function pickRecentBuckets(allKeys) {
        // allKeys 为字符串数组，格式为 yyyy 或 yyyy-mm 或 yyyy-mm-dd
        // 目标：返回长度固定为 5 的数组（x 轴 5 列）。
        // - 当 allKeys.length > 5 时，返回按时间升序的最近 5 个 key
        // - 当 allKeys.length <= 5 时，将这些 keys 在 5 槽位中居中排列，其他槽位用空字符串占位
        if (!Array.isArray(allKeys)) return Array(5).fill('');

        // 解析 key 到时间戳并排序（升序）
        const pairs = allKeys.map(k => {
            const parts = k.split('-');
            let dt;
            if (parts.length === 1) dt = new Date(`${parts[0]}-01-01`);
            else if (parts.length === 2) dt = new Date(`${parts[0]}-${parts[1]}-01`);
            else dt = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
            return { k, t: dt.getTime() };
        }).sort((a, b) => a.t - b.t);

        const keysAsc = pairs.map(p => p.k);
        if (keysAsc.length >= 5) {
            // 如果多于等于 5 个，取最后 5 个（仍保持升序）
            return keysAsc.slice(keysAsc.length - 5);
        }

        // 少于 5 个时，创建 5 槽位并居中放置
        const result = Array(5).fill('');
        const n = keysAsc.length;
        // 使用向上取整以使数据更靠中间偏右（例如 n=2 -> start=2 -> 填充第3、第4）
        const start = Math.ceil((5 - n) / 2);
        for (let i = 0; i < n; i++) {
            result[start + i] = keysAsc[i];
        }
        return result;
    }

    // 主刷新函数：拉取数据 -> 聚合 -> 渲染图表
    async function refreshAndRender() {
        const mode = (timeModeSelect.value || 'month');
        const orders = await fetchOrders();

    // 先尝试调用后端一次性预聚合接口获取所有粒度的统计（优先使用后端统计以减轻前端负担）
    const statsAll = await fetchStatsAll();

        const buckets = {}; // { key: { total: n, types: {typeName: n} } }
        const typesSet = new Set();

        if (statsAll && statsAll.totalCount) {
            // 从缓存/后端返回结构中提取对应粒度的数据数组（modeKey）
            const modeKey = mode === 'year' ? 'yearStats' : mode === 'month' ? 'monthStats' : 'dayStats';
            const totalArr = (statsAll.totalCount && statsAll.totalCount[modeKey]) ? statsAll.totalCount[modeKey] : [];

            // 填充总量到 buckets
            totalArr.forEach(item => {
                const k = item.date || '';
                if (!buckets[k]) buckets[k] = { total: 0, types: {} };
                buckets[k].total = item.count || 0;
            });

            // 填充按类型统计（typeCount 的每个值也是 TimeSeriesStats）
            if (statsAll.typeCount && typeof statsAll.typeCount === 'object') {
                Object.keys(statsAll.typeCount).forEach(typeName => {
                    const ts = statsAll.typeCount[typeName];
                    const arr = ts && ts[modeKey] ? ts[modeKey] : [];
                    typesSet.add(typeName);
                    arr.forEach(item => {
                        const k = item.date || '';
                        if (!buckets[k]) buckets[k] = { total: 0, types: {} };
                        buckets[k].types[typeName] = item.count || 0;
                    });
                });
            }

            var allKeys = Object.keys(buckets).filter(k => k && k !== '未知');
        } else {
            // 回退到老逻辑：逐条订单聚合
            orders.forEach(o => {
                const ts = o.StartTime || o.startTime || o.starttime || o.Starttime || o.startTime;
                const d = parseTime(ts);
                const key = bucketKey(d, mode);
                if (!buckets[key]) buckets[key] = { total: 0, types: {} };
                buckets[key].total += 1;
                const t = o.Type || o.type || '未知';
                typesSet.add(t);
                buckets[key].types[t] = (buckets[key].types[t] || 0) + 1;
            });

            var allKeys = Object.keys(buckets).filter(k => k && k !== '未知');
        }
        if (allKeys.length === 0) {
            // 无数据时清空图表并提示
            totalChart.clear();
            typeChart.clear();
            totalChart.setOption({
                title: { text: '订单总量统计（无数据）' }
            });
            typeChart.setOption({
                title: { text: '订单种类统计（无数据）' }
            });
            return;
        }

        const chosen = pickRecentBuckets(allKeys);
        // 注意：pickRecentBuckets 已返回长度为 5 的数组，且当需要时已对数据项居中排列（占位用空字符串 ""）。
        // 因此不再需要额外的排序步骤。

        // 准备总量统计数据
        const totalSeries = chosen.map(k => buckets[k] ? buckets[k].total : 0);

        // 准备类型堆叠数据：每个 type 都是一个 series，数据长度为 chosen.length
        const types = Array.from(typesSet);
        const typeSeries = types.map(typeName => {
        const data = chosen.map(k => (buckets[k] && buckets[k].types[typeName]) ? buckets[k].types[typeName] : 0);
        return {
            name: typeName,
            type: 'bar',
            stack: 'total',
            emphasis: { focus: 'series' },
            data,
        };
        });

        // 渲染订单总量柱状图
        const totalOpt = {
            title: { text: '订单总量统计（按 ' + (mode === 'year' ? '年' : mode === 'month' ? '月' : '日') + '）' },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: chosen, name: mode === 'year' ? '年' : mode === 'month' ? '月' : '日' },
            yAxis: { type: 'value', name: '订单数量' },
            series: [{ name: '订单总量', type: 'bar', data: totalSeries, itemStyle: { color: '#5470c6' } }],
            grid: { left: '6%', right: '4%', bottom: '8%' }
        };
        totalChart.setOption(totalOpt, true);

        // 渲染种类堆叠图
        const typeOpt = {
            title: { text: '订单种类统计（堆叠）' },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: { data: types },
            xAxis: { type: 'category', data: chosen },
            yAxis: { type: 'value', name: '数量' },
            series: typeSeries,
            grid: { left: '6%', right: '6%', bottom: '8%' }
        };
        typeChart.setOption(typeOpt, true);

        // 渲染占位图表 1
        const extraOpt1 = {
            title: { text: '占位图：指标 A' },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: chosen, name: mode === 'year' ? '年' : mode === 'month' ? '月' : '日' },
            yAxis: { type: 'value', name: '值' },
            series: [{
                name: '示例数据',
                type: 'bar',
                data: chosen.map(k => (buckets[k] && buckets[k].total) ? Math.round((buckets[k].total || 0) * 0.2) : 0),
                itemStyle: { color: '#91cc75' }
            }],
            grid: { left: '6%', right: '6%', bottom: '8%' }
        };
        extraChart1.setOption(extraOpt1, true);

        // 渲染占位图表 2
        const extraOpt2 = {
            title: { text: '占位图：趋势 B' },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: chosen, name: mode === 'year' ? '年' : mode === 'month' ? '月' : '日' },
            yAxis: { type: 'value', name: '值' },
            series: [{
                name: '示例趋势',
                type: 'line',
                smooth: true,
                data: chosen.map(k => 0)
            }],
            grid: { left: '6%', right: '6%', bottom: '8%' }
        };
        extraChart2.setOption(extraOpt2, true);
        // 在渲染后触发一次 resize，确保基于新 CSS 高度正确绘制（短延时避免布局抖动）
        setTimeout(() => {
            allCharts.forEach(c => { try { c && c.resize(); } catch (e) { /* ignore */ } });
        }, 120);
    }
});
