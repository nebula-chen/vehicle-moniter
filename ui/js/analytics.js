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
    // 统一入口：根据页面 data-page 属性选择数据源（订单）
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
    // 支持 orders-stats 和 car-stats，两者共享同一套渲染逻辑但数据字段可能不同
    const statsApi = (function() {
        if (pageType === 'car-stats') return '/api/vehicle/stats?limit=5';
        // 默认保留订单接口
        return '/api/order/stats?limit=5';
    })();

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
            if (!res.ok) {
                // 抛出包含状态，便于上层捕获并显示详细信息
                const txt = await res.text().catch(() => 'no body');
                console.error('statsApi fetch failed', res.status, txt);
                return null;
            }
            const json = await res.json();
            // 仅在后端返回内容（即便没有 totalCount 也认为接口可用，后续由展示逻辑判断字段完整性）
            if (json) {
                statsCache = json;
                return json;
            }
        } catch (e) {
            console.error('fetchStatsAll error', e);
        }
        return null;
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

    // 辅助：仅使用后端提供的 time-series 数据来构建绘图数据（不再从 list 做逐条回退聚合）
    function aggregateForMode(mode, statsAll) {
        const buckets = {}; // { key: { total: n, types: {typeName: n} } }
        const typesSet = new Set();
        const modeKey = mode === 'year' ? 'yearStats' : mode === 'month' ? 'monthStats' : 'dayStats';
        const totalArr = (statsAll && statsAll.totalCountWithTime && statsAll.totalCountWithTime[modeKey]) ? statsAll.totalCountWithTime[modeKey] : [];
        totalArr.forEach(item => {
            const k = item.date || '';
            if (!buckets[k]) buckets[k] = { total: 0, types: {} };
            buckets[k].total = item.count || 0;
        });
        if (statsAll && statsAll.typeCount && typeof statsAll.typeCount === 'object') {
            Object.keys(statsAll.typeCount).forEach(typeName => {
                const arr = (statsAll.typeCount[typeName] && statsAll.typeCount[typeName][modeKey]) ? statsAll.typeCount[typeName][modeKey] : [];
                typesSet.add(typeName);
                arr.forEach(item => {
                    const k = item.date || '';
                    if (!buckets[k]) buckets[k] = { total: 0, types: {} };
                    buckets[k].types[typeName] = item.count || 0;
                });
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
        const statsAll = await fetchStatsAll();

        // 简单的错误横幅，便于在页面上可见地提示接口异常信息
        function showErrorBanner(msg, details) {
            const id = 'analytics-error-banner';
            let el = document.getElementById(id);
            if (!el) {
                el = document.createElement('div');
                el.id = id;
                el.style.position = 'relative';
                el.style.background = '#f8d7da';
                el.style.color = '#721c24';
                el.style.border = '1px solid #f5c6cb';
                el.style.padding = '8px';
                el.style.margin = '8px 0';
                el.style.borderRadius = '4px';
                el.style.fontSize = '13px';
                if (totalChartDom && totalChartDom.parentNode) totalChartDom.parentNode.insertBefore(el, totalChartDom);
                else document.body.insertBefore(el, document.body.firstChild);
            }
            el.innerText = msg + (details ? ('：' + details) : '');
        }
        function clearErrorBanner() {
            const el = document.getElementById('analytics-error-banner');
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }

        if (!statsAll) {
            console.error('统计接口 statsApi 返回为空或不可用，请检查 statsApi 地址与后端');
            showErrorBanner('统计接口调用失败：statsApi 返回为空或不可用，请检查后端。');
            // 清空并设置明确的无数据提示，便于现场排查
            try { totalChart.clear(); typeChart.clear(); if (pieCategoryChart) pieCategoryChart.clear(); if (pieStatusChart) pieStatusChart.clear(); } catch (e) {}
            try { totalChart.setOption({ title: { text: '统计数据不可用（接口异常）' } }); typeChart.setOption({ title: { text: '统计数据不可用（接口异常）' } }); } catch (e) {}
            return;
        }
        // 如果成功拿到后端数据，移除错误提示
        clearErrorBanner();

        // 使用后端预聚合数据填充统计卡（不再使用前端逐条回退聚合）
        // 订单页面使用原有字段；车辆页面使用车辆专用字段（如果后端字段存在则优先使用）
        if (pageType === 'car-stats') {
            // 车辆统计常用字段映射（后端接口可能命名不同，请确保后端返回下列字段或调整此处映射）
            const deviceTotal = (typeof statsAll.deviceCount === 'number') ? statsAll.deviceCount : (typeof statsAll.totalCount === 'number' ? statsAll.totalCount : 0);
            const onlineCount = (typeof statsAll.onlineCount === 'number') ? statsAll.onlineCount : 0;
            const operateCount = (typeof statsAll.operateCount === 'number') ? statsAll.operateCount : 0;
            const abnormalCount = (typeof statsAll.abnormalCount === 'number') ? statsAll.abnormalCount : 0;
            const attendanceCount = (typeof statsAll.attendanceCount === 'number') ? statsAll.attendanceCount : 0;
            const totalMileage = (typeof statsAll.totalMileage === 'number') ? statsAll.totalMileage : 0;
            const chargePileCount = (typeof statsAll.chargePileCount === 'number') ? statsAll.chargePileCount : 0;
            const swapCabinetCount = (typeof statsAll.swapCabinetCount === 'number') ? statsAll.swapCabinetCount : 0;
            // 设置 DOM（如果存在则设置）
            const deviceTotalLabel = document.getElementById('deviceTotalLabel');
            const onlineCountLabel = document.getElementById('onlineCountLabel');
            const operateCountLabel = document.getElementById('operateCountLabel');
            const abnormalCountLabel = document.getElementById('abnormalCountLabel');
            const attendanceCountLabel = document.getElementById('attendanceCountLabel');
            const mileageLabel = document.getElementById('mileageLabel');
            const chargePileLabel = document.getElementById('chargePileLabel');
            const swapCabinetLabel = document.getElementById('swapCabinetLabel');
            if (deviceTotalLabel) deviceTotalLabel.innerText = deviceTotal;
            if (onlineCountLabel) onlineCountLabel.innerText = onlineCount;
            if (operateCountLabel) operateCountLabel.innerText = operateCount;
            if (abnormalCountLabel) abnormalCountLabel.innerText = abnormalCount;
            if (attendanceCountLabel) attendanceCountLabel.innerText = attendanceCount;
            if (mileageLabel) mileageLabel.innerText = totalMileage;
            if (chargePileLabel) chargePileLabel.innerText = chargePileCount;
            if (swapCabinetLabel) swapCabinetLabel.innerText = swapCabinetCount;
        } else {
            // 订单页面原有字段
            const dispTotal = (typeof statsAll.totalCount === 'number') ? statsAll.totalCount : 0;
            const dispToday = (typeof statsAll.todayCount === 'number') ? statsAll.todayCount : 0;
            const dispExpress = (typeof statsAll.expressCount === 'number') ? statsAll.expressCount : 0;
            const dispTakeaway = (typeof statsAll.cityCount === 'number') ? statsAll.cityCount : 0;
            if (totalCountLabel) totalCountLabel.innerText = dispTotal;
            if (todayCountLabel) todayCountLabel.innerText = dispToday;
            if (expressCountLabel) expressCountLabel.innerText = dispExpress;
            if (takeawayCountLabel) takeawayCountLabel.innerText = dispTakeaway;
        }

        // 填充类别饼图：订单页面显示快递/城配，车辆页面显示车辆类型分布（例如：普通/冷藏/冷冻/大容量）
        if (pieCategoryChart) {
            if (pageType === 'car-stats') {
                // 期望后端返回类似 statsAll.typeCountSummary = { "普通": 10, "冷藏": 5, ... }
                const summary = (statsAll && statsAll.typeCountSummary && typeof statsAll.typeCountSummary === 'object') ? statsAll.typeCountSummary : null;
                let data = [];
                if (summary) {
                    data = Object.keys(summary).map(k => ({ name: k, value: summary[k] || 0 }));
                } else if (statsAll && statsAll.typeCount && typeof statsAll.typeCount === 'object') {
                    // 从 typeCount 的总和构建饼图：取每类的 dayStats 总和
                    Object.keys(statsAll.typeCount).forEach(typeName => {
                        const t = statsAll.typeCount[typeName];
                        let total = 0;
                        if (t && t.dayStats && Array.isArray(t.dayStats)) total = t.dayStats.reduce((s, it) => s + (it.count || 0), 0);
                        data.push({ name: typeName, value: total });
                    });
                } else {
                    // 回退为空数据
                    data = [{ name: '普通', value: 0 }, { name: '冷藏', value: 0 }, { name: '冷冻', value: 0 }];
                }
                const pieOpt = {
                    color: ['#91cc75', '#9ad0ff', '#5470c6', '#f6c85f', '#d94e4e'],
                    tooltip: { trigger: 'item' },
                    legend: { orient: 'vertical', top: '10%', right: '6%' },
                    series: [{ type: 'pie', avoidLabelOverlap: false, label: { show: false, position: 'center' }, data }]
                };
                pieCategoryChart.setOption(pieOpt, true);
            } else {
                // 订单页面原有饼图（快递 / 城配）
                const vExpress = (typeof statsAll.expressCount === 'number') ? statsAll.expressCount : 0;
                const vCity = (typeof statsAll.cityCount === 'number') ? statsAll.cityCount : 0;
                const pieCatOpt = {
                    color: ['#f6c85f', '#5470c6'],
                    tooltip: { trigger: 'item' },
                    legend: { orient: 'vertical', top: '10%', right: '6%' },
                    series: [{ type: 'pie', avoidLabelOverlap: false, label: { show: false, position: 'center' }, data: [ { value: vExpress, name: '快递' }, { value: vCity, name: '城配' } ] }]
                };
                pieCategoryChart.setOption(pieCatOpt, true);
            }
        }

        // 填充状态饼图——订单页面/车辆页面共用：车辆页面显示出勤/未出勤/异常等
        if (pieStatusChart) {
            if (pageType === 'car-stats') {
                // 期望后端返回 statsAll.attendanceStatus = { "出勤": n, "未出勤": m, "异常": k }
                const st = (statsAll && statsAll.attendanceStatus && typeof statsAll.attendanceStatus === 'object') ? statsAll.attendanceStatus : null;
                let data = [];
                if (st) {
                    // 规范化状态为三个固定标签：已完成 / 未完成 / 异常
                    const normalize = (k) => {
                        if (!k) return k;
                        const s = String(k).toLowerCase();
                        if (s.includes('complete') || s.includes('已完成') || s.includes('完成')) return '已完成';
                        if (s.includes('incomplete') || s.includes('未完成') || s.includes('未 完成')) return '未完成';
                        if (s.includes('abnorm') || s.includes('异常')) return '异常';
                        return k; // 其它原始标签保留
                    };
                    const counters = { '已完成': 0, '未完成': 0, '异常': 0 };
                    const others = {};
                    Object.keys(st).forEach(k => {
                        const label = normalize(k);
                        const v = Number(st[k]) || 0;
                        if (label === '已完成' || label === '未完成' || label === '异常') counters[label] += v;
                        else others[label] = (others[label] || 0) + v;
                    });
                    // 保持顺序：已完成、未完成、异常，然后列出其它（若有）
                    data = [
                        { name: '已完成', value: counters['已完成'] },
                        { name: '未完成', value: counters['未完成'] },
                        { name: '异常', value: counters['异常'] }
                    ];
                    Object.keys(others).forEach(k => data.push({ name: k, value: others[k] }));
                } else {
                    // 回退到 completed/incomplete/abnormal 字段（兼容旧接口）
                    const vIncomplete = (typeof statsAll.incompleteCount === 'number') ? statsAll.incompleteCount : 0;
                    const vCompleted = (typeof statsAll.completedCount === 'number') ? statsAll.completedCount : 0;
                    const vAbnormal = (typeof statsAll.abnormalCount === 'number') ? statsAll.abnormalCount : 0;
                    data = [ { value: vCompleted, name: '已完成' }, { value: vIncomplete, name: '未完成' }, { value: vAbnormal, name: '异常' } ];
                }
                const pieOpt = {
                    color: ['#91cc75', '#5470c6', '#d94e4e', '#f6c85f'],
                    tooltip: { trigger: 'item' },
                    legend: { orient: 'vertical', top: '10%', right: '6%' },
                    series: [{ type: 'pie', avoidLabelOverlap: false, label: { show: false, position: 'center' }, left: '-2vw', data }]
                };
                pieStatusChart.setOption(pieOpt, true);
            } else {
                // 订单页面原有状态饼图
                const vIncomplete = (typeof statsAll.incompleteCount === 'number') ? statsAll.incompleteCount : 0;
                const vCompleted = (typeof statsAll.completedCount === 'number') ? statsAll.completedCount : 0;
                const vAbnormal = (typeof statsAll.abnormalCount === 'number') ? statsAll.abnormalCount : 0;
                const pieStatusOpt = {
                    color: ['#5470c6', '#91cc75', '#d94e4e'],
                    tooltip: { trigger: 'item' },
                    legend: { orient: 'vertical', top: '10%', right: '6%' },
                    series: [{ type: 'pie', avoidLabelOverlap: false, label: { show: false, position: 'center' }, left: '-2vw', data: [ { value: vIncomplete, name: '未完成' }, { value: vCompleted, name: '已完成' }, { value: vAbnormal, name: '异常' } ] }]
                };
                pieStatusChart.setOption(pieStatusOpt, true);
            }
        }

        // 填充片区表格：优先使用后端 zoneCountTable，如果没有则显示占位
        let finalAreaMap = {};
        if (statsAll && statsAll.zoneCountTable && typeof statsAll.zoneCountTable === 'object') {
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

        // 为每个主图分别聚合并渲染（仅使用 statsAll）
        const totalData = aggregateForMode(totalMode, statsAll);
        const typeData = aggregateForMode(typeMode, statsAll);

        // 若两个图都无数据，展示无数据提示
        if ((!totalData.allKeys || totalData.allKeys.length === 0) && (!typeData.allKeys || typeData.allKeys.length === 0)) {
            totalChart.clear();
            typeChart.clear();
            const emptyLabel = (pageType === 'car-stats') ? '车辆' : '订单';
            totalChart.setOption({ title: { text: `${emptyLabel}总量统计（无数据）` } });
            typeChart.setOption({ title: { text: `${emptyLabel}类型统计（无数据）` } });
            return;
        }

        const label = (pageType === 'car-stats') ? '车辆' : '订单';
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
