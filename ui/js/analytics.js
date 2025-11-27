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

// orders-stats 页面
document.addEventListener('DOMContentLoaded', () => {
    // 统一入口：根据页面 data-page 属性选择数据源（订单或车辆）
    const pageType = (document.body && document.body.getAttribute('data-page')) || '';

    // 共享的 DOM 元素（两个页面使用相同的 id）
    // 顶部全局时间选择已移除；每个图表有独立的模式按钮
    const totalChartDom = document.getElementById('totalChart');
    const typeChartDom = document.getElementById('typeChart');
    const extraChart1Dom = document.getElementById('extraChart1');
    const extraChart2Dom = document.getElementById('extraChart2');
    // 新增：饼图与表格、统计标签
    const pieCategoryDom = document.getElementById('pieCategoryChart'); // 快递/外卖
    const pieStatusDom = document.getElementById('pieStatusChart'); // 订单状态
    const areaTableDom = document.getElementById('areaTable');
    const totalCountLabel = document.getElementById('totalCountLabel');
    const todayCountLabel = document.getElementById('todayCountLabel');
    const expressCountLabel = document.getElementById('expressCountLabel');
    const takeawayCountLabel = document.getElementById('takeawayCountLabel');

    // 如果页面没有这些图表容器之一，则不初始化统计模块（避免在不含统计的页面抛错）
    if (!totalChartDom || !typeChartDom) {
        return; // 页面不包含统计面板，什么也不做
    }

    // 每个主图的模式（year|month|day），默认 day
    let totalMode = 'day';
    let typeMode = 'day';
    const totalModeBtns = document.getElementById('totalModeBtns');
    const typeModeBtns = document.getElementById('typeModeBtns');

    // 根据页面类型选择 API 与回退示例数据
    const isVehiclePage = pageType === 'car-stats' || /车|车辆/.test(document.title);
    const listApi = isVehiclePage ? '/api/vehicle/list' : '/api/order/list';
    const statsApi = isVehiclePage ? '/api/vehicle/stats?limit=5' : '/api/order/stats?limit=5';

    // 车辆回退示例数据（当后端不可用时使用，字段尽量兼容多种实现）
    const fallbackVehicleData = [
        { vehicleId: 'V-SAMPLE-001', type: '电动车', lastActive: '2025-09-10 10:10' },
        { vehicleId: 'V-SAMPLE-002', type: '燃油车', lastActive: '2025-09-10 09:32' },
        { vehicleId: 'V-SAMPLE-003', type: '电动车', lastActive: '2025-08-23 14:00' },
        { vehicleId: 'V-SAMPLE-004', type: '混合动力', lastActive: '2025-09-01 10:00' },
        { vehicleId: 'V-SAMPLE-005', type: '电动车', lastActive: '2024-06-01 08:00' }
    ];

    // 订单回退示例（保留原有）
    const fallbackOrderData = [
        { orderId: 'SAMPLE-001', type: '普通', startTime: '2025-09-10 10:10' },
        { orderId: 'SAMPLE-002', type: '特快', startTime: '2025-09-10 09:32' },
        { orderId: 'SAMPLE-003', type: '冷藏', startTime: '2025-08-23 14:00' },
        { orderId: 'SAMPLE-004', type: '冷冻', startTime: '2025-09-01 10:00' },
        { orderId: 'SAMPLE-005', type: '普通', startTime: '2024-06-01 08:00' },
    ];

    // 初始化图表实例
    const totalChart = echarts.init(totalChartDom);
    const typeChart = echarts.init(typeChartDom);
    const extraChart1 = extraChart1Dom ? echarts.init(extraChart1Dom) : null;
    const extraChart2 = extraChart2Dom ? echarts.init(extraChart2Dom) : null;
    const pieCategoryChart = pieCategoryDom ? echarts.init(pieCategoryDom) : null;
    const pieStatusChart = pieStatusDom ? echarts.init(pieStatusDom) : null;
    const allCharts = [totalChart, typeChart, pieCategoryChart, pieStatusChart];
    if (extraChart1) allCharts.push(extraChart1);
    if (extraChart2) allCharts.push(extraChart2);

    // 窗口大小变化时调整图表尺寸
    window.addEventListener('resize', () => {
        allCharts.forEach(c => { try { c && c.resize(); } catch (e) { /* ignore */ } });
    });

    // 按钮点击切换模式的辅助：设置 active 样式
    function setupModeButtons(containerEl, setter) {
        if (!containerEl) return;
        containerEl.querySelectorAll('button[data-mode]').forEach(b => {
            b.addEventListener('click', () => {
                const m = b.getAttribute('data-mode');
                setter(m);
                // 更新样式
                containerEl.querySelectorAll('button[data-mode]').forEach(x => {
                    x.classList.remove('active');
                    x.style.background = '#fff';
                });
                b.classList.add('active');
                b.style.background = '#f0f0f0';
                refreshAndRender();
            });
        });
    }
    setupModeButtons(totalModeBtns, m => totalMode = m);
    setupModeButtons(typeModeBtns, m => typeMode = m);

    // 缓存后端一次性统计结果，页面生命周期内复用
    let statsCache = null;
    async function fetchStatsAll() {
        if (statsCache) return statsCache;
        try {
            const res = await fetch(statsApi);
            if (!res.ok) throw new Error('stats api returned non-2xx');
            const json = await res.json();
            if (json && json.totalCount) {
                statsCache = json;
                return json;
            }
        } catch (e) {
            // 后端不可用则返回 null，由前端逐条聚合
        }
        return null;
    }

    // 通用的列表获取（根据 pageType 切换 API），失败时使用回退示例数据
    async function fetchList() {
        try {
            const res = await fetch(listApi);
            if (!res.ok) throw new Error('list api returned non-2xx');
            const json = await res.json();
            // 某些后端可能包装成 { list: [...] } 或 ordersList
            if (Array.isArray(json)) return json;
            if (json && Array.isArray(json.ordersList)) return json.ordersList;
            if (json && Array.isArray(json.list)) return json.list;
        } catch (e) {
            // ignore
        }
        return isVehiclePage ? fallbackVehicleData : fallbackOrderData;
    }

    // 解析多种时间字符串为 Date（兼容 yyyyMMddHHmmss / 带空格 / 带斜杠 等）
    function parseTime(ts) {
        if (!ts) return null;
        if (/^\d{14}$/.test(ts)) {
            const y = ts.substr(0,4), m = ts.substr(4,2), d = ts.substr(6,2), hh = ts.substr(8,2), mm = ts.substr(10,2), ss = ts.substr(12,2);
            return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`);
        }
        const normalized = String(ts).replace(/\s+/, 'T').replace(/\//g, '-');
        const d = new Date(normalized);
        if (!isNaN(d)) return d;
        const tryDate = Date.parse(ts);
        if (!isNaN(tryDate)) return new Date(tryDate);
        return null;
    }

    // 构建聚合桶 key（年 / 月 / 日）
    function bucketKey(date, mode) {
        if (!date) return '未知';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        if (mode === 'year') return String(y);
        if (mode === 'month') return `${y}-${m}`;
        return `${y}-${m}-${d}`;
    }

    // 选取最近最多 5 个时间桶并居中（与订单页面行为一致）
    function pickRecentBuckets(allKeys) {
        if (!Array.isArray(allKeys)) return Array(5).fill('');
        const pairs = allKeys.map(k => {
            const parts = k.split('-');
            let dt;
            if (parts.length === 1) dt = new Date(`${parts[0]}-01-01`);
            else if (parts.length === 2) dt = new Date(`${parts[0]}-${parts[1]}-01`);
            else dt = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
            return { k, t: dt.getTime() };
        }).sort((a, b) => a.t - b.t);
        const keysAsc = pairs.map(p => p.k);
        if (keysAsc.length >= 5) return keysAsc.slice(keysAsc.length - 5);
        const result = Array(5).fill('');
        const n = keysAsc.length;
        const start = Math.ceil((5 - n) / 2);
        for (let i = 0; i < n; i++) result[start + i] = keysAsc[i];
        return result;
    }

    // 从一条记录中提取时间字段（兼容多种字段名）
    function extractTimeFromRecord(rec) {
        // common candidates for orders and vehicles
        return rec.StartTime || rec.startTime || rec.starttime || rec.start || rec.lastActive || rec.last_active || rec.lastActiveTime || rec.updateTime || rec.updatedAt || rec.time || rec.timestamp || null;
    }

    // 从记录中提取类型/分类字段（orders: type, Vehicles: type or status）
    function extractTypeFromRecord(rec) {
        return rec.Type || rec.type || rec.vehicleType || rec.status || rec.category || '未知';
    }

    // 提取订单状态字段
    function extractStatusFromRecord(rec) {
        return rec.Status || rec.status || rec.state || '未知';
    }

    // 判定外卖 vs 快递：
    // 说明/假设：若订单类型包含“外卖”或“个人”或 routeId 提及“楼间配送”，则视为外卖；否则视为快递。
    function isTakeawayOrder(rec) {
        const t = String(rec.type || rec.Type || '').toLowerCase();
        const r = String(rec.routeId || '').toLowerCase();
        if (t.includes('外卖') || t.includes('个人') || r.includes('楼间')) return true;
        return false;
    }

    // 辅助：根据 mode 聚合并返回用于绘图的数据
    function aggregateForMode(mode, list, statsAll) {
        const buckets = {}; // { key: { total: n, types: {typeName: n} } }
        const typesSet = new Set();
        if (statsAll && statsAll.totalCountWithTime) {
            // 后端已返回预聚合的时间序列，优先使用它（字段名：totalCountWithTime、typeCount）
            const modeKey = mode === 'year' ? 'yearStats' : mode === 'month' ? 'monthStats' : 'dayStats';
            const totalArr = (statsAll.totalCountWithTime && statsAll.totalCountWithTime[modeKey]) ? statsAll.totalCountWithTime[modeKey] : [];
            totalArr.forEach(item => {
                const k = item.date || '';
                if (!buckets[k]) buckets[k] = { total: 0, types: {} };
                buckets[k].total = item.count || 0;
            });
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
        } else {
            // 逐条聚合
            list.forEach(rec => {
                const ts = extractTimeFromRecord(rec);
                const d = parseTime(ts);
                const key = bucketKey(d, mode);
                if (!buckets[key]) buckets[key] = { total: 0, types: {} };
                buckets[key].total += 1;
                const t = extractTypeFromRecord(rec);
                typesSet.add(t);
                buckets[key].types[t] = (buckets[key].types[t] || 0) + 1;
            });
        }
        const allKeys = Object.keys(buckets).filter(k => k && k !== '未知');
        const chosen = pickRecentBuckets(allKeys);
        const totalSeries = chosen.map(k => buckets[k] ? buckets[k].total : 0);
        const types = Array.from(typesSet);
        const typeSeries = types.map(typeName => {
            const data = chosen.map(k => (buckets[k] && buckets[k].types[typeName]) ? buckets[k].types[typeName] : 0);
            return { name: typeName, type: 'bar', stack: 'total', emphasis: { focus: 'series' }, data };
        });
        return { buckets, typesSet, allKeys, chosen, totalSeries, types, typeSeries };
    }

    // 主刷新流程：拉取列表与可选的后端预聚合 stats -> 聚合 -> 渲染
    async function refreshAndRender() {
        const list = await fetchList();
        const statsAll = await fetchStatsAll();

        // 计算统计卡与饼图数据、片区表
        // 总数、今日数、快递/外卖
        const today = new Date();
        today.setHours(0,0,0,0);
        let totalOrders = 0;
        let todayOrders = 0;
        let expressCount = 0;
        let takeawayCount = 0;
        const statusCounts = {}; // status -> count
        const typeCountsOverall = {}; // type -> count
        const areaMap = {}; // area -> { city: n, express: n, normal: n, u  rgent: n, cold: n, frozen: n }

        list.forEach(rec => {
            totalOrders++;
            const ts = parseTime(extractTimeFromRecord(rec));
            if (ts && +new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()) === +today) todayOrders++;
            if (isTakeawayOrder(rec)) takeawayCount++; else expressCount++;
            const st = extractStatusFromRecord(rec) || '未知';
            statusCounts[st] = (statusCounts[st] || 0) + 1;
            const tt = extractTypeFromRecord(rec) || '未知';
            typeCountsOverall[tt] = (typeCountsOverall[tt] || 0) + 1;

            // 片区判定：优先使用 warehouseId 对应的 area，其次尝试使用 address 字段的前缀
            let area = '未分片区';
            try {
                const stObj = window.getStationById && window.getStationById(rec.warehouseId);
                if (stObj && stObj.area) area = stObj.area;
                else if (rec.address) {
                    // 采用前 6 个字符作为简要片区名的回退方案
                    area = String(rec.address).slice(0,6);
                }
            } catch (e) {}
            if (!areaMap[area]) areaMap[area] = { city:0, express:0, normal:0, urgent:0, cold:0, frozen:0 };
            // 城配判定：routeId 含 '楼间' or explicit '楼间配送'
            const r = String(rec.routeId || '').toLowerCase();
            if (r.includes('楼间')) areaMap[area].city++;
            // 快递
            if (isTakeawayOrder(rec)) areaMap[area].express++; else areaMap[area].express++;
            const tLow = String(rec.type || '').toLowerCase();
            if (tLow.includes('冷藏')) areaMap[area].cold++;
            else if (tLow.includes('冷冻')) areaMap[area].frozen++;
            else if (tLow.includes('加急') || tLow.includes('急件')) areaMap[area].urgent++;
            else areaMap[area].normal++;
        });

        // 优先使用后端一次性统计（若可用），否则回退为前端逐条聚合的结果
        let dispTotal = totalOrders;
        let dispToday = todayOrders;
        let dispExpress = expressCount;
        let dispTakeaway = takeawayCount;
        if (statsAll) {
            if (typeof statsAll.totalCount === 'number') dispTotal = statsAll.totalCount;
            if (typeof statsAll.todayCount === 'number') dispToday = statsAll.todayCount;
            if (typeof statsAll.expressCount === 'number') dispExpress = statsAll.expressCount;
            if (typeof statsAll.cityCount === 'number') dispTakeaway = statsAll.cityCount; // cityCount 为城配
        }
        // 填充统计卡
        if (totalCountLabel) totalCountLabel.innerText = dispTotal;
        if (todayCountLabel) todayCountLabel.innerText = dispToday;
        if (expressCountLabel) expressCountLabel.innerText = dispExpress;
        if (takeawayCountLabel) takeawayCountLabel.innerText = dispTakeaway;

        // 填充订单类别饼图（快递 / 城配）——优先使用后端统计
        if (pieCategoryChart) {
            const vExpress = statsAll && typeof statsAll.expressCount === 'number' ? statsAll.expressCount : expressCount;
            const vCity = statsAll && typeof statsAll.cityCount === 'number' ? statsAll.cityCount : takeawayCount;
            const pieCatOpt = {
                color: ['#f6c85f', '#5470c6'],
                tooltip: { trigger: 'item' },
                legend: { orient: 'vertical', top: '10%', right: '6%' },
                series: [{
                    type: 'pie',
                    avoidLabelOverlap: false,
                    label: { show: false, position: 'center' },
                    data: [
                        { value: vExpress, name: '快递' },
                        { value: vCity, name: '城配' }
                    ]
                }]
            };
            pieCategoryChart.setOption(pieCatOpt, true);
        }

        // 填充订单状态饼图——优先使用后端统计（completed / incompleteCount / abnormal）
        const vIncomplete = statsAll && typeof statsAll.incompleteCount === 'number' ? statsAll.incompleteCount : ((statusCounts['待取件'] || 0) + (statusCounts['运输中'] || 0));
        const vCompleted = statsAll && typeof statsAll.completedCount === 'number' ? statsAll.completedCount : ((statusCounts['已送达'] || 0) + (statusCounts['已取消'] || 0));
        const vAbnormal = statsAll && typeof statsAll.abnormalCount === 'number' ? statsAll.abnormalCount : (statusCounts['异常'] || 0);
        if (pieStatusChart) {
            const pieStatusOpt = {
                color: ['#5470c6', '#91cc75', '#d94e4e'],
                tooltip: { trigger: 'item' },
                legend: { orient: 'vertical', top: '10%', right: '6%' },
                series: [{
                    type: 'pie',
                    avoidLabelOverlap: false,
                    label: { show: false, position: 'center' },
                    left: '-2vw',
                    data: [
                        { value: vIncomplete, name: '未完成' },
                        { value: vCompleted, name: '已完成' },
                        { value: vAbnormal, name: '异常' }
                    ]
                }]
            };
            pieStatusChart.setOption(pieStatusOpt, true);
        }

        // 填充片区表格：若后端返回 zoneCountTable，则直接使用它（优先），否则使用前端聚合的 areaMap
        let finalAreaMap = areaMap;
        if (statsAll && statsAll.zoneCountTable && typeof statsAll.zoneCountTable === 'object') {
            finalAreaMap = {};
            Object.keys(statsAll.zoneCountTable).forEach(k => {
                const z = statsAll.zoneCountTable[k] || {};
                finalAreaMap[k] = {
                    express: (z.express || 0),
                    city: (z.city || 0),
                    normal: (z.normal || 0),
                    urgent: (z.urgent || 0),
                    cold: (z.cold || 0),
                    frozen: (z.frozen || 0)
                };
            });
        }
        if (areaTableDom && areaTableDom.tBodies && areaTableDom.tBodies.length > 0) {
            const tbody = areaTableDom.tBodies[0];
            tbody.innerHTML = '';
            Object.keys(finalAreaMap).forEach(areaName => {
                const r = finalAreaMap[areaName];
                const tr = document.createElement('tr');
                tr.innerHTML = `\n <td>${areaName}</td>\n <td>${r.express}</td>\n <td>${r.city}</td>\n <td>${r.normal}</td>\n <td>${r.urgent}</td>\n <td>${r.cold}</td>\n <td>${r.frozen}</td>\n `;
                tbody.appendChild(tr);
            });
            // 保证至少预留三行（无数据时显示占位符）
            while (tbody.rows.length < 3) {
                const trEmpty = document.createElement('tr');
                trEmpty.innerHTML = `\n <td>-</td>\n <td>-</td>\n <td>-</td>\n <td>-</td>\n <td>-</td>\n <td>-</td>\n <td>-</td>\n `;
                tbody.appendChild(trEmpty);
            }
        }

        // 为每个主图分别聚合并渲染（使用各自的 mode）
        const totalData = aggregateForMode(totalMode, list, statsAll);
        const typeData = aggregateForMode(typeMode, list, statsAll);

        // 若两个图都无数据，展示无数据提示
        if ((!totalData.allKeys || totalData.allKeys.length === 0) && (!typeData.allKeys || typeData.allKeys.length === 0)) {
            totalChart.clear();
            typeChart.clear();
            const emptyLabel = isVehiclePage ? '车辆' : '订单';
            totalChart.setOption({ title: { text: `${emptyLabel}总量统计（无数据）` } });
            typeChart.setOption({ title: { text: `${emptyLabel}类型统计（无数据）` } });
            return;
        }

        const label = isVehiclePage ? '车辆' : '订单';
        const totalOpt = {
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: totalData.chosen, name: totalMode === 'year' ? '年' : totalMode === 'month' ? '月' : '日' },
            yAxis: { type: 'value', name: `${label}数量` },
            series: [{ name: `${label}总量`, type: 'bar', data: totalData.totalSeries, itemStyle: { color: '#5470c6' }, barMaxWidth: 36 }],
            barCategoryGap: '40%',
            grid: { left: '6%', right: '4%', bottom: '8%' }
        };
        totalChart.setOption(totalOpt, true);

        // 定义类型颜色映射（柱状/折线图）
        function getTypeColor(typeName) {
            const n = String(typeName || '').toLowerCase();
            if (n.includes('普通')) return '#91cc75'; // 绿色
            if (n.includes('特快')) return '#f6c85f'; // 黄色
            if (n.includes('冷藏')) return '#9ad0ff'; // 浅蓝
            if (n.includes('冷冻')) return '#5470c6'; // 蓝色
            return '#999999';
        }

        const mappedSeries = typeData.typeSeries.map(s => {
            const color = getTypeColor(s.name);
            return Object.assign({ barMaxWidth: 28, itemStyle: { color } }, s);
        });

        const typeOpt = {
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: { data: typeData.types },
            xAxis: { type: 'category', data: typeData.chosen },
            yAxis: { type: 'value', name: '数量' },
            series: mappedSeries,
            barCategoryGap: '40%',
            grid: { left: '6%', right: '6%', bottom: '8%' }
        };
        typeChart.setOption(typeOpt, true);

        // 占位图表 1：示例指标
        if (extraChart1) {
            const extraOpt1 = {
                title: { text: '占位图：指标 A' },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: totalData.chosen, name: totalMode === 'year' ? '年' : totalMode === 'month' ? '月' : '日' },
                yAxis: { type: 'value', name: '值' },
                series: [{ name: '示例数据', type: 'bar', data: totalData.chosen.map(k => (totalData.buckets[k] && totalData.buckets[k].total) ? Math.round((totalData.buckets[k].total || 0) * 0.2) : 0), itemStyle: { color: '#91cc75' } }],
                grid: { left: '6%', right: '6%', bottom: '8%' }
            };
            extraChart1.setOption(extraOpt1, true);
        }

        // 占位图表 2：示例趋势
        if (extraChart2) {
            const extraOpt2 = {
                title: { text: '占位图：趋势 B' },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: totalData.chosen, name: totalMode === 'year' ? '年' : totalMode === 'month' ? '月' : '日' },
                yAxis: { type: 'value', name: '值' },
                series: [{ name: '示例趋势', type: 'line', smooth: true, data: totalData.chosen.map(k => 0) }],
                grid: { left: '6%', right: '6%', bottom: '8%' }
            };
            extraChart2.setOption(extraOpt2, true);
        }

        // resize 一次以修正渲染
        setTimeout(() => { allCharts.forEach(c => { try { c && c.resize(); } catch (e) {} }); }, 120);
    }

    refreshAndRender();
});
