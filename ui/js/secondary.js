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

// 时间处理工具：识别 ISO/UTC 时间字符串并转换为北京时间（东八区），格式化为 `YYYY-MM-DD HH:mm:ss`
function isIsoUtcString(s) {
    if (!s || typeof s !== 'string') return false;
    // 常见 ISO 示例：2025-10-13T08:53:51Z 或 2025-10-13T08:53:51+00:00
    return s.indexOf('T') !== -1 || /Z$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
}

function utcToBeijing(iso) {
    if (!iso) return '';
    try {
        if (!isIsoUtcString(iso)) return iso; // 如果不是 ISO/UTC 字符串，认为已经是本地/格式化字符串，直接返回
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        const beijingMs = d.getTime() + 8 * 3600 * 1000;
        const b = new Date(beijingMs);
        const Y = b.getUTCFullYear();
        const M = String(b.getUTCMonth() + 1).padStart(2, '0');
        const D = String(b.getUTCDate()).padStart(2, '0');
        const h = String(b.getUTCHours()).padStart(2, '0');
        const m = String(b.getUTCMinutes()).padStart(2, '0');
        const s = String(b.getUTCSeconds()).padStart(2, '0');
        return `${Y}-${M}-${D} ${h}:${m}:${s}`;
    } catch (e) {
        return iso;
    }
}

function formatTimeForDisplay(s) {
    if (!s) return '';
    if (isIsoUtcString(s)) return utcToBeijing(s);
    return s;
}

/////////   筛选功能   /////////
// 订单筛选
function filterOrders() {
    // 支持多种 id 命名，优先级顺序数组
    function valForIds(ids, defaultVal = ''){
        for (const id of ids){
            const el = document.getElementById(id);
            if (el) return (el.value || '').trim();
        }
        return defaultVal;
    }

    const orderId = valForIds(['filter-orderId','filterOrderId','filter-id','filterId']);
    const addressee = valForIds(['filterName','filter-name','filterName']);
    const phone = valForIds(['filterPhone','filter-phone']);
    const address = valForIds(['filterAddress','filter-address']);
    const point = valForIds(['filterPoint','filter-point']);
    const status = valForIds(['filterStatus','filter-status']);
    // 状态别名映射：当用户请求某一语义状态时，兼容数据中可能的不同表述
    const STATUS_ALIASES = {
        '已完成': ['已完成', '已签收', '完成'],
        '配送中': ['配送中', '配送进行中', '运输中', '派送中'],
        '异常': ['异常', '问题', '待处理', '故障']
    };
    const tableBody = document.getElementById('table-body');

    // 现在改为使用后端接口获取订单数据，禁用页面内静态 data.js
    // 后端接口: GET /api/order/list
    // 根据前端的筛选条件，构造查询参数
    const params = new URLSearchParams();
    if (orderId) params.append('orderId', orderId);
    if (addressee) params.append('addressee', addressee);
    if (phone) params.append('phone', phone);
    if (address) params.append('address', address);
    if (point) params.append('stationId', point);
    if (status) params.append('status', status);

    // 显示加载占位
    if (tableBody) tableBody.innerHTML = '<tr class="table-loading"><td colspan="11">加载中…</td></tr>';

    fetch('/api/order/list?' + params.toString(), { method: 'GET', cache: 'no-store' })
        .then(resp => {
            if (!resp.ok) throw new Error('网络错误: ' + resp.status);
            return resp.json();
        })
        .then(json => {
            // 期望后端返回 { code:0, msg:'', data: { ordersList: [...], total: N } } 或者直接 { ordersList: [...], total: N }
            let list = [];
            if (!json) list = [];
            else if (Array.isArray(json.ordersList)) list = json.ordersList;
            else if (json.data && Array.isArray(json.data.ordersList)) list = json.data.ordersList;
            else if (Array.isArray(json)) list = json;

            tableBody.innerHTML = '';
            if (!list || list.length === 0) {
                const tr = document.createElement('tr');
                tr.className = 'table-empty';
                tr.innerHTML = '<td colspan="11">暂无匹配记录。</td>';
                tableBody.appendChild(tr);
                return;
            }

            // 渲染后端的 OrderInfoResp 列表
            list.forEach(order => {
                const tr = document.createElement('tr');
                // 后端字段名可能为 orderId
                const oid = order.orderId || order.id || '';
                tr.dataset.id = oid;
                const statusText = order.status || '';
                const endTimeDisplay = order.endTime ? '<br>' + formatTimeForDisplay(order.endTime) : '';
                tr.innerHTML = `
                    <td>${escapeHtml(oid)}</td>
                    <td>${escapeHtml(order.type || '')}</td>
                    <td>${escapeHtml(statusText)}${statusText === '已完成' ? endTimeDisplay : ''}</td>
                    <td>${escapeHtml(order.sender || '')}</td>
                    <td>${escapeHtml((order.senderPhone || '') + '') + '<br>' + escapeHtml(order.senderAddress || '')}</td>
                    <td>${escapeHtml(order.addressee || '')}</td>
                    <td>${escapeHtml((order.addresseePhone || '') + '') + '<br>' + escapeHtml(order.address || '')}</td>
                    <td>${(order.passStations && order.passStations.length>0) ? escapeHtml(order.passStations[0]) : (order.stationId || order.warehouseId || '--')}</td>
                    <td>${order.passRoute && order.passRoute.length>0 ? `<a href="route-manage.html?route=${encodeURIComponent(order.passRoute[0])}" class="link-to-route" target="_self">${escapeHtml(order.passRoute[0])}</a>` : (order.routeId ? `<a href="route-manage.html?route=${encodeURIComponent(order.routeId)}" class="link-to-route" target="_self">${escapeHtml(order.routeId)}</a>` : '--')}</td>
                    <td>${order.passVehicle && order.passVehicle.length>0 ? `<a href="car-screen.html?vehicle=${encodeURIComponent(order.passVehicle[0])}" class="link-to-map" target="_blank" rel="noopener">${escapeHtml(order.passVehicle[0])}</a>` : (order.vehicleId ? `<a href="car-screen.html?vehicle=${encodeURIComponent(order.vehicleId)}" class="link-to-map" target="_blank" rel="noopener">${escapeHtml(order.vehicleId)}</a>` : '--')}</td>
                    <td>${escapeHtml((order.passGridMember && order.passGridMember[0]) || order.gridMemberId || order.courierId || '--')}</td>
                `;
                tr.addEventListener('click', () => showDetail(order));
                // prevent row click when clicking station/map/route links
                const links = tr.querySelectorAll('.link-to-map, .link-to-station, .link-to-route');
                links.forEach(a => {
                    a.addEventListener('click', function(evt){ evt.stopPropagation(); });
                });
                tableBody.appendChild(tr);
            });
        })
        .catch(err => {
            console.error('fetch orders failed', err);
            if (tableBody) {
                tableBody.innerHTML = '';
                const tr = document.createElement('tr');
                tr.className = 'table-empty';
                tr.innerHTML = '<td colspan="11">获取订单数据失败：' + escapeHtml(err.message || '') + '</td>';
                tableBody.appendChild(tr);
            }
        });
}

// 网格员筛选
function filterGridMember() {
    // 安全获取字段，若不存在则不执行
    const elId = document.getElementById('filter-GMId');
    const elName = document.getElementById('filter-name');
    const elGrid = document.getElementById('filterGrid');
    const elStatus = document.getElementById('filterStatus');
    const tbody = document.getElementById('table-body');
    if (!elId || !elName || !elGrid || !elStatus || !tbody) {
        console.warn('filterGridMember: required DOM elements not found');
        return;
    }

    const id = elId.value.trim();
    const nameOrContact = elName.value.trim();
    const grid = elGrid.value;
    const status = elStatus.value;

    // 请求数据（可能是远程），然后基于输入过滤并渲染
    fetchGridMembers({ id, nameOrContact, grid, status }).then(list => {
        // 如果 fetch 返回非数组，保护性处理
        const arr = Array.isArray(list) ? list : [];
        const filtered = arr.filter(item => {
            const matchId = id === '' || (item.id || '').includes(id);
            const matchName = nameOrContact === '' || ((item.name || '').includes(nameOrContact) || (item.phone || '').includes(nameOrContact));
            const matchGrid = grid === '' || (item.network || '').includes(grid);
            const matchStatus = status === '' || (item.status || '') === status;
            return matchId && matchName && matchGrid && matchStatus;
        });
        renderTable(filtered);
    }).catch(err => {
        console.error('fetchGridMembers failed', err);
        renderTable([]);
    });
}

// 车辆任务筛选（car-tasks.html 使用）
function filterTasks() {
    // 仅在 car-tasks 页面执行
    const container = document.querySelector('.container');
    const page = container && container.getAttribute('data-page');
    if (page && page !== 'car-tasks') return;

    const id = (document.getElementById('filter-carId') && document.getElementById('filter-carId').value.trim()) || '';
    const task = (document.getElementById('filter-task') && document.getElementById('filter-task').value.trim()) || '';
    const route = (document.getElementById('filter-route') && document.getElementById('filter-route').value.trim()) || '';
    const status = (document.getElementById('filterStatus') && document.getElementById('filterStatus').value) || '';
    const tbody = document.getElementById('table-body');
    if (!tbody || !Array.isArray(window.vehicleTasks)) return;

    const matched = window.vehicleTasks.filter(t => (
        (id === '' || (t.vehicleId || '').includes(id)) &&
        (task === '' || (t.taskId || '').includes(task)) &&
        (route === '' || (t.routeId || '').includes(route)) &&
        (status === '' || (t.status || '').includes(status))
    ));

    tbody.innerHTML = '';
    if (!matched || matched.length === 0) {
        const tr = document.createElement('tr');
        tr.className = 'table-empty';
        tr.innerHTML = '<td colspan="11">暂无匹配记录。</td>';
        tbody.appendChild(tr);
        return;
    }

    matched.forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.id = item.taskId;
            tr.innerHTML = `
            <td>${item.taskId || ''}</td>
            <td>${item.type || ''}</td>
            <td>${item.startTime || ''}</td>
            <td>${item.status != '已完成' ? item.status : item.status + '<br>' + item.endTime}</td>
            <td>${item.count != null ? item.count : ''}</td>
            <td>${(item.warehouseId || item.warehouse) ? `<a href="stations-manage.html?station=${encodeURIComponent(item.warehouseId||item.warehouse)}" class="link-to-station" target="_self">${item.warehouseId || item.warehouse}</a>` : ''}</td>
            <td>${item.routeId ? `<a href="route-manage.html?route=${encodeURIComponent(item.routeId)}" class="link-to-route" target="_self">${item.routeId}</a>` : ''}</td>
            <td>${item.vehicleId ? `<a href="car-screen.html?vehicle=${encodeURIComponent(item.vehicleId)}" class="link-to-map" target="_blank" rel="noopener">${item.vehicleId}</a>` : ''}</td>
            <td>${item.gridMemberId || item.courierId || ''}</td>
            <td>${item.residualKm != null ? item.residualKm + ' km' : '--'}</td>
            <td>${item.residualTime != null ? item.residualTime + ' min' : '--'}</td>
        `;
        tr.addEventListener('click', () => showDetail(item));
        // stop row click when clicking map, station or route links
        const links = tr.querySelectorAll('.link-to-map, .link-to-station, .link-to-route');
        links.forEach(a => a.addEventListener('click', function(evt){ evt.stopPropagation(); }));
        tbody.appendChild(tr);
    });
}

// 渲染表格的函数
function renderTable(list) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    // 若页面不是网格员页面，谨慎操作：只在 gridmember-profile 或当 table 的列数和数据匹配时渲染
    const container = document.querySelector('.container');
    const page = container && container.getAttribute('data-page');
    if (page && page !== 'gridmember-profile') {
        // 只有在 gridmember-profile 页面才使用此 renderTable 的表格结构
        // 但如果传入数据为空，允许不做任何更改
        if (!list || list.length === 0) return;
    }

    tbody.innerHTML = '';
    if (!list || list.length === 0) {
        const tr = document.createElement('tr');
        tr.className = 'table-empty';
        tr.innerHTML = '<td colspan="8">暂无匹配记录。</td>';
        tbody.appendChild(tr);
        return;
    }

    list.forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;
        tr.innerHTML = `
            <td>${item.id || ''}</td>
            <td>${item.name || ''}</td>
            <td>${item.phone || ''}</td>
            <td>${item.network || '--'}</td>
            <td>${item.joined || ''}</td>
            <td>${item.status || ''}</td>
            <td>${item.note || '--'}</td>
        `;
        tr.addEventListener('click', () => showDetail(item));
        tbody.appendChild(tr);
    });
}

function showDetail(item) {
    const container = document.querySelector('.container');
    const page = container && container.getAttribute('data-page');

    // station 页面专属面板 id=`station-detail`（stations-manage.html 使用）
    const stationPanel = document.getElementById('station-detail');
    const content = document.getElementById('detail-content');
    if (stationPanel && content) {
        const s = item || {};
        const ul = document.createElement('ul');
        ul.className = 'info-list';

        function pushItem(label, value) {
            const li = document.createElement('li');
            li.className = 'info-item';
            const l = document.createElement('div');
            l.className = 'label';
            l.textContent = label;
            const v = document.createElement('div');
            v.className = 'value';
            if (value instanceof Node) v.appendChild(value);
            else v.innerHTML = String(value || '--');
            li.appendChild(l);
            li.appendChild(v);
            ul.appendChild(li);
        }

        pushItem('编号', s.id || '');
        pushItem('名称', s.name || s.id || '');
        pushItem('类型', s.type || (s.manager ? '仓库/门店' : ''));
        pushItem('状态', s.status || '');
        pushItem('负责人', s.manager || s.contact || '');
        pushItem('联系方式', s.contactPhone || s.contact || s.phone || '');
        pushItem('地址', s.address || '');
        pushItem('所属片区', s.area || '');
        pushItem('所属路线', s.routeId || s.route || '');

        const vehiclesNode = document.createElement('div');
        if (Array.isArray(s.vehicles) && s.vehicles.length > 0) {
            vehiclesNode.innerHTML = s.vehicles.map(v => `<a href="car-screen.html?vehicle=${encodeURIComponent(v)}" target="_blank" rel="noopener">${v}</a>`).join('<br>');
        } else if (s.vehicles) {
            vehiclesNode.textContent = String(s.vehicles || '--');
        } else vehiclesNode.textContent = '--';
        pushItem('安排车辆', vehiclesNode);

        // 坐标与在地图中查看链接
        const coord = (s.lng != null && s.lat != null) ? (s.lng + ', ' + s.lat) : (s.location || '--');
        pushItem('坐标', coord);
        const link = document.createElement('div');
        const qk = (s.type && s.type.indexOf('仓库') !== -1) ? 'warehouse' : 'store';
        const targetUrl = `car-screen.html?${qk}=${encodeURIComponent(s.id || '')}`;
        link.innerHTML = `<a href="${targetUrl}" target="_blank" rel="noopener">在地图中查看此站点</a>`;
        pushItem('', link);

        if (s.openingHours) pushItem('营业时间', s.openingHours);
        if (s.capacityInfo) pushItem('容量信息', s.capacityInfo);
        if (s.note) pushItem('备注', s.note);

        content.innerHTML = '';
        content.appendChild(ul);
        stationPanel.setAttribute('aria-hidden', 'false');
        stationPanel.style.transform = 'translateX(0)';
        return;
    }

    // route-manage 页面有专属面板 id=`route-detail`
    if (page === 'route-manage') {
        const panel = document.getElementById('route-detail');
        const routeContent = document.getElementById('detail-content');
        if (!panel || !routeContent) return;

        // 渲染路线详情：支持 id, status, from, to, waypoints, vehicles, createdAt, estimatedDistanceKm, estimatedTimeMin, description
        const r = item || {};
        // subordinate vehicles: prefer r.vehicles array, otherwise lookup from global vehiclesData
        let subs = [];
        if (Array.isArray(r.vehicles)) subs = r.vehicles.slice();
        else {
            // 访问可能不存在的全局变量时要保护性判断，避免 ReferenceError
            const vehiclesGlobal = Array.isArray(window.vehiclesData) ? window.vehiclesData : (Array.isArray(window._vehiclesData) ? window._vehiclesData : (typeof vehiclesData !== 'undefined' && Array.isArray(vehiclesData) ? vehiclesData : []));
            subs = vehiclesGlobal.filter(v => ((v.routeId||v.route||'')+'').includes(r.id || '')).map(v => v.id);
        }

        // 使用 DOM 构建途径点与车辆列表，避免直接 innerHTML 拼接后端自由文本（XSS 风险）
        const waypointsNode = document.createElement('div');
        waypointsNode.innerHTML = '<ul></ul>';
        const waypointsUl = waypointsNode.querySelector('ul');
        if (Array.isArray(r.waypoints) && r.waypoints.length > 0) {
            r.waypoints.forEach((w, i) => {
                const li = document.createElement('li');
                li.textContent = `[${i+1}] ${String(w.lng || '')}, ${String(w.lat || '')}`;
                waypointsUl.appendChild(li);
            });
        } else {
            const li = document.createElement('li'); li.textContent = '--'; waypointsUl.appendChild(li);
        }

        const vehiclesListNode = document.createElement('div');
        if (subs.length > 0) {
            subs.forEach((id, idx) => {
                const a = document.createElement('a');
                a.href = 'car-screen.html?vehicle=' + encodeURIComponent(id);
                a.target = '_blank'; a.rel = 'noopener';
                a.textContent = id;
                vehiclesListNode.appendChild(a);
                if (idx < subs.length - 1) vehiclesListNode.appendChild(document.createElement('br'));
            });
        } else {
            vehiclesListNode.textContent = '--';
        }

        // 使用统一 info-list 渲染路线详情
        const ul = document.createElement('ul');
        ul.className = 'info-list';

        function pushItem(label, value) {
            const li = document.createElement('li');
            li.className = 'info-item';
            const l = document.createElement('div');
            l.className = 'label';
            l.textContent = label;
            const v = document.createElement('div');
            v.className = 'value';
            if (typeof value === 'string') v.innerHTML = value || '--';
            else if (value instanceof Node) v.appendChild(value);
            else v.textContent = String(value || '--');
            li.appendChild(l);
            li.appendChild(v);
            ul.appendChild(li);
        }

        pushItem('路线', r.id || '');
        pushItem('状态', r.status || '正常');
        pushItem('起点', r.from || (r.waypoints && r.waypoints[0] ? (r.waypoints[0].lng + ',' + r.waypoints[0].lat) : ''));
        pushItem('终点', r.to || (r.waypoints && r.waypoints[r.waypoints.length-1] ? (r.waypoints[r.waypoints.length-1].lng + ',' + r.waypoints[r.waypoints.length-1].lat) : ''));

        // 使用之前构建的 DOM 节点代替直接拼接的 HTML 字符串，避免 XSS
        pushItem('途径点', waypointsNode);
        pushItem('下属车辆', ' ');
        pushItem('', vehiclesListNode);

        pushItem('创建时间', r.createdAt || '');
        pushItem('预计里程', r.estimatedDistanceKm != null ? (r.estimatedDistanceKm + ' km') : '--');
        pushItem('预计耗时', r.estimatedTimeMin != null ? (r.estimatedTimeMin + ' min') : '--');
        pushItem('备注', r.description || '');

        const linkNode = document.createElement('div');
        linkNode.innerHTML = `<a href="car-screen.html?route=${encodeURIComponent(r.id||'')}" target="_blank" rel="noopener">在地图中查看此路线</a>`;
        pushItem('', linkNode);

        // 替换内容
        routeContent.innerHTML = '';
        routeContent.appendChild(ul);

        panel.setAttribute('aria-hidden', 'false');
        panel.style.transform = 'translateX(0)';
        return;
    }

    // 其它页面使用通用的 detail-panel（如网格员/订单/车辆任务）
    const panel = document.getElementById('detail-panel');
    const commonContent = document.getElementById('detail-content');
    if (!panel || !commonContent) return;

    // 使用统一 info-list 渲染通用详情
    commonContent.innerHTML = '';
    const ulCommon = document.createElement('ul');
    ulCommon.className = 'info-list';

    function pushCommon(label, value, opts={}){
        const li = document.createElement('li');
        li.className = 'info-item';
        const l = document.createElement('div');
        l.className = 'label';
        l.textContent = label;
        const v = document.createElement('div');
        v.className = 'value';
        // 强调编号、姓名、联系方式
        if (opts.strong) {
            const b = document.createElement('strong');
            b.textContent = value || '--';
            v.appendChild(b);
        } else {
            v.textContent = value || '--';
        }
        if (opts.mono) {
            v.style.fontFamily = '"Times New Roman", monospace';
        }
        li.appendChild(l);
        li.appendChild(v);
        ulCommon.appendChild(li);
    }

    pushCommon('编号', item.id || '', {strong:true, mono:true});
    pushCommon('姓名', item.name || '', {strong:true});
    pushCommon('联系方式', item.phone || '', {strong:true, mono:true});
    pushCommon('所属网格', item.network || '');
    pushCommon('入网时间', item.joined || '');
    pushCommon('状态', item.status || '');
    pushCommon('备注', item.note || '');

    commonContent.appendChild(ulCommon);
    panel.setAttribute('aria-hidden', 'false');
    panel.style.transform = 'translateX(0)';
}

// ---------- 车辆相关的后端交互与详情渲染 ----------
// 从后端拉取车辆列表，返回 Promise，解析为 types.VehicleListResp 结构
function fetchVehicles() {
    // 若全局已存在 vehiclesData，则直接返回它，保持兼容性
    if (Array.isArray(window.vehiclesData) && window.vehiclesData.length > 0) {
        return Promise.resolve(window.vehiclesData);
    }
    // 否则调用后端 API：GET /api/vehicles/staticlist
    return fetch('/api/vehicles/staticlist', { method: 'GET', cache: 'no-store' })
        .then(resp => {
            if (!resp.ok) throw new Error('网络错误: ' + resp.status);
            return resp.json();
        })
        .then(json => {
            // 服务器返回 { vehicles: [...] }
            if (json && Array.isArray(json.vehicles)) {
                // 将结果缓存在 window.vehiclesData 以便其它模块使用（运行时缓存）
                window.vehiclesData = json.vehicles;
                return json.vehicles;
            }
            return [];
        });
}

// 拉取单辆车详情：GET /api/vehicles/detail?id=...
function fetchVehicleDetail(id) {
    if (!id) return Promise.reject(new Error('vehicle id required'));
    return fetch('/api/vehicles/detail?id=' + encodeURIComponent(id), { method: 'GET', cache: 'no-store' })
        .then(resp => {
            if (!resp.ok) throw new Error('网络错误: ' + resp.status);
            return resp.json();
        })
        .then(json => {
            // 期望 { vehicle: {...}, extra: {...} }
            if (json && json.vehicle) return json;
            throw new Error('无效的车辆详情响应');
        });
}

// 从后端拉取路线列表，返回 Promise< RouteInfoResp[] >
// filters 可包含 { routeId, stationId, vehicleId, status }
function fetchRouteList(filters = {}) {
    console.log('[route] fetchRouteList called with filters:', filters);
    const params = new URLSearchParams();
    if (filters.routeId) params.append('routeId', filters.routeId);
    if (filters.stationId) params.append('stationId', filters.stationId);
    if (filters.vehicleId) params.append('vehicleId', filters.vehicleId);
    if (filters.status) params.append('status', filters.status);
    const url = '/api/route/list' + (params.toString() ? ('?' + params.toString()) : '');
    // 使用 GET 调用后端路由列表接口
    return fetch(url, { method: 'GET', cache: 'no-store' })
        .then(resp => {
            if (!resp.ok) throw new Error('网络错误: ' + resp.status);
            return resp.json();
        })
        .then(json => {
            // 兼容多种可能的返回格式，优先取 RouteList 字段
            let list = [];
            if (!json) list = [];
            else if (Array.isArray(json.RouteList)) list = json.RouteList;
            else if (json.data && Array.isArray(json.data.RouteList)) list = json.data.RouteList;
            else if (Array.isArray(json.routeList)) list = json.routeList;
            else if (Array.isArray(json)) list = json;
            console.log('[route] fetchRouteList success, got', list.length, 'items');
            return list;
        })
        .catch(err => {
            console.error('[route] fetchRouteList failed', err);
            // 抛出错误以便调用方可以回退到本地数据
            throw err;
        });
}

// 当用户点击车辆行时打开详情（优先使用后端详情接口）
function openVehicleDetail(id) {
    if (!id) return;
    // 先显示 loading 状态
    const panel = document.getElementById('detail-panel');
    const content = document.getElementById('detail-content');
    if (panel && content) {
        panel.setAttribute('aria-hidden', 'false');
        panel.style.transform = 'translateX(0)';
        content.innerHTML = '<div class="loading">加载中...</div>';
    }
    fetchVehicleDetail(id).then(resp => {
        try {
            const v = resp.vehicle || {};
            const extra = resp.extra || {};
            // 构建详情列表（中文注释）
            const ul = document.createElement('ul');
            ul.className = 'info-list';
            function push(label, value) {
                const li = document.createElement('li');
                li.className = 'info-item';
                const l = document.createElement('div'); l.className = 'label'; l.textContent = label;
                const vdiv = document.createElement('div'); vdiv.className = 'value';
                vdiv.textContent = (value !== undefined && value !== null) ? String(value) : '--';
                li.appendChild(l); li.appendChild(vdiv); ul.appendChild(li);
            }
            push('车辆ID', v.id || v.vehicleId || '');
            push('车牌号', v.plateNumber || '');
            push('车型', v.type || '');
            push('总容量', v.totalCapacity || v.TotalCapacity || '');
            push('电池信息', v.battery || v.batteryInfo || '');
            push('所属路线', v.route || v.routeId || '');
            push('状态', v.status || '');
            push('速度', v.speed || '');
            push('坐标(lng,lat)', (v.lng != null && v.lat != null) ? (v.lng + ',' + v.lat) : (v.location || ''));
            push('创建时间', formatTimeForDisplay(v.createdAt || v.CreatedAt || ''));
            push('更新时间', formatTimeForDisplay(v.updatedAt || v.UpdatedAt || v.UpdatedAt || ''));
            // 展示 extra 信息（如果存在）
            if (extra && Object.keys(extra).length > 0) {
                const li = document.createElement('li'); li.className = 'info-item';
                const l = document.createElement('div'); l.className = 'label'; l.textContent = '扩展信息';
                const vdiv = document.createElement('div'); vdiv.className = 'value';
                vdiv.innerHTML = '<pre style="white-space:pre-wrap; font-size:12px;">' + escapeHtml(JSON.stringify(extra, null, 2)) + '</pre>';
                li.appendChild(l); li.appendChild(vdiv); ul.appendChild(li);
            }
            // 替换内容
            if (content) { content.innerHTML = ''; content.appendChild(ul); }
        } catch (e) {
            if (content) content.innerHTML = '<div class="error">渲染详情失败</div>';
            console.error(e);
        }
    }).catch(err => {
        if (content) content.innerHTML = '<div class="error">获取车辆详情失败: ' + (err && err.message ? escapeHtml(err.message) : '') + '</div>';
        console.error('fetchVehicleDetail failed', err);
    });
}

// 简单的 HTML 转义
function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// 使用统一的 DOMContentLoaded 处理器并保护性地调用各页面初始化

// 暴露 API
window.gridMemberAPI = window.gridMemberAPI || {};

function hideDetail() {
    const panel = document.getElementById('detail-panel');
    if (panel) {
        panel.setAttribute('aria-hidden', 'true');
        panel.style.transform = 'translateX(100%)';
    }
    const routePanel = document.getElementById('route-detail');
    if (routePanel) {
        routePanel.setAttribute('aria-hidden', 'true');
        routePanel.style.transform = 'translateX(100%)';
    }
    const stationPanel = document.getElementById('station-detail');
    if (stationPanel) {
        stationPanel.setAttribute('aria-hidden', 'true');
        stationPanel.style.transform = 'translateX(100%)';
    }
}

// Helper: when navigating to stations-manage with station id, apply filter and open detail
function openStationsAndShowDetail(stationId) {
    try {
        // ensure we're on stations-manage page
        const container = document.querySelector('.container');
        const page = container && container.getAttribute('data-page');
        if (page !== 'stations-manage') return;

        // fill station id filter and call filterStations
        const el = document.getElementById('filter-stationId');
        if (el) {
            el.value = stationId || '';
        }
        // run filter to render the matching station
        filterStations();

        // after rendering, find the table row with this id and open detail
        setTimeout(() => {
            try {
                const tbody = document.getElementById('table-body');
                if (!tbody) return;
                const row = Array.from(tbody.querySelectorAll('tr')).find(r => (r.dataset.id || '') === String(stationId));
                // if not found, try to match first cell text
                let dataItem = null;
                if (row) {
                    // trigger click to open detail
                    row.click();
                    return;
                }
                // fallback: if only one non-empty row, open it
                const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => !r.classList.contains('table-empty'));
                if (rows.length === 1) rows[0].click();
            } catch (e) { console.warn('openStationsAndShowDetail inner failed', e); }
        }, 120);
    } catch (e) { console.warn('openStationsAndShowDetail failed', e); }
}

// Helper for stations-io page: set station filter, run getStationById and try to activate the created tab
function openStationsIOAndShowTab(stationId) {
    try {
        const container = document.querySelector('.container');
        const page = container && container.getAttribute('data-page');
        if (page !== 'stations-io') return;

        const el = document.getElementById('filter-stationId');
        if (el) el.value = stationId || '';
        // run filter to create/activate tab
        try { getStationById(); } catch (e) { /* ignore */ }

        // after rendering, try to ensure the tab/pane is active
        setTimeout(() => {
            try {
                const tabs = document.getElementById('inner-tabs');
                const content = document.getElementById('tab-content');
                if (!tabs || !content) return;
                const rowId = String(stationId || '');
                // find the inner-tab and activate it
                const tab = tabs.querySelector(`.inner-tab[data-id="${rowId}"]`);
                if (tab) {
                    tab.click();
                    // scroll pane into view
                    const pane = content.querySelector(`.tab-pane[data-id="${rowId}"]`);
                    if (pane) pane.scrollIntoView({behavior:'smooth', block:'start'});
                } else {
                    // if no exact data-id match, try to match by label text
                    const maybe = Array.from(tabs.querySelectorAll('.inner-tab')).find(t => (t.textContent||'').includes(rowId));
                    if (maybe) maybe.click();
                }
            } catch (e) { console.warn('openStationsIOAndShowTab inner failed', e); }
        }, 120);
    } catch (e) { console.warn('openStationsIOAndShowTab failed', e); }
}

// Helper: when navigating to route-manage with route id, apply filter and open detail
function openRoutesAndShowDetail(routeId) {
    try {
        const container = document.querySelector('.container');
        const page = container && container.getAttribute('data-page');
        if (page !== 'route-manage') return;

        const el = document.getElementById('filter-routeId');
        if (el) el.value = routeId || '';
        filterRoutes();

        // after rendering, try to open the detail for the route
        setTimeout(() => {
            try {
                const tbody = document.getElementById('table-body');
                if (!tbody) return;
                const row = Array.from(tbody.querySelectorAll('tr')).find(r => (r.dataset.id || '') === String(routeId));
                if (row) { row.click(); return; }
                const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => !r.classList.contains('table-empty'));
                if (rows.length === 1) rows[0].click();
            } catch (e) { console.warn('openRoutesAndShowDetail inner failed', e); }
        }, 120);
    } catch (e) { console.warn('openRoutesAndShowDetail failed', e); }
}

// 暴露的 fetch 接口（占位）
function fetchGridMembers(params = {}) {
    // 实现：调用后端接口 /api/gridMember/list 获取网格员列表并做归一化
    // params 支持 { id, nameOrContact, grid, status, startTime, endTime }
    try {
        const qs = new URLSearchParams();
        if (params.id) qs.set('gridMemberId', params.id);
        if (params.nameOrContact) qs.set('nameOrContact', params.nameOrContact);
        if (params.grid) qs.set('isGridId', params.grid);
        if (params.status) qs.set('status', params.status);
        if (params.startTime) qs.set('startTime', params.startTime);
        if (params.endTime) qs.set('endTime', params.endTime);

        const url = '/api/gridMember/list' + (qs.toString() ? ('?' + qs.toString()) : '');
        return fetch(url, { method: 'GET', cache: 'no-store' })
            .then(resp => {
                if (!resp.ok) return resp.text().then(t => { throw new Error(t || resp.statusText); });
                return resp.json().catch(() => ({}));
            })
            .then(json => {
                // 兼容后端返回结构 types.GridMemberListResp { gridMembersList: [...], total }
                const list = (json && json.gridMembersList) ? json.gridMembersList : (Array.isArray(json) ? json : []);
                // 归一化成前端 renderTable 使用的字段： id,name,phone,network/joined,status,note
                const out = (list || []).map(item => ({
                    id: item.gridMemberId || item.GridMemberId || item.id || '',
                    name: item.gridMemberName || item.GridMemberName || item.name || '',
                    phone: item.gridMemberPhone || item.GridMemberPhone || item.phone || '',
                    network: item.isGridId || item.IsGridId || item.network || '',
                    joined: item.entryTime || item.EntryTime || item.joined || '',
                    status: item.status || item.Status || '',
                    note: item.note || item.Note || ''
                }));
                return out;
            });
    } catch (e) {
        return Promise.reject(e);
    }
}

// 事件绑定
document.addEventListener('DOMContentLoaded', () => {
    // 根据页面根容器上的 data-page 标识初始化对应逻辑，避免根据控件存在与否判断
    const container = document.querySelector('.container');
    const page = container && container.getAttribute('data-page');

    const btnAdd = document.getElementById('btn-add');
    if (btnAdd) btnAdd.addEventListener('click', () => {
        // 针对车辆归档页面，打开创建车辆模态
        if (page === 'car-manage') {
            const modal = document.getElementById('modal-create-vehicle');
            if (modal) {
                modal.style.display = 'block';
                modal.setAttribute('aria-hidden', 'false');
            } else {
                alert('未找到创建车辆模态');
            }
            return;
        }
        // 针对路线管理页面，打开创建路线模态
        if (page === 'route-manage') {
            // 打开我们在 route-manage.html 中新增的模态
            const modal = document.getElementById('modal-create-route');
            if (modal) {
                openCreateRouteModal();
                return;
            } else {
                alert('未找到创建路线模态');
                return;
            }
        }
        // 对其他页面保留占位提示
        if (page === 'gridmember-profile') { 
            const modal = document.getElementById('modal-create-gridMember');
            if (modal) { openCreateGridMemberModal(); } else { alert('未找到创建网格员模态'); }
        }
        else if (page === 'car-tasks') alert('打开新增任务弹窗（占位）');
        else alert('打开新增条目弹窗（占位）');
    });

    const detailClose = document.getElementById('detail-close');
    if (detailClose) detailClose.addEventListener('click', hideDetail);

    // 初始化指定页面
    try {
        if (page === 'gridmember-profile') {
            // 网格员页面：加载列表并绑定筛选
            fetchGridMembers().then(list => renderTable(Array.isArray(list) ? list : [])).catch(err => { console.error(err); renderTable([]); });
        } else if (page === 'orders-manage') {
            // 订单页面：渲染当前可用数据（若无数据则会显示空），并在后台等待 orders 数据以应用 URL 的 status 参数
            try { filterOrders(); } catch (e) { console.error('filterOrders failed', e); }

            // 如果页面包含仓库/门店筛选控件，则初始化并渲染仓库/门店列表（兼容 stations-manage.html 可能将 data-page 设为 orders-manage 的情况）
            try {
                if (document.getElementById('filter-stationId')) {
                    // bind form if present
                    const filterForm = document.getElementById('filterForm');
                    if (filterForm) filterForm.addEventListener('submit', (e)=>{ e.preventDefault(); filterStations(); });
                    try { filterStations(); } catch(e) { console.error('filterStations failed', e); }
                }
            } catch(e) { /* ignore */ }

            // 如果 URL 带有 status 参数，则等待 orders 数据可用后再应用筛选（解决异步加载导致的无结果问题）
            try {
                const params = new URLSearchParams(window.location.search);
                const statusParam = params.get('status');
                if (statusParam) {
                    const applyStatus = function() {
                        try {
                            const select = document.getElementById('filterStatus');
                            if (select) {
                                const decoded = decodeURIComponent(statusParam);
                                let matched = Array.from(select.options).find(o => o.value === statusParam || o.value === decoded || o.text === statusParam || o.text === decoded);
                                if (matched) select.value = matched.value;
                                else select.value = decoded;
                            }
                        } catch(e) { /* ignore */ }
                        try { filterOrders(); } catch(e) { console.error('filterOrders after status param failed', e); }
                    };

                    // Poll for orders data being available
                    let attempts = 0;
                    const maxAttempts = 40; // ~40*150ms = 6s
                    const tid = setInterval(function(){
                        attempts++;
                        const hasOrders = (typeof orders !== 'undefined' && Array.isArray(orders)) || Array.isArray(window.orders) || Array.isArray(window.dataOrders) || Array.isArray(window.dataOrdersList);
                        if (hasOrders || attempts >= maxAttempts) {
                            clearInterval(tid);
                            applyStatus();
                        }
                    }, 150);
                }
            } catch(e) { console.warn('apply status param failed', e); }
        } else if (page === 'route-manage') {
            // 路线管理页面：默认从后端拉取全部路线并渲染，增加控制台日志便于排查
            try {
                console.log('[route-manage] init: requesting backend route list');
                // 先尝试通过后端接口获取全部路线
                if (typeof fetchRouteList === 'function') {
                    fetchRouteList().then(list => {
                        try {
                            // 将后端数据写入运行时缓存，便于 route-scheduling / 其它模块使用
                            window.plannedRoutes = Array.isArray(list) ? list : [];
                            renderRoutes(window.plannedRoutes);
                        } catch (e) {
                            console.error('[route-manage] renderRoutes failed', e);
                            renderRoutes([]);
                        }
                    }).catch(err => {
                        console.warn('[route-manage] fetchRouteList failed, fallback to local plannedRoutes', err);
                        const routes = Array.isArray(window.plannedRoutes) ? window.plannedRoutes : (typeof plannedRoutes !== 'undefined' && Array.isArray(plannedRoutes) ? plannedRoutes : []);
                        renderRoutes(routes);
                    });
                } else {
                    console.warn('[route-manage] fetchRouteList not available, using local plannedRoutes');
                    const routes = Array.isArray(window.plannedRoutes) ? window.plannedRoutes : (typeof plannedRoutes !== 'undefined' && Array.isArray(plannedRoutes) ? plannedRoutes : []);
                    renderRoutes(routes);
                }

                const filterForm = document.getElementById('filterForm');
                if (filterForm) filterForm.addEventListener('submit', (e) => { e.preventDefault(); filterRoutes(); });

                // 如果 URL 含有 route 参数，则在数据渲染后打开详情
                try {
                    const params = new URLSearchParams(window.location.search);
                    const routeParam = params.get('route');
                    if (routeParam) {
                        let decoded = null;
                        try { decoded = decodeURIComponent(routeParam); } catch(e){ decoded = routeParam; }
                        // 延迟尝试打开详情，给异步渲染留出时间
                        setTimeout(() => { try { openRoutesAndShowDetail(decoded); } catch(e) { console.warn('[route-manage] openRoutesAndShowDetail failed', e); } }, 250);
                    }
                } catch(e) { console.warn('route-manage apply param failed', e); }
            } catch (e) { console.error('route-manage init failed', e); }
        } else if (page === 'car-tasks') {
            try { filterTasks(); } catch (e) { console.error('filterTasks failed', e); }
        } else if (page === 'stations-manage') {
            try {
                // bind stations filter form
                const filterForm = document.getElementById('filterForm');
                if (filterForm) filterForm.addEventListener('submit', (e) => { e.preventDefault(); filterStations(); });
                // initial render
                try { filterStations(); } catch (e) { console.error('filterStations failed', e); }

                // if URL contains station param, apply it and open detail
                try {
                    const params = new URLSearchParams(window.location.search);
                    const stationParam = params.get('station');
                    if (stationParam) {
                        let decoded = null;
                        try { decoded = decodeURIComponent(stationParam); } catch(e){ decoded = stationParam; }
                        openStationsAndShowDetail(decoded);
                    }
                } catch(e) { console.warn('stations-manage apply param failed', e); }
            } catch (e) { console.error('stations-manage init failed', e); }
        } else if (page === 'car-manage') {
            try {
                // 不再默认使用静态 data.js 中的 vehiclesData，优先从后端拉取并渲染
                if (typeof fetchVehicles === 'function') {
                    // 显示加载占位
                    const tbody = document.getElementById('table-body');
                    if (tbody) tbody.innerHTML = '<tr class="table-loading"><td colspan="8">加载中……</td></tr>';
                    fetchVehicles().then(remote => {
                        try {
                            // 服务器返回数组或 { vehicles: [...] }
                            const arr = Array.isArray(remote) ? remote : (remote && Array.isArray(remote.vehicles) ? remote.vehicles : []);
                            // 将后端数据写入运行时缓存 window.vehiclesData
                            window.vehiclesData = arr;
                            renderVehicleTable(normalizeVehicles(arr));
                        } catch (e) {
                            console.warn('渲染后端车辆数据失败，回退到本地静态数据', e);
                            // 回退：若存在本地静态数据则使用它
                            // 回退：若存在本地静态私有数据则使用它
                            if (Array.isArray(window._vehiclesData)) renderVehicleTable(normalizeVehicles(window._vehiclesData));
                            else if (Array.isArray(window.vehiclesData)) renderVehicleTable(normalizeVehicles(window.vehiclesData));
                            else renderVehicleTable([]);
                        }
                    }).catch(e => {
                        console.warn('fetchVehicles failed, fallback to local static data', e);
                        // 后端请求失败时，回退到本地静态数据（如果存在）以便调试
                        if (Array.isArray(window._vehiclesData)) renderVehicleTable(normalizeVehicles(window._vehiclesData));
                        else if (Array.isArray(window.vehiclesData)) renderVehicleTable(normalizeVehicles(window.vehiclesData));
                        else renderVehicleTable([]);
                    });
                } else {
                    // 若 fetchVehicles 不可用，则回退使用本地静态数据
                    renderVehicleTable(Array.isArray(window._vehiclesData) ? normalizeVehicles(window._vehiclesData) : (Array.isArray(window.vehiclesData) ? normalizeVehicles(window.vehiclesData) : []));
                }
                // 绑定筛选表单
                const filterForm = document.getElementById('filterForm');
                if (filterForm) filterForm.addEventListener('submit', (e) => { e.preventDefault(); filterCar(); });
            } catch (e) { console.error('car-manage init failed', e); }
            function getQueryParam(name){
                try{ const params = new URLSearchParams(window.location.search); return params.get(name); }catch(e){return null}
            }
            var status = getQueryParam('status');
            if (status) {
                // 允许页面上的 `filterStatus` select 存在时立即填充（当前已在 DOMContentLoaded 回调内）
                try {
                    var sel = document.getElementById('filterStatus');
                    if (sel) {
                        var decoded = null;
                        try { decoded = decodeURIComponent(status); } catch(e){ decoded = status; }
                        var found = Array.from(sel.options).some(function(opt){
                            if (opt.value === status || opt.value === decoded || opt.text === status || opt.text === decoded) { sel.value = opt.value; return true; }
                            return false;
                        });
                        if (!found) sel.value = decoded;
                    }
                } catch (e) { /* ignore */ }

                // 如果车辆数据尚未就绪（异步加载），轮询等待 window.vehiclesData 或 fetchVehicles 出现，随后调用 filterCar
                (function applyFilterWhenReady(){
                    var attempts = 0;
                    var maxAttempts = 40; // ~6s
                    if ((typeof window.vehiclesData !== 'undefined' && Array.isArray(window.vehiclesData)) || (typeof window._vehiclesData !== 'undefined' && Array.isArray(window._vehiclesData)) && typeof filterCar === 'function') {
                        try { filterCar(); } catch(e) { console.warn('filterCar failed', e); }
                        return;
                    }
                    if (typeof fetchVehicles === 'function') {
                        // filterCar already handles async fetchVehicles
                        try { filterCar(); } catch(e) { console.warn('filterCar failed', e); }
                        return;
                    }
                    var tid = setInterval(function(){
                        attempts++;
                        if (((typeof window.vehiclesData !== 'undefined' && Array.isArray(window.vehiclesData)) || (typeof window._vehiclesData !== 'undefined' && Array.isArray(window._vehiclesData))) || typeof fetchVehicles === 'function' || attempts >= maxAttempts) {
                            clearInterval(tid);
                            if (typeof filterCar === 'function') {
                                try { filterCar(); } catch(e) { console.warn('filterCar failed', e); }
                            }
                        }
                    }, 150);
                })();
            }

        }
    } catch (e) {
        console.error('page init failed', e);
    }
});

// Bind stations-io specific form after DOMContentLoaded (if page uses stations-io)
document.addEventListener('DOMContentLoaded', () => {
    try {
        const container = document.querySelector('.container');
        const page = container && container.getAttribute('data-page');
        if (page === 'stations-io') {
            const filterForm = document.getElementById('filterForm');
            if (filterForm) filterForm.addEventListener('submit', (e) => { e.preventDefault(); getStationById(); });
            // if URL contains station param, open the corresponding tab in stations-io
            try {
                const params = new URLSearchParams(window.location.search);
                const stationParam = params.get('station');
                if (stationParam) {
                    let decoded = null;
                    try { decoded = decodeURIComponent(stationParam); } catch(e) { decoded = stationParam; }
                    // use helper to set filter and open the stations-io tab/pane
                    openStationsIOAndShowTab(decoded);
                }
            } catch (e) { /* ignore */ }
        }
    } catch (e) { /* ignore */ }
});

// 渲染车辆表格
function renderVehicleTable(list) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!list || list.length === 0) {
        const tr = document.createElement('tr');
        tr.className = 'table-empty';
        tr.innerHTML = '<td colspan="7">暂无数据，调整筛选或点击右下角“+”添加。</td>';
        tbody.appendChild(tr);
        return;
    }
    list.forEach(v => {
        const tr = document.createElement('tr');
        tr.dataset.id = v.id || '';
        if (v.type != '' || v.type != null || v.type != undefined) {
            if (v.type == 0) typeText = '普通车';
            else if (v.type == 1) typeText = '大型车';
            else if (v.type == 2) typeText = '冷藏车';
            else if (v.type == 3) typeText = '冷冻车';
            else typeText = '未知类型';
        };
        tr.innerHTML = `
            <td>${v.id || ''}</td>
            <td>${typeText}</td>
            <td>${v.status || ''}</td>
            <td>${(v.capacity || v.totalCapacity || v.total_capacity || '') + "m^3"}</td>
            <td>${(v.battery || v.batteryInfo || '') + "%"}</td>
            <td>${v.routeId || v.route || '--'}</td>
            <td>${formatTimeForDisplay(v.createdAt || v.created_at || v.CreatedAt || '')}</td>
            <td><button class="btn-monitor" data-vehicle="${v.id || ''}" title="实时监控">实时监控</button></td>
        `;
        tr.addEventListener('click', () => openVehicleDetail(v.id || v.vehicleId || ''));
        // prevent row click when clicking the monitor button
        const monitorBtn = tr.querySelector('.btn-monitor');
        if (monitorBtn) {
            monitorBtn.addEventListener('click', function(evt){
                evt.stopPropagation();
                const vid = this.getAttribute('data-vehicle');
                if (!vid) return;
                // open car-screen and pass vehicle id as query param in a new tab (noopener)
                const target = 'car-screen.html?vehicle=' + encodeURIComponent(vid);
                try { window.open(target, '_blank', 'noopener'); } catch(e) { window.location.href = target; }
            });
        }
        tbody.appendChild(tr);
    });
}

// 筛选车辆
function filterCar() {
    const id = (document.getElementById('filter-id') && document.getElementById('filter-id').value.trim()) || '';
    const route = (document.getElementById('filter-route') && document.getElementById('filter-route').value.trim()) || '';
    const status = (document.getElementById('filterStatus') && document.getElementById('filterStatus').value) || '';

    // 优先从后端拉取实时数据进行筛选；若后端不可达则回退到本地静态数据
    if (typeof fetchVehicles === 'function') {
        try {
            const res = fetchVehicles();
            if (res && typeof res.then === 'function') {
                res.then(remote => {
                    const arrRaw = Array.isArray(remote) ? remote : (remote && Array.isArray(remote.vehicles) ? remote.vehicles : []);
                    const arr = normalizeVehicles(arrRaw);
                    // 使用与同步分支相同的状态别名匹配
                    const VEHICLE_STATUS_ALIASES = {
                        '配送中': ['配送中', '配送进行中', '运输中', '派送中', '在途'],
                        '在途': ['在途', '配送中'],
                        '空闲': ['空闲', '待命', '闲置'],
                        '充电中': ['充电中', '充电'],
                        '异常': ['异常', '故障', '问题', '待处理']
                    };
                    const matched = arr.filter(v => {
                        const vstatus = (v.status || '') + '';
                        const statusMatch = (function(){
                            if (!status) return true;
                            const aliases = VEHICLE_STATUS_ALIASES[status] || [status];
                            return aliases.some(a => vstatus.includes(a));
                        })();
                        return (id === '' || (v.id || '').includes(id)) &&
                               (route === '' || (v.routeId || '').includes(route)) &&
                               statusMatch;
                    });
                    renderVehicleTable(matched);
                }).catch(err => {
                    console.warn('fetchVehicles failed in filterCar, fallback to local static data', err);
                    // fallback to local static data
                    const dataFallback = Array.isArray(window._vehiclesData) ? normalizeVehicles(window._vehiclesData) : (Array.isArray(window.vehiclesData) ? normalizeVehicles(window.vehiclesData) : []);
                    const matched = dataFallback.filter(v => {
                        const vstatus = (v.status || '') + '';
                        const VEHICLE_STATUS_ALIASES = {
                            '配送中': ['配送中', '运输中', '派送中', '在途'],
                            '在途': ['在途', '配送中'],
                            '空闲': ['空闲', '待命', '闲置'],
                            '充电中': ['充电中', '充电'],
                            '异常': ['异常', '故障', '问题', '待处理']
                        };
                        const statusMatch = (function(){
                            if (!status) return true;
                            const aliases = VEHICLE_STATUS_ALIASES[status] || [status];
                            return aliases.some(a => vstatus.includes(a));
                        })();
                        return (id === '' || (v.id || '').includes(id)) &&
                               (route === '' || (v.routeId || '').includes(route)) &&
                               statusMatch;
                    });
                    renderVehicleTable(matched);
                });
                return;
            }
        } catch (e) {
            console.error('fetchVehicles call failed', e);
        }
    }

    // 如果无法调用后端，则使用本地静态数据作为最终回退
    const data = normalizeVehicles(Array.isArray(window._vehiclesData) ? window._vehiclesData : (Array.isArray(window.vehiclesData) ? window.vehiclesData : []));
    // 支持状态别名匹配（例如页面上的“在途”/“配送中”不同表述）
    const VEHICLE_STATUS_ALIASES = {
        '配送中': ['配送中', '配送进行中', '运输中', '派送中', '在途'],
        '在途': ['在途', '配送中'],
        '空闲': ['空闲', '待命', '闲置'],
        '充电中': ['充电中', '充电'],
        '异常': ['异常', '故障', '问题', '待处理']
    };

    const matched = data.filter(v => {
        const vstatus = (v.status || '') + '';
        const statusMatch = (function(){
            if (!status) return true;
            const aliases = VEHICLE_STATUS_ALIASES[status] || [status];
            return aliases.some(a => vstatus.includes(a));
        })();
        return (id === '' || (v.id || '').includes(id)) &&
               (route === '' || (v.routeId || '').includes(route)) &&
               statusMatch;
    });
    renderVehicleTable(matched);
}

// 路线筛选与渲染（route-manage.html 使用）
function filterRoutes() {
    const routeId = (document.getElementById('filter-routeId') && document.getElementById('filter-routeId').value.trim()) || '';
    const point = (document.getElementById('filter-point') && document.getElementById('filter-point').value.trim()) || '';
    const status = (document.getElementById('filterStatus') && document.getElementById('filterStatus').value) || '';
    const tbody = document.getElementById('table-body');
    if (!tbody) return;

    // 在发起请求前显示加载状态
    tbody.innerHTML = '<tr class="table-loading"><td colspan="8">加载中…</td></tr>';

    // 优先使用后端接口获取并过滤路线数据
    if (typeof fetchRouteList === 'function') {
        fetchRouteList({ routeId: routeId, stationId: point, status: status })
            .then(list => {
                try {
                    // 后端返回 RouteInfoResp[]，renderRoutes 做渲染
                    renderRoutes(list || []);
                } catch (e) {
                    console.error('[route] renderRoutes failed', e);
                    renderRoutes([]);
                }
            })
            .catch(err => {
                console.warn('[route] fetchRouteList failed, fallback to local plannedRoutes if present', err);
                // 回退到页面可能存在的本地全局数据（兼容旧版）
                const routes = Array.isArray(window.plannedRoutes) ? window.plannedRoutes : (Array.isArray(plannedRoutes) ? plannedRoutes : []);
                // 在本地数据上做相同的客户端过滤（保持行为一致）
                const matched = (routes || []).filter(r => {
                    const idMatch = routeId === '' || ((r.id || '') + '').includes(routeId);
                    const pointMatch = point === '' || ((r.waypoints || []).some(w => (String(w.lng) + ',' + String(w.lat)).includes(point)) || (r.from || '').includes(point) || (r.to || '').includes(point));
                    const routeStatus = (r.status || '正常') + '';
                    const statusMatch = status === '' || routeStatus.includes(status);
                    return idMatch && pointMatch && statusMatch;
                });
                renderRoutes(matched);
            });
        return;
    }

    // 若没有后端接口，回退到本地数据
    const routes = Array.isArray(window.plannedRoutes) ? window.plannedRoutes : (Array.isArray(plannedRoutes) ? plannedRoutes : []);
    const matched = routes.filter(r => {
        const idMatch = routeId === '' || ((r.id || '') + '').includes(routeId);
        const pointMatch = point === '' || ((r.waypoints || []).some(w => (String(w.lng) + ',' + String(w.lat)).includes(point)) || (r.from || '').includes(point) || (r.to || '').includes(point));
        const routeStatus = (r.status || '正常') + '';
        const statusMatch = status === '' || routeStatus.includes(status);
        return idMatch && pointMatch && statusMatch;
    });

    renderRoutes(matched);
}

function renderRoutes(list) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!list || list.length === 0) {
        const tr = document.createElement('tr');
        tr.className = 'table-empty';
        tr.innerHTML = '<td colspan="8">暂无匹配记录。</td>';
        tbody.appendChild(tr);
        return;
    }

    // 将后端返回的 RouteInfoResp 规范化为前端可用字段，兼容大小写及不同格式
    function normalizeRoute(src) {
        const o = src || {};
        const id = o.routeId || o.RouteId || o.id || o.Route || '';
        const status = (o.status || o.Status || '正常') + '';
        const from = o.startStation || o.StartStation || o.from || o.From || '';
        const to = o.endStation || o.EndStation || o.to || o.To || '';
        // passStations 可能是数组、null 或逗号分隔字符串
        let passStations = [];
        if (Array.isArray(o.passStations)) passStations = o.passStations.slice();
        else if (Array.isArray(o.PassStations)) passStations = o.PassStations.slice();
        else if (typeof o.passStations === 'string' && o.passStations.trim() !== '') {
            try { passStations = JSON.parse(o.passStations); if (!Array.isArray(passStations)) passStations = o.passStations.split(',').map(s=>s.trim()).filter(Boolean); } catch(e){ passStations = o.passStations.split(',').map(s=>s.trim()).filter(Boolean); }
        } else if (typeof o.PassStations === 'string' && o.PassStations.trim() !== '') {
            try { passStations = JSON.parse(o.PassStations); if (!Array.isArray(passStations)) passStations = o.PassStations.split(',').map(s=>s.trim()).filter(Boolean); } catch(e){ passStations = o.PassStations.split(',').map(s=>s.trim()).filter(Boolean); }
        }
        // passVehicles similar
        let passVehicles = [];
        if (Array.isArray(o.passVehicles)) passVehicles = o.passVehicles.slice();
        else if (Array.isArray(o.PassVehicles)) passVehicles = o.PassVehicles.slice();
        else if (typeof o.passVehicles === 'string' && o.passVehicles.trim() !== '') {
            try { passVehicles = JSON.parse(o.passVehicles); if (!Array.isArray(passVehicles)) passVehicles = o.passVehicles.split(',').map(s=>s.trim()).filter(Boolean); } catch(e){ passVehicles = o.passVehicles.split(',').map(s=>s.trim()).filter(Boolean); }
        } else if (typeof o.PassVehicles === 'string' && o.PassVehicles.trim() !== '') {
            try { passVehicles = JSON.parse(o.PassVehicles); if (!Array.isArray(passVehicles)) passVehicles = o.PassVehicles.split(',').map(s=>s.trim()).filter(Boolean); } catch(e){ passVehicles = o.PassVehicles.split(',').map(s=>s.trim()).filter(Boolean); }
        }
        const createdAt = o.createTime || o.CreateTime || o.createdAt || o.created_at || '';
        const distanceRaw = (o.distance != null && o.distance !== '') ? Number(o.distance) : (o.Distance != null && o.Distance !== '' ? Number(o.Distance) : (o.estimatedDistanceKm != null ? Number(o.estimatedDistanceKm) * 1000 : null));
        const distanceKm = (distanceRaw != null && !isNaN(distanceRaw)) ? (distanceRaw / 1000) : null;
        const note = o.note || o.Note || o.description || '';
        return { id, status, from, to, passStations, passVehicles, createdAt, distanceKm, note, raw: o };
    }

    // helper to find vehicles assigned to route (safe access)
    const vehiclesGlobal = Array.isArray(window.vehiclesData) ? window.vehiclesData : (Array.isArray(window._vehiclesData) ? window._vehiclesData : ((typeof vehiclesData !== 'undefined' && Array.isArray(vehiclesData)) ? vehiclesData : []));

    list.forEach(rsrc => {
        const r = normalizeRoute(rsrc);
        const tr = document.createElement('tr');
        tr.dataset.id = r.id || '';

        // compute subordinate vehicles count: prefer passVehicles, otherwise lookup from global vehicles
        let subsCount = 0;
        if (Array.isArray(r.passVehicles) && r.passVehicles.length > 0) subsCount = r.passVehicles.length;
        else if (r.id) subsCount = vehiclesGlobal.filter(v => ((v.routeId||v.route||'')+'').includes(r.id)).length;

        // 途径点展示为逗号/换行分隔的站点编号
        const midPoints = (Array.isArray(r.passStations) && r.passStations.length > 0) ? r.passStations.map(s => escapeHtml(String(s))).join('<br>') : '--';

        const fromText = escapeHtml(r.from || '');
        const toText = escapeHtml(r.to || '');
        const createdText = formatTimeForDisplay(r.createdAt || '');
        const distText = (r.distanceKm != null && !isNaN(r.distanceKm)) ? (Number(r.distanceKm).toFixed(2) + ' km') : '';

        tr.innerHTML = `
            <td>${escapeHtml(r.id)}</td>
            <td>${escapeHtml(r.status || '正常')}</td>
            <td>${fromText}</td>
            <td>${toText}</td>
            <td>${midPoints}</td>
            <td>${escapeHtml(String(subsCount))}</td>
            <td>${escapeHtml(createdText)}</td>
            <td>${escapeHtml(distText)}</td>
        `;

        // stop propagation on any links inside row (if present)
        const links = tr.querySelectorAll('.link-to-map, .link-to-station, .link-to-route');
        links.forEach(a => a.addEventListener('click', function(evt){ evt.stopPropagation(); }));
        // 点击行打开详情，传入已经规范化的 route 对象（而不是原始 raw），避免字段名不一致导致显示为空
        tr.addEventListener('click', () => showDetail(r));
        tbody.appendChild(tr);
    });
}

// 规范化车辆数据：支持 map 或数组项
function normalizeVehicles(src) {
    if (!src) return [];
    // helper: 将 ISO/UTC 时间字符串转换为北京时间（东八区）并格式化为 `YYYY-MM-DD HH:mm:ss`
    function utcToBeijing(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            if (isNaN(d)) return iso;
            // 取得自纪元以来的毫秒数（UTC），加上 8 小时
            const beijingMs = d.getTime() + 8 * 3600 * 1000;
            const b = new Date(beijingMs);
            // 使用 UTC 方法读取，这样不会再被本机时区影响，得到的 UTC 分量即为北京时间分量
            const Y = b.getUTCFullYear();
            const M = String(b.getUTCMonth() + 1).padStart(2, '0');
            const D = String(b.getUTCDate()).padStart(2, '0');
            const h = String(b.getUTCHours()).padStart(2, '0');
            const m = String(b.getUTCMinutes()).padStart(2, '0');
            const s = String(b.getUTCSeconds()).padStart(2, '0');
            return `${Y}-${M}-${D} ${h}:${m}:${s}`;
        } catch (e) {
            return iso;
        }
    }
    if (Array.isArray(src)) return src.map(item => ({
        id: item.id || item.vehicleId || item.carId || '',
        plateNumber: item.plateNumber || item.plate || '',
        type: item.type || item.vehicleType || '',
        status: item.status || item.state || '',
        capacity: item.capacity || item.totalCapacity || item.loadCapacity || '',
        totalCapacity: item.totalCapacity || item.capacity || '',
        battery: item.battery || item.batteryInfo || item.batteryLevel || '',
        routeId: item.routeId || item.route || '',
        // 将后端返回的 UTC 时间字符串转换为北京时间并格式化
        createdAt: formatTimeForDisplay(item.createdAt || item.addedAt || item.CreatedAt || ''),
        updatedAt: formatTimeForDisplay(item.updatedAt || item.updatedAt || item.UpdatedAt || '')
    }));
    // 如果是对象 map：将其 values 转为数组
    if (typeof src === 'object') {
        return Object.keys(src).map(k => {
            const item = src[k] || {};
            return {
                id: item.id || k,
                plateNumber: item.plateNumber || item.plate || '',
                type: item.type || '',
                status: item.status || '',
                capacity: item.capacity || item.totalCapacity || '',
                totalCapacity: item.totalCapacity || item.capacity || '',
                battery: item.battery || item.batteryInfo || '',
                routeId: item.routeId || item.route || '' ,
                createdAt: formatTimeForDisplay(item.createdAt || item.CreatedAt || '')
            };
        });
    }
    return [];
}

// 仓库/门店筛选与渲染（stations-manage.html 使用）
function filterStations() {
    const chkWarehouse = document.querySelector('input[type=checkbox][data-type="warehouse"]');
    const chkStore = document.querySelector('input[type=checkbox][data-type="store"]');
    const id = (document.getElementById('filter-stationId') && document.getElementById('filter-stationId').value.trim()) || '';
    const area = (document.getElementById('filter-area') && document.getElementById('filter-area').value.trim()) || '';
    const status = (document.getElementById('filterStatus') && document.getElementById('filterStatus').value) || '';

    const wantWarehouse = !chkWarehouse || chkWarehouse.checked;
    const wantStore = !chkStore || chkStore.checked;

    let list = [];
    if (wantWarehouse && Array.isArray(window.WAREHOUSES)) list = list.concat(window.WAREHOUSES.map(w => Object.assign({type: '仓库'}, w)));
    if (wantStore && Array.isArray(window.STORES)) list = list.concat(window.STORES.map(s => Object.assign({type: '门店'}, s)));

    const matched = list.filter(item => {
        if (!item) return false;
        if (id && !(String(item.id || '').includes(id))) return false;
        if (area && !(String(item.area || item.name || item.address || '').includes(area))) return false;
        if (status && status !== '' && String(item.status || '') !== status) return false;
        return true;
    });

    renderWarehouseTable(matched);
}

function renderWarehouseTable(list) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!list || list.length === 0) {
        const tr = document.createElement('tr');
        tr.className = 'table-empty';
        tr.innerHTML = '<td colspan="4">暂无匹配记录。</td>';
        tbody.appendChild(tr);
        return;
    }

    list.forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id || '';
        const manager = item.manager || item.contact || '';
        const contact = item.contactPhone || item.contact || item.phone || '';
        const route = item.routeId || item.route || '';
        const vehicles = (Array.isArray(item.vehicles) && item.vehicles.length > 0) ? item.vehicles.map(v => `<a href="car-screen.html?vehicle=${encodeURIComponent(v)}" target="_blank" rel="noopener">${v}</a>`).join('<br>') : (item.vehicles || '--');

        tr.innerHTML = `
            <td>${item.id || ''}</td>
            <td>${item.type || ''}</td>
            <td>${item.status || ''}</td>
            <td>${manager}</td>
            <td>${contact}</td>
            <td>${route ? `<a href="route-manage.html?route=${encodeURIComponent(route)}" class="link-to-route" target="_self">${route}</a>` : ''}</td>
            <td>${vehicles}</td>
            <td><a href="stations-io.html?station=${encodeURIComponent(item.id || '')}" class="link-to-io" target="_self" style="color: cornflowerblue;">出入管理</a></td>
        `;

        tr.addEventListener('click', () => showDetail(item));
        // prevent row click when clicking map, station or route links
        const links = tr.querySelectorAll('.link-to-map, .link-to-station, .link-to-route');
        links.forEach(a => a.addEventListener('click', function(evt){ evt.stopPropagation(); }));
        tbody.appendChild(tr);
    });
}

// 页面内子标签页：创建或激活指定站点的 tab
function createOrActivateTab(item) {
    if (!item) return null;
    const tabs = document.getElementById('inner-tabs');
    const content = document.getElementById('tab-content');
    if (!tabs || !content) return null;

    const id = String(item.id || item.stationId || item.code || '');
    if (!id) return null;

    // 如果已有 tab，激活它
    let existing = tabs.querySelector(`.inner-tab[data-id="${id}"]`);
    // 取消其它 tab 的 active
    Array.from(tabs.querySelectorAll('.inner-tab')).forEach(t => t.classList.remove('active'));
    Array.from(content.querySelectorAll('.tab-pane')).forEach(p => p.classList.remove('active'));

    if (existing) {
        existing.classList.add('active');
        const pane = content.querySelector(`.tab-pane[data-id="${id}"]`);
        if (pane) pane.classList.add('active');
        return existing;
    }

    // 创建新 tab
    const tab = document.createElement('div');
    tab.className = 'inner-tab active';
    tab.dataset.id = id;
    tab.title = item.name || id;
    tab.innerHTML = `<span class="tab-label">${item.name || id}</span><span class="close-x">&times;</span>`;

    // 关闭按钮
    tab.querySelector('.close-x').addEventListener('click', (e) => {
        e.stopPropagation();
        const id = tab.dataset.id;
        const pane = content.querySelector(`.tab-pane[data-id="${id}"]`);
        if (pane) pane.remove();
        tab.remove();
        // activate last tab if any
        const last = tabs.querySelector('.inner-tab');
        if (last) { last.classList.add('active'); const lastPane = content.querySelector(`.tab-pane[data-id="${last.dataset.id}"]`); if (lastPane) lastPane.classList.add('active'); }
    });

    tab.addEventListener('click', () => {
        Array.from(tabs.querySelectorAll('.inner-tab')).forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        Array.from(content.querySelectorAll('.tab-pane')).forEach(p => p.classList.remove('active'));
        let pane = content.querySelector(`.tab-pane[data-id="${id}"]`);
        if (pane) pane.classList.add('active');
    });

    tabs.appendChild(tab);

    // create content pane
    const pane = document.createElement('div');
    pane.className = 'tab-pane active';
    pane.dataset.id = id;
    pane.innerHTML = renderTabContent(item);
    content.appendChild(pane);

    // bind interactions inside the pane
    // order row click -> showDetail for that order id (lookup in global orders)
    pane.addEventListener('click', function(e){
        const tr = e.target.closest && e.target.closest('tr[data-id]');
        if (!tr) return;
        const oid = tr.dataset.id;
        if (!oid) return;
        const ordersSrc = Array.isArray(window.orders) ? window.orders : (Array.isArray(window.dataOrders) ? window.dataOrders : (Array.isArray(orders) ? orders : []));
        const found = (ordersSrc || []).find(o => String(o.id) === String(oid));
        if (found) {
            showDetail(found);
        }
    });

    // open-full link: 跳转到仓库/门店档案页面并传递 station 参数（页面会处理筛选并打开详情）
    const openFull = pane.querySelector('.open-full');
    if (openFull) {
        openFull.addEventListener('click', function(e){
            e.preventDefault();
            try {
                const sid = encodeURIComponent(String(item.id || item.stationId || item.code || ''));
                if (sid) {
                    // navigate in same tab so stations-manage can read URL param and open detail
                    window.location.href = 'stations-manage.html?station=' + sid;
                }
            } catch (err) {
                console.warn('open-full navigation failed', err);
            }
        });
    }

    return tab;
}

function renderTabContent(item) {
    const s = item || {};
    // Build a richer tab pane: header/meta + orders table
    const escape = (v) => v == null ? '' : String(v);
    const headerHtml = `
        <div class="station-header">
            <div>
                <div class="station-meta">
                    <div>编号: ${escape(s.id || '')}</div>
                    <div>类型: ${escape(s.type || '')}</div>
                    <div>负责人: ${escape(s.manager || s.contact || '')}</div>
                    <div>电话: ${escape(s.contactPhone || s.phone || '')}</div>
                </div>
            </div>
            <div style="text-align:right">
                <div style="color:var(--gray-medium)">地址: ${escape(s.address || '')}</div>
                <div style="margin-top:6px"><a href="#" class="open-full" data-id="${escape(s.id || '')}">打开完整档案</a></div>
            </div>
        </div>
    `;

    // find related orders from global orders array (data.js)
    const ordersSrc = Array.isArray(window.orders) ? window.orders : (Array.isArray(window.dataOrders) ? window.dataOrders : (Array.isArray(orders) ? orders : []));
    const related = (Array.isArray(ordersSrc) ? ordersSrc.filter(o => (o.warehouseId || o.warehouse || '') === (s.id || '') || (o.toWarehouseId || o.toWarehouse || '') === (s.id || '')) : []);

    const renderStatus = (st) => {
        if (!st) return `<span class="badge status-pending">未知</span>`;
        if (/(完成|签收|已签收)/.test(st)) return `<span class="badge status-complete">${st}</span>`;
        if (/(配送中|在途|运输)/.test(st)) return `<span class="badge status-inprogress">${st}</span>`;
        if (/(待取件|待配送|待取)/.test(st)) return `<span class="badge status-pending">${st}</span>`;
        return `<span class="badge status-pending">${st}</span>`;
    };

    let ordersHtml = '';
    if (!related || related.length === 0) {
        ordersHtml = '<div class="no-data">暂无出入库订单记录。</div>';
    } else {
        ordersHtml = `
            <table class="orders-table" aria-label="orders">
                <thead><tr><th>订单号</th><th>状态</th><th>类型</th><th>车辆</th><th>路线</th><th>网格员</th><th>时间</th></tr></thead>
                <tbody>
                ${related.map(o => {
                    const vid = escape(o.vehicleId || o.carId || '');
                    const route = escape(o.routeId || '');
                    const gm = escape(o.gridMemberId || o.courierId || '');
                    const time = escape(o.startTime || o.createdAt || o.start || '');
                    return `<tr data-id="${escape(o.id)}">
                        <td>${escape(o.id)}</td>
                        <td>${renderStatus(escape(o.status))}</td>
                        <td>${escape(o.type || '')}</td>
                        <td>${vid ? `<a href="car-screen.html?vehicle=${encodeURIComponent(vid)}" target="_blank" rel="noopener">${vid}</a>` : '--'}</td>
                        <td>${route ? `<a href="route-manage.html?route=${encodeURIComponent(route)}" target="_self">${route}</a>` : '--'}</td>
                        <td>${gm || '--'}</td>
                        <td>${time}</td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>
        `;
    }

    const section = `
        <div class="orders-section">
            ${ordersHtml}
        </div>
    `;

    return headerHtml + section;
}

// ----------------- 新增车辆：前端表单处理与后端联通 -----------------
// 关闭创建车辆模态
function closeCreateVehicleModal() {
    const modal = document.getElementById('modal-create-vehicle');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

// 打开创建车辆模态（外部可调用）
function openCreateVehicleModal() {
    const modal = document.getElementById('modal-create-vehicle');
    if (!modal) return;
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    // 自动聚焦到车辆 ID 字段，提升可用性
    // 聚焦到第一个输入框（车牌号）以提升可用性
    try { const el = document.getElementById('cv-plateNumber') || document.getElementById('cv-type'); if (el) { setTimeout(() => el.focus(), 50); } } catch(e) {}
}

// 辅助：显示短暂提示（页面内）
function showToast(msg, duration = 3000) {
    // 简单实现：使用 alert 作为回退
    try {
        const t = document.createElement('div');
        t.className = 'simple-toast';
        t.textContent = msg;
        Object.assign(t.style, {position:'fixed',left:'50%',bottom:'20px',transform:'translateX(-50%)',background:'#333',color:'#fff',padding:'8px 12px',borderRadius:'4px',zIndex:2000});
        document.body.appendChild(t);
        setTimeout(() => t.remove(), duration);
    } catch (e) {
        alert(msg);
    }
}

// ----------------- 新增路线：前端表单与后端联通 -----------------
// 打开创建路线模态
function openCreateRouteModal(){
    const modal = document.getElementById('modal-create-route');
    if (!modal) return;
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    try { const el = document.getElementById('cr-routeId') || document.getElementById('cr-from'); if (el) setTimeout(()=>el.focus(),50); } catch(e){}
}

// 关闭创建路线模态
function closeCreateRouteModal(){
    const modal = document.getElementById('modal-create-route');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

// 绑定创建路线表单行为：提交到后端 /api/route/create（假设）
function bindCreateRouteForm(){
    const form = document.getElementById('createRouteForm');
    const modal = document.getElementById('modal-create-route');
    if (!form || !modal) return;

    // 关闭按钮
    const btnClose = document.getElementById('modal-close');
    if (btnClose) btnClose.addEventListener('click', closeCreateRouteModal);
    const btnCancel = document.getElementById('cv-cancel');
    if (btnCancel) btnCancel.addEventListener('click', closeCreateRouteModal);
    // 点击遮罩关闭
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeCreateRouteModal);
    // 按 ESC 关闭模态
    document.addEventListener('keydown', function onEsc(e){ if (e.key === 'Escape') { closeCreateRouteModal(); } });

    form.addEventListener('submit', function(ev){
        ev.preventDefault();
        // 收集表单数据并做基础校验
        const routeId = (document.getElementById('cr-routeId') && document.getElementById('cr-routeId').value.trim()) || '';
        const from = (document.getElementById('cr-from') && document.getElementById('cr-from').value.trim()) || '';
        const to = (document.getElementById('cr-to') && document.getElementById('cr-to').value.trim()) || '';
        const passStations = (document.getElementById('cr-passStations') && document.getElementById('cr-passStations').value.trim()) || '';
        const passVehicles = (document.getElementById('cr-passVehicles') && document.getElementById('cr-passVehicles').value.trim()) || '';
        const distanceKm = (document.getElementById('cr-distanceKm') && document.getElementById('cr-distanceKm').value) || '';
        const note = (document.getElementById('cr-note') && document.getElementById('cr-note').value.trim()) || '';

        // 简单校验：必须有起点和终点
        if (!from || !to) { showToast('请填写起点和终点'); return; }

        // 构造请求体，严格对应后端 RouteCreateInfo 定义。
        // 注意：RouteCreateInfo 中 routeId 不是创建请求的一部分（后端会生成 routeId），
        //       对于可选字段（passStations/passVehicles/distance/note）仅在非空时包含，避免发送空数组或 undefined 导致后端解析困扰。
        const payload = {
            // 必填
            startStation: from,
            endStation: to
        };

        // 可选：途径站点（数组），仅在输入非空时添加
        if (passStations) {
            const arr = passStations.split(',').map(s=>s.trim()).filter(Boolean);
            if (arr.length > 0) payload.passStations = arr;
        }

        // 可选：下属车辆（数组），仅在输入非空时添加
        if (passVehicles) {
            const arr = passVehicles.split(',').map(s=>s.trim()).filter(Boolean);
            if (arr.length > 0) payload.passVehicles = arr;
        }

        // 可选：距离（米），若用户填写里程则转换为整数米并添加
        if (distanceKm !== '' && !isNaN(Number(distanceKm))) {
            const meters = Math.round(Number(distanceKm) * 1000);
            if (!isNaN(meters)) payload.distance = meters;
        }

        // 可选：备注
        if (note) payload.note = note;

        const submitBtn = document.getElementById('cr-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '提交中…'; }

        console.log('[route] creating route with payload:', payload);
        // 使用 createRoute 统一创建路线，便于复用与将来扩展
        createRoute(payload).then(json => {
            console.log('[route] create response', json);
            closeCreateRouteModal();
            showToast('创建成功');
            // 刷新列表
            if (typeof fetchRouteList === 'function') {
                fetchRouteList().then(list => { window.plannedRoutes = Array.isArray(list) ? list : []; renderRoutes(window.plannedRoutes); }).catch(e=>{ console.warn('[route] refresh after create failed', e); });
            } else {
                // 若无后端接口，尝试在本地添加并渲染
                try { window.plannedRoutes = Array.isArray(window.plannedRoutes) ? window.plannedRoutes : []; window.plannedRoutes.unshift(payload); renderRoutes(window.plannedRoutes); } catch(e){}
            }
        }).catch(err => {
            console.error('[route] create failed', err);
            showToast('创建失败：' + (err && err.message ? err.message : String(err)));
        }).finally(()=>{ if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '创建'; } });
    });
}

// 绑定创建路线表单（尝试立即绑定，如果 DOMContentLoaded 后再绑定）
try { document.addEventListener('DOMContentLoaded', bindCreateRouteForm); } catch(e) { setTimeout(bindCreateRouteForm, 200); }

// 处理表单提交：构造请求并 POST 到后端 /api/vehicles
function bindCreateVehicleForm() {
    const form = document.getElementById('createVehicleForm');
    const modal = document.getElementById('modal-create-vehicle');
    if (!form || !modal) return;

    // 关闭按钮
    const btnClose = document.getElementById('modal-close');
    if (btnClose) btnClose.addEventListener('click', closeCreateVehicleModal);
    const btnCancel = document.getElementById('cv-cancel');
    if (btnCancel) btnCancel.addEventListener('click', closeCreateVehicleModal);
    // 点击遮罩关闭
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeCreateVehicleModal);
    // 按 ESC 关闭模态
    document.addEventListener('keydown', function onEsc(e){ if (e.key === 'Escape') { closeCreateVehicleModal(); } });

    form.addEventListener('submit', function(ev){
        ev.preventDefault();
        // 收集表单字段（与 service.api 中 CreateVehicleReq 对应）
        // 注意：vehicleId 由后端自动生成，前端不发送 vehicleId
        const plateNumber = (document.getElementById('cv-plateNumber') && document.getElementById('cv-plateNumber').value.trim()) || '';
        const typeRaw = (document.getElementById('cv-type') && document.getElementById('cv-type').value) || '';
        const totalCapacityRaw = (document.getElementById('cv-totalCapacity') && document.getElementById('cv-totalCapacity').value.trim()) || '';
        const batteryInfoRaw = (document.getElementById('cv-batteryInfo') && document.getElementById('cv-batteryInfo').value.trim()) || '';
        const routeId = (document.getElementById('cv-routeId') && document.getElementById('cv-routeId').value.trim()) || '';
        const extra = (document.getElementById('cv-extra') && document.getElementById('cv-extra').value.trim()) || '';

        // 必填校验并转换为整数：type、totalCapacity、batteryInfo
        const typeInt = parseInt(typeRaw, 10);
        const totalCapacityInt = parseInt(totalCapacityRaw, 10);
        const batteryInfoInt = parseInt(batteryInfoRaw, 10);
        if (isNaN(typeInt)) { showToast('请选择车型（必填）'); if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '创建'; } return; }
        if (isNaN(totalCapacityInt)) { showToast('请输入总容量（整数，必填）'); if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '创建'; } return; }
        if (isNaN(batteryInfoInt)) { showToast('请输入电池信息（整数 0-100，必填）'); if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '创建'; } return; }

        // 构造请求体（整数字段按后端定义）
        const payload = {
            type: typeInt,
            totalCapacity: totalCapacityInt,
            batteryInfo: batteryInfoInt,
        };
        if (plateNumber) payload.plateNumber = plateNumber;
        if (routeId) payload.routeId = routeId;
        if (extra) payload.extra = extra;

        // 禁用提交按钮防止重复提交
        const submitBtn = document.getElementById('cv-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '提交中…'; }

        // 使用 createVehicle 封装进行请求，便于复用
        createVehicle(payload).then(json => {
            // 成功：关闭模态并提示，尝试刷新列表
            closeCreateVehicleModal();
            showToast('创建成功');
            try { if (typeof fetchVehicles === 'function') fetchVehicles().then(remote => { window.vehiclesData = Array.isArray(remote) ? remote : (remote && Array.isArray(remote.vehicles) ? remote.vehicles : []); renderVehicleTable(normalizeVehicles(window.vehiclesData)); }).catch(()=>{ if (typeof filterCar === 'function') filterCar(); }); else if (typeof filterCar === 'function') filterCar(); } catch(e) { console.warn('刷新车辆列表失败', e); }
        }).catch(err => {
            console.error('创建车辆失败', err);
            showToast('创建车辆失败：' + (err && err.message ? err.message : String(err)));
        }).finally(() => {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '创建'; }
        });
    });
}

// 尝试立即绑定创建表单（若 DOM 已加载）
try { document.addEventListener('DOMContentLoaded', bindCreateVehicleForm); } catch(e) { setTimeout(bindCreateVehicleForm, 200); }


// ----------------- 新增网格员：前端表单与后端联通 -----------------
// 打开创建网格员模态（外部可调用）
function openCreateGridMemberModal() {
    const modal = document.getElementById('modal-create-gridMember');
    if (!modal) return;
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    try { const el = document.getElementById('gridMemberName'); if (el) setTimeout(()=>el.focus(),50); } catch(e){}
}

// 关闭创建网格员模态
function closeCreateGridMemberModal() {
    const modal = document.getElementById('modal-create-gridMember');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

// 创建网格员的高层封装（返回 Promise）
function createGridMember(payload){
    return postCreateResource('/api/gridMember/create', payload);
}

// 绑定创建网格员表单：将前端字段映射到后端 types.GridMemberCreateInfo，兼容 optional 字段
function bindCreateGridMemberForm(){
    const form = document.getElementById('createGridMemberForm');
    const modal = document.getElementById('modal-create-gridMember');
    if (!form || !modal) return;

    // 关闭按钮（模态中的通用 id 为 modal-close）
    const btnClose = document.getElementById('modal-close');
    if (btnClose) btnClose.addEventListener('click', closeCreateGridMemberModal);
    const btnCancel = document.getElementById('cv-cancel');
    if (btnCancel) btnCancel.addEventListener('click', closeCreateGridMemberModal);
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeCreateGridMemberModal);
    document.addEventListener('keydown', function onEsc(e){ if (e.key === 'Escape') { closeCreateGridMemberModal(); } });

    form.addEventListener('submit', function(ev){
        ev.preventDefault();

        // 收集字段并进行基础校验（姓名为必填，其它字段可选）
        const nameEl = document.getElementById('gridMemberName');
        const phoneEl = document.getElementById('gridMemberPhone');
        const gridEl = document.getElementById('isGridId');
        const statusEl = document.getElementById('status');
        const noteEl = document.getElementById('note');

        const gridMemberName = nameEl && nameEl.value.trim();
        const gridMemberPhone = phoneEl && phoneEl.value.trim();
        const isGridId = gridEl && gridEl.value;
        const status = statusEl && statusEl.value;
        const note = noteEl && noteEl.value.trim();

    if (!gridMemberName) { showToast('请填写姓名（必填）'); return; }
    if (!gridMemberPhone) { showToast('请填写联系方式（必填）'); return; }

        // 构造 payload：仅在值存在时包含可选字段，保证与后端 types.GridMemberCreateInfo 的 optional 兼容
        const payload = { gridMemberName: gridMemberName };
        if (gridMemberPhone) payload.gridMemberPhone = gridMemberPhone;
        if (isGridId) payload.isGridId = isGridId;
        if (status) payload.status = status;
        if (note) payload.note = note;

        const submitBtn = document.getElementById('cv-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '提交中…'; }

        createGridMember(payload).then(json => {
            console.log('[gridmember] create response', json);
            closeCreateGridMemberModal();
            showToast('创建成功');
            // 尝试刷新网格员列表：如果存在 filterGridMember 或后端 list 接口，触发刷新
            try { if (typeof filterGridMember === 'function') filterGridMember(); else { console.log('请手动刷新网格员列表'); } } catch(e){}
        }).catch(err => {
            console.error('[gridmember] create failed', err);
            showToast('创建失败：' + (err && err.message ? err.message : String(err)));
        }).finally(()=>{ if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '创建'; } });
    });
}

// 尝试立即绑定创建表单（若 DOM 已加载）
try { document.addEventListener('DOMContentLoaded', bindCreateGridMemberForm); } catch(e) { setTimeout(bindCreateGridMemberForm, 200); }


// 在 stations-io 页面使用的筛选函数：查找 WAREHOUSES/STORES 并创建/切换标签页
function getStationById() {
    const input = document.getElementById('filter-stationId');
    if (!input) return;
    const id = input.value.trim();
    if (!id) return;

    // If we're on route-scheduling page, allow searching plannedRoutes by route id
    const container = document.querySelector('.container');
    const page = container && container.getAttribute('data-page');
    if (page === 'route-scheduling'){
        const routes = Array.isArray(window.plannedRoutes) ? window.plannedRoutes : [];
        // find exact or includes match on route id
        const foundRoute = routes.find(r => String(r.id || '').toLowerCase() === id.toLowerCase() || String(r.id || '').toLowerCase().includes(id.toLowerCase()));
        if (foundRoute){
            // create or activate route tab
            try { window.createRouteTab(foundRoute); } catch(e) { /* ignore */ }
            return;
        }
        // if no matching route, fallthrough to station lookup and create 'not found' tab below
    }

    // search in WAREHOUSES and STORES
    const warehouses = Array.isArray(window.WAREHOUSES) ? window.WAREHOUSES : [];
    const stores = Array.isArray(window.STORES) ? window.STORES : [];
    const all = warehouses.concat(stores);
    const found = all.find(s => String(s.id || s.code || '').includes(id) || String(s.name || '').includes(id));

    if (found) {
        const tab = createOrActivateTab(found);
        // optionally open detail panel if present
        try { showDetail(found); } catch(e) { /* ignore */ }
        // ensure pane visible and focus first row
        try {
            const content = document.getElementById('tab-content');
            const pane = content && content.querySelector(`.tab-pane[data-id="${found.id}"]`);
            if (pane) {
                pane.scrollIntoView({behavior:'smooth', block:'start'});
                const firstRow = pane.querySelector('table.orders-table tbody tr[data-id]');
                if (firstRow) firstRow.focus && firstRow.focus();
            }
        } catch (e) { /* ignore */ }
    } else {
        // 未找到时，创建一个临时 tab 提示或显示空结果
        const tabs = document.getElementById('inner-tabs');
        const content = document.getElementById('tab-content');
        if (!tabs || !content) return;
        // remove active states
        Array.from(tabs.querySelectorAll('.inner-tab')).forEach(t => t.classList.remove('active'));
        Array.from(content.querySelectorAll('.tab-pane')).forEach(p => p.classList.remove('active'));
        // create temp tab
        const tempId = 'notfound-' + Date.now();
        const tab = document.createElement('div');
        tab.className = 'inner-tab active';
        tab.dataset.id = tempId;
        tab.innerHTML = `<span class="tab-label">未找到: ${id}</span><span class="close-x">&times;</span>`;
        tab.querySelector('.close-x').addEventListener('click', (e) => { e.stopPropagation(); tab.remove(); const last = tabs.querySelector('.inner-tab'); if (last) { last.classList.add('active'); const lastPane = content.querySelector(`.tab-pane[data-id="${last.dataset.id}"]`); if (lastPane) lastPane.classList.add('active'); } });
        tab.addEventListener('click', () => { Array.from(tabs.querySelectorAll('.inner-tab')).forEach(t => t.classList.remove('active')); tab.classList.add('active'); Array.from(content.querySelectorAll('.tab-pane')).forEach(p => p.classList.remove('active')); const pane = content.querySelector(`.tab-pane[data-id="${tempId}"]`); if (pane) pane.classList.add('active'); });
        tabs.appendChild(tab);
        const pane = document.createElement('div');
        pane.className = 'tab-pane active';
        pane.dataset.id = tempId;
        pane.innerHTML = `<div class="table-empty">未找到匹配的仓库/门店：${id}</div>`;
        content.appendChild(pane);
    }
}

// --- route-scheduling 页面初始化与通用交互（flow: tabs, panes, add/close, modify stop, add vehicle）
(function(){
    function initRouteScheduling(){
        const container = document.querySelector('.container');
        const page = container && container.getAttribute('data-page');
        if (page !== 'route-scheduling') return;

        const tabsRoot = document.getElementById('inner-tabs');
        const contentRoot = document.getElementById('tab-content');
        if (!tabsRoot || !contentRoot) return;

    // Note: do NOT auto-create panes from window.plannedRoutes by default.
    // Route panes will be created on demand (for example via filter/search or user action).

        function ensureTabsFromPanes(){
            const panes = Array.from(contentRoot.querySelectorAll('.tab-pane'));
            panes.forEach((p) =>{
                const id = p.getAttribute('data-id');
                let t = tabsRoot.querySelector(`.inner-tab[data-id="${id}"]`);
                if (!t) {
                    t = document.createElement('div');
                    t.className = 'inner-tab';
                    if (p.classList.contains('active')) t.classList.add('active');
                    t.setAttribute('data-id', id);
                    t.innerHTML = `<span class="tab-title">${id}</span><span class="close-x">×</span>`;
                    tabsRoot.appendChild(t);
                }
            });
            // add the create button at the end
            if (!tabsRoot.querySelector('.inner-tab.add-new')){
                const addBtn = document.createElement('div');
                addBtn.className = 'inner-tab add-new';
                addBtn.style.fontWeight = '600';
                addBtn.style.cursor = 'pointer';
                addBtn.innerText = '＋ 新增路线';
                addBtn.addEventListener('click', ()=>{
                    const newId = 'R' + String(Math.floor(Math.random()*9000)+1000);
                    const pane = document.createElement('div');
                    pane.className = 'tab-pane';
                    pane.setAttribute('data-id', newId);
                    pane.innerHTML = buildRoutePaneHtml(newId);
                    contentRoot.appendChild(pane);
                    try { applyStopFontSize(pane); } catch(e) {}
                    refreshTabsAndActivate(newId);
                });
                tabsRoot.appendChild(addBtn);
            }
        }

        function refreshTabsAndActivate(id){
            // remove existing add-new to avoid duplicate, then rebuild
            const add = tabsRoot.querySelector('.inner-tab.add-new');
            if (add) add.remove();
            Array.from(tabsRoot.querySelectorAll('.inner-tab')).forEach(t => t.classList.remove('active'));
            Array.from(contentRoot.querySelectorAll('.tab-pane')).forEach(p => p.classList.remove('active'));
            // ensure each pane has a tab
            const panes = Array.from(contentRoot.querySelectorAll('.tab-pane'));
            panes.forEach(p=>{
                const pid = p.dataset.id;
                let t = tabsRoot.querySelector(`.inner-tab[data-id="${pid}"]`);
                if (!t){
                    t = document.createElement('div');
                    t.className = 'inner-tab';
                    t.dataset.id = pid;
                    t.innerHTML = `<span class="tab-title">${pid}</span><span class="close-x">×</span>`;
                    tabsRoot.appendChild(t);
                }
                // wire click and close
                if (!t._wired){
                    t.addEventListener('click', (e)=>{
                        if (e.target.classList.contains('close-x')) return; // handled separately
                        activateTab(pid);
                    });
                    const cx = t.querySelector('.close-x');
                    if (cx) cx.addEventListener('click', (ev)=>{
                        ev.stopPropagation();
                        const pane = contentRoot.querySelector(`.tab-pane[data-id="${pid}"]`);
                        if (pane) pane.remove();
                        t.remove();
                        // activate first remaining
                        const first = tabsRoot.querySelector('.inner-tab');
                        if (first) activateTab(first.getAttribute('data-id'));
                    });
                    t._wired = true;
                }
            });
            // re-add create button
            ensureTabsFromPanes();
            // activate requested
            activateTab(id);
        }

        // create or activate a single route tab (route can be an id string or route object)
        function createRouteTab(route){
            const rid = (typeof route === 'string') ? route : (route && route.id) || '';
            if (!rid) return null;
            // if pane exists, activate it
            let pane = contentRoot.querySelector(`.tab-pane[data-id="${rid}"]`);
            if (!pane){
                pane = document.createElement('div');
                pane.className = 'tab-pane';
                pane.dataset.id = rid;
                pane.innerHTML = buildRoutePaneHtml(rid, (typeof route === 'object' ? route : undefined));
                contentRoot.appendChild(pane);
            }
            // ensure a tab exists and activate
            refreshTabsAndActivate(rid);
            // apply font-size from filter inputs to stop-name/stop-coords to match filter box text
            try { applyStopFontSize(pane); } catch(e) { /* ignore */ }
            return pane;
        }
        // expose globally for quick usage from console/other scripts
        window.createRouteTab = createRouteTab;

        function activateTab(id){
            Array.from(tabsRoot.querySelectorAll('.inner-tab')).forEach(t => t.classList.toggle('active', t.getAttribute('data-id')===id));
            Array.from(contentRoot.querySelectorAll('.tab-pane')).forEach(p => p.classList.toggle('active', p.getAttribute('data-id')===id));
        }

        function buildRoutePaneHtml(id, route){
            // try to populate from route if provided
            const r = route || {};
            const from = r.from || 'XXX仓库/门店';
            const to = r.to || 'XXX仓库/门店';
            const wp = Array.isArray(r.waypoints) ? r.waypoints : [];
            const midWps = wp.slice(1, wp.length-1);
            const wpHtml = midWps.map((w,i)=> {
                const name = w.name || '';
                const lng = (w.lng != null) ? w.lng : '';
                const lat = (w.lat != null) ? w.lat : '';
                const coords = formatCoords(lng, lat);
                return `<tr class="stop-row" data-stop="wp${i+1}"><td class="stop-label">途径点</td><td class="stop-name">${name}</td><td class="stop-coords">${coords}</td><td class="stop-meta"><div>预计停留：10m</div><div>预计耗时：0h 42m</div><div>里程：1.02km</div><button class="modify-btn" data-route="${id}" data-stop="wp${i+1}">修改</button></td></tr>`;
            }).join('');

            const html = `
                <div class="route-box route-scheduling-root">
                    <div class="stops-container">
                        <div class="stop-start">
                            <table class="stops-table" aria-label="stops-table">
                                <thead style="display:none"><tr><th>类型</th><th>名称</th><th>坐标</th><th>信息</th></tr></thead>
                                <tbody>
                                    <tr class="stop-row" data-stop="start"><td class="stop-label">起点</td><td class="stop-name">${from}</td><td class="stop-coords">${(r.waypoints && r.waypoints[0] ? formatCoords(r.waypoints[0].lng, r.waypoints[0].lat) : '')}</td><td class="stop-meta"><div>预计停留：30m</div><div>预计耗时：0h 0m</div><div>里程：0.00km</div><button class="modify-btn" data-route="${id}" data-stop="start">修改</button></td></tr>
                                    ${wpHtml || "<tr class='no-mid'><td colspan='4' class='no-data'>暂无途经点</td></tr>"}
                                    <tr class="stop-row" data-stop="end"><td class="stop-label">终点</td><td class="stop-name">${to}</td><td class="stop-coords">${(r.waypoints && r.waypoints[r.waypoints.length-1] ? formatCoords(r.waypoints[r.waypoints.length-1].lng, r.waypoints[r.waypoints.length-1].lat) : '')}</td><td class="stop-meta"><div>预计停留：20m</div><div>预计耗时：2h 2m</div><div>里程：4.13km</div><button class="modify-btn" data-route="${id}" data-stop="end">修改</button></td></tr>
                                </tbody>
                            </table>
                            <div class="add-stop-row"><button class="btn-add-stop" data-route="${id}">＋ 添加途经点</button></div>
                        </div>
                    </div>
                    <div class="sub-vehicles">
                        <div>下属车辆 (<span id="veh-count-${id}">${(Array.isArray(r.vehicles) ? r.vehicles.length : 0) || 0}</span>)</div>
                        <div><button class="add-vehicle" data-route="${id}">添加车辆</button></div>
                    </div>
                    <div class="route-vehicles">
                        <div style="margin-top:12px;">
                            <table class="orders-table" style="width:100%; font-size:1.3rem;">
                                <thead>
                                    <tr>
                                        <th style="width:18%; text-align:left; padding:8px;">车辆编号</th>
                                        <th style="width:14%; text-align:left; padding:8px;">车型</th>
                                        <th style="width:12%; text-align:left; padding:8px;">状态</th>
                                        <th style="width:12%; text-align:left; padding:8px;">电量</th>
                                        <th style="width:22%; text-align:left; padding:8px;">位置</th>
                                        <th style="width:12%; text-align:left; padding:8px;">速度</th>
                                        <th style="width:10%; text-align:right; padding:8px;">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="veh-tbody-${id}">
                                    ${renderVehiclesForRoute(id, r)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            return html;
        }

        // helper: apply font-size from page filter inputs by setting a CSS variable on the pane root
        function applyStopFontSize(rootEl){
            try {
                const root = (typeof rootEl === 'string') ? document.querySelector(rootEl) : rootEl;
                if (!root) return;
                // find a representative filter input on the page to copy font-size from
                const candidates = ['#filter-routeId', '#filter-point', '#filter-id', '#filter-stationId', '#filter-name'];
                let fs = null;
                for (const sel of candidates) {
                    const el = document.querySelector(sel);
                    if (el) {
                        const cs = window.getComputedStyle(el);
                        if (cs && cs.fontSize) { fs = cs.fontSize; break; }
                    }
                }
                // fallback to body computed size
                if (!fs) {
                    const bcs = window.getComputedStyle(document.body);
                    fs = bcs && bcs.fontSize ? bcs.fontSize : '14px';
                }
                // set CSS variable on the root pane so CSS can control sizes
                try { (root.style || document.documentElement.style).setProperty('--list-font-size', fs); } catch(e) { /* ignore */ }
            } catch(e) { console.warn('applyStopFontSize failed', e); }
        }

        // helper: format coordinates to 4 decimal places and prefix with label
        function formatCoords(lng, lat){
            try{
                if (lng == null && lat == null) return '';
                // if either is null/empty but the other exists, still format
                var lns = (lng == null || lng === '') ? '' : Number(lng);
                var lts = (lat == null || lat === '') ? '' : Number(lat);
                if (lns === '' && lts === '') return '';
                var fmt = function(n){
                    if (n === '' || n == null || isNaN(n)) return '';
                    return (Math.round(n * 10000) / 10000).toFixed(4);
                };
                var sl = fmt(lns);
                var sa = fmt(lts);
                if (!sl && !sa) return '';
                return '坐标 : ' + (sl || '') + (sl && sa ? ', ' : '') + (sa || '');
            }catch(e){ return ''; }
        }

        function marginRightSafe(el){ try{ el.style.marginRight = '8px'; }catch(e){} }

        // helper: render vehicles rows for a route using window.vehiclesData
        function renderVehiclesForRoute(routeId, routeObj){
            try{
                const vehicles = Array.isArray(window.vehiclesData) ? window.vehiclesData : (Array.isArray(window._vehiclesData) ? window._vehiclesData : ((typeof vehiclesData !== 'undefined' && Array.isArray(vehiclesData)) ? vehiclesData : []));
                const assigned = (routeObj && Array.isArray(routeObj.vehicles)) ? routeObj.vehicles : [];
                if (!assigned || assigned.length === 0) return '<tr><td colspan="7" class="no-data">暂无车辆</td></tr>';
                return assigned.map(vId => {
                    const v = vehicles.find(x => String(x.id||'').toLowerCase() === String(vId||'').toLowerCase()) || { id: vId, type:'—', status:'—', battery:'—', location:'—', speed:'—' };
                    return `<tr data-veh="${v.id}"><td style="padding:8px;">${v.id}</td><td style="padding:8px;">${v.type||''}</td><td style="padding:8px;">${v.status||''}</td><td style="padding:8px;">${v.battery||''}</td><td style="padding:8px;">${v.location|| (v.lng && v.lat ? (v.lng+','+v.lat) : '')}</td><td style="padding:8px;">${v.speed||''}</td><td style="padding:8px; text-align:right;"><button class="modify-btn" data-route="${routeId}" data-veh="${v.id}">移除</button></td></tr>`;
                }).join('');
            }catch(e){
                return '<tr><td colspan="7" class="no-data">渲染错误</td></tr>';
            }
        }

        // initial build
        ensureTabsFromPanes();

        // delegate clicks on tabsRoot for activate/close
        tabsRoot.addEventListener('click', (e)=>{
            const t = e.target.closest('.inner-tab');
            if (!t) return;
            const id = t.getAttribute('data-id');
            if (e.target.classList.contains('close-x')){
                const pane = contentRoot.querySelector(`.tab-pane[data-id="${id}"]`);
                if (pane) pane.remove();
                t.remove();
                const first = tabsRoot.querySelector('.inner-tab');
                if (first) activateTab(first.getAttribute('data-id'));
                return;
            }
            if (t.classList.contains('add-new')) return; // ignore add button as it's wired separately
            activateTab(id);
        });

        // delegate modify buttons, add-vehicle, and add-stop inside contentRoot
        contentRoot.addEventListener('click', function(e){
            const mb = e.target.closest('.modify-btn');
            if (mb){
                const rid = mb.getAttribute('data-route');
                const stopKey = mb.getAttribute('data-stop');
                if (typeof window.onModifyStop === 'function') window.onModifyStop(rid, stopKey);
                else alert('修改 ' + rid + ' ' + stopKey);
                return;
            }
            const av = e.target.closest('.add-vehicle');
            if (av){
                const rid = av.getAttribute('data-route');
                if (typeof window.onAddVehicle === 'function') window.onAddVehicle(rid);
                else {
                    const span = document.getElementById('veh-count-' + rid);
                    if (span) span.innerText = String(Number(span.innerText||'0')+1);
                }
                return;
            }

            // add intermediate stop button handler
            const ab = e.target.closest('.btn-add-stop');
            if (ab){
                const rid = ab.getAttribute('data-route');
                // find the pane containing this button
                const pane = e.target.closest('.tab-pane');
                if (!pane) return;
                const tbody = pane.querySelector('.stops-table tbody');
                if (!tbody) return;
                // compute next index for naming (count existing waypoint rows excluding start/end)
                const existing = Array.from(tbody.querySelectorAll('tr[data-stop]')).filter(tr => (tr.dataset.stop||'').indexOf('wp')===0).length;
                const idx = existing + 1;
                // create new table row
                const tr = document.createElement('tr');
                tr.className = 'stop-row';
                tr.setAttribute('data-stop', 'wp' + idx);
                tr.innerHTML = `<td class="stop-label">途径点</td><td class="stop-name">新途径点 ${idx}</td><td class="stop-coords"></td><td class="stop-meta"><div>预计停留：10m</div><div>预计耗时：0h 0m</div><div>里程：0.00km</div><button class="modify-btn" data-route="${rid}" data-stop="wp${idx}">修改</button></td>`;
                // insert before the end row (which has data-stop="end") if present
                const endRow = tbody.querySelector('tr[data-stop="end"]');
                if (endRow) tbody.insertBefore(tr, endRow);
                else tbody.appendChild(tr);
                // remove the placeholder 'no-mid' row if present
                const placeholder = tbody.querySelector('tr.no-mid');
                if (placeholder) placeholder.remove();
                try { applyStopFontSize(pane); } catch(e) {}
                // scroll into view
                try{ tr.scrollIntoView({ behavior:'smooth', block:'center' }); }catch(e){}
                return;
            }
        });

        // expose simple handlers if not already present
        if (typeof window.onModifyStop !== 'function'){
            window.onModifyStop = function(routeId, stopKey){
                const val = prompt('编辑 ' + routeId + ' 的 ' + stopKey + '，输入新的说明：', '');
                if (val !== null){
                    alert('已保存（示例）：' + val);
                }
            };
        }
        if (typeof window.onAddVehicle !== 'function'){
            window.onAddVehicle = function(routeId){
                // try to append a new vehicle row into the route's vehicle table
                const tbody = document.getElementById('veh-tbody-' + routeId);
                const span = document.getElementById('veh-count-' + routeId);
                const vehicles = Array.isArray(window.vehiclesData) ? window.vehiclesData : (Array.isArray(window._vehiclesData) ? window._vehiclesData : ((typeof vehiclesData !== 'undefined' && Array.isArray(vehiclesData)) ? vehiclesData : []));
                // create a synthetic id for demo if no actual vehicle available
                const newId = 'NEW' + String(Math.floor(Math.random()*9000)+1000);
                // choose first unassigned vehicle from window.vehiclesData not already in the table
                let chosen = null;
                for (const v of vehicles){
                    const exists = tbody && tbody.querySelector(`tr[data-veh="${v.id}"]`);
                    if (!exists){ chosen = v; break; }
                }
                const veh = chosen || { id: newId, type:'未知', status:'空闲', battery:'—', location:'—', speed:'—' };
                if (tbody){
                    const tr = document.createElement('tr');
                    tr.setAttribute('data-veh', veh.id);
                    tr.innerHTML = `<td style="padding:8px;">${veh.id}</td><td style="padding:8px;">${veh.type||''}</td><td style="padding:8px;">${veh.status||''}</td><td style="padding:8px;">${veh.battery||''}</td><td style="padding:8px;">${veh.location|| (veh.lng && veh.lat ? (veh.lng+','+veh.lat) : '')}</td><td style="padding:8px;">${veh.speed||''}</td><td style="padding:8px; text-align:right;"><button class="modify-btn" data-route="${routeId}" data-veh="${veh.id}">移除</button></td>`;
                    tbody.appendChild(tr);
                    // update count if present
                    if (span) span.innerText = String(Number(span.innerText||'0')+1);
                    // bind remove handler for this row
                    const btn = tr.querySelector('button.modify-btn');
                    if (btn){
                        btn.addEventListener('click', (e)=>{
                            e.stopPropagation();
                            tr.remove();
                            if (span) span.innerText = String(Math.max(0, Number(span.innerText||'0')-1));
                        });
                    }
                    return;
                }
                // fallback: just increment the counter if table missing
                if (span) span.innerText = String(Number(span.innerText||'0')+1);
            };
        }

        // activate first tab
        const first = tabsRoot.querySelector('.inner-tab');
        if (first) activateTab(first.getAttribute('data-id'));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initRouteScheduling);
    else initRouteScheduling();
})();

// ----------------- 通用资源创建器与具体 create 方法 -----------------
/**
 * 通用 POST 创建资源的 helper
 * @param {string} url - 目标接口 URL
 * @param {object} payload - 要发送的请求体（将 JSON.stringify）
 * @returns {Promise<object>} - 返回解析后的 JSON（若无 JSON 则返回 {}）
 *
 * 中文说明：该函数封装 fetch POST 行为，统一处理 Content-Type、错误解析和缓存策略，
 * 便于多个表单复用（车辆/路线/网格员/仓库等）。调用方可以在 then/catch 中处理 UI 状态。
 */
function postCreateResource(url, payload){
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store'
    }).then(resp => {
        if (!resp.ok) return resp.text().then(t => { throw new Error(t || ('HTTP ' + resp.status)); });
        return resp.json().catch(() => ({}));
    });
}

/**
 * 创建车辆的高层封装（返回 Promise）
 * @param {object} payload - 创建车辆所需字段（type/totalCapacity/batteryInfo 等）
 * @returns {Promise<object>}
 */
function createVehicle(payload){
    // TODO: 若未来需要在请求前增加认证/签名，可在此统一处理
    return postCreateResource('/api/vehicles', payload);
}

/**
 * 创建路线的高层封装（返回 Promise）
 * @param {object} payload - 创建路线所需字段（startStation/endStation/passStations 等）
 * @returns {Promise<object>}
 */
function createRoute(payload){
    return postCreateResource('/api/route/create', payload);
}

// ----------------- 网格员子标签页功能（从 gridmember-tasks.html 迁移） -----------------
// 说明：将原来内联在 gridmember-tasks.html 的脚本迁移到此处，便于复用与维护。

function getGridMemberById() {
    // 避免与函数名冲突，页面中的输入 id 为 gmIdInput
    const el = document.getElementById('gmIdInput');
    if (!el) return;
    const id = el.value.trim();
    if (!id) {
        if (typeof showToast === 'function') showToast('请输入网格员编号');
        return;
    }

    if (typeof fetchGridMembers !== 'function') {
        console.warn('fetchGridMembers 未定义，无法查询网格员');
        if (typeof showToast === 'function') showToast('功能暂不可用');
        return;
    }

    fetchGridMembers({ id }).then(list => {
        if (!Array.isArray(list) || list.length === 0) {
            if (typeof showToast === 'function') showToast('未找到对应网格员');
            return;
        }
        const gm = list[0];
        createOrActivateGMTab(gm);
    }).catch(err => {
        console.error(err);
        if (typeof showToast === 'function') showToast('查询失败');
    });
}

function createOrActivateGMTab(item) {
    if (!item) return;
    const tabs = document.getElementById('inner-tabs');
    const content = document.getElementById('tab-content');
    if (!tabs || !content) return;

    const id = String(item.id || item.gmId || item.code || item.codeId || '');
    if (!id) return;

    // 取消其它 active 状态
    Array.from(tabs.querySelectorAll('.inner-tab')).forEach(t => t.classList.remove('active'));
    Array.from(content.querySelectorAll('.tab-pane')).forEach(p => p.classList.remove('active'));

    // 已存在则激活并返回
    let existing = tabs.querySelector(`.inner-tab[data-id="${id}"]`);
    if (existing) {
        existing.classList.add('active');
        const pane = content.querySelector(`.tab-pane[data-id="${id}"]`);
        if (pane) pane.classList.add('active');
        return existing;
    }

    // 创建新 tab
    const tab = document.createElement('div');
    tab.className = 'inner-tab active';
    tab.dataset.id = id;
    tab.title = item.name || id;
    tab.innerHTML = `<span class="tab-label">${item.name || id}</span><span class="close-x">&times;</span>`;

    // 关闭按钮
    tab.querySelector('.close-x').addEventListener('click', (e) => {
        e.stopPropagation();
        const pane = content.querySelector(`.tab-pane[data-id="${id}"]`);
        if (pane) pane.remove();
        tab.remove();
    });

    // 点击切换
    tab.addEventListener('click', () => {
        Array.from(tabs.querySelectorAll('.inner-tab')).forEach(t => t.classList.remove('active'));
        Array.from(content.querySelectorAll('.tab-pane')).forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const pane = content.querySelector(`.tab-pane[data-id="${id}"]`);
        if (pane) pane.classList.add('active');
    });

    tabs.appendChild(tab);

    // 创建内容 Pane（先显示 header + 加载状态，然后按需拉取该网格员相关订单）
    const pane = document.createElement('div');
    pane.className = 'tab-pane active';
    pane.dataset.id = id;
    // 先显示基本 header 与加载占位
    pane.innerHTML = renderGMHeader(item) + '<div class="orders-list">加载中…</div>';
    content.appendChild(pane);

    // 按网格员从后端拉取订单列表，并渲染到 pane 中；同时把订单缓存到 pane._orders 以便点击时使用
    fetchOrdersForGridMember(id).then(list => {
        pane._orders = list || [];
        const ordersHtml = buildOrdersTableHtml(pane._orders);
        pane.querySelector('.orders-list').outerHTML = ordersHtml;
    }).catch(err => {
        console.error('fetchOrdersForGridMember failed', err);
        const node = pane.querySelector('.orders-list');
        if (node) node.outerHTML = '<div class="orders-list">获取订单失败</div>';
    });

    // 行点击委托：点击某订单行时尝试显示详情（优先使用已缓存的订单对象）
    pane.addEventListener('click', function (e) {
        const tr = e.target.closest('tr[data-order-id]');
        if (!tr) return;
        const oid = tr.dataset.orderId;
        const ord = (pane._orders || []).find(o => String(o.orderId || o.id) === String(oid));
        if (ord && typeof showDetail === 'function') return showDetail(ord);
        // 如果未命中本地缓存，尝试调用后端详情接口
        if (typeof fetchOrderDetail === 'function') {
            fetchOrderDetail(oid).then(o => { if (o && typeof showDetail === 'function') showDetail(o); }).catch(()=>{});
        }
    });

    return tab;
}

function renderGMTabContent(item) {
    const s = item || {};
    const escape = (v) => v == null ? '' : String(v);

    // 头部信息（简要）
    const headerHtml = `
        <div class="station-header">
            <div>
                <div class="station-meta">
                    <div>编号: ${escape(s.id || s.gmId || '')}</div>
                    <div>姓名: ${escape(s.name || '')}</div>
                    <div>联系方式: ${escape(s.phone || s.contact || '')}</div>
                </div>
            </div>
            <div style="text-align:right">
                <div style="color:var(--gray-medium)">所属网格: ${escape(s.network || s.grid || '')}</div>
            </div>
        </div>
    `;

    // 从全局订单数据中筛选与该网格员相关的订单，支持多种可能的字段名以提高兼容性
    const ordersSrc = Array.isArray(window.orders) ? window.orders : (Array.isArray(window.dataOrders) ? window.dataOrders : []);
    const matchKeys = ['gridMemberId', 'gridMember', 'assignedTo', 'delivererId', 'loaderId', 'unloaderId', 'driverId', 'pickerId', 'courierId'];
    const targetIds = [String(s.id || s.gmId || s.code || s.name)];

    const related = (Array.isArray(ordersSrc) ? ordersSrc.filter(o => {
        for (let k of matchKeys) {
            if (o[k] !== undefined && o[k] !== null) {
                if (targetIds.indexOf(String(o[k])) !== -1) return true;
            }
        }
        // 兼容：有时订单里会把参与人员写在一个数组或字符串字段里
        if (Array.isArray(o.participants) && o.participants.some(p => targetIds.indexOf(String(p)) !== -1)) return true;
        if (typeof o.participant === 'string' && targetIds.indexOf(String(o.participant)) !== -1) return true;
        return false;
    }) : []);

    // 使用统一的 orders table 风格进行渲染（参考 stations-io）
    const ordersHtml = buildOrdersTableHtml(related);
    const section = `
        <div class="orders-section">
            ${ordersHtml}
        </div>
    `;

    return headerHtml + section;
}

// 渲染网格员 header（供按需加载时复用）
function renderGMHeader(item) {
    const s = item || {};
    const escape = (v) => v == null ? '' : String(v);
    return `
        <div class="station-header">
            <div>
                <div class="station-meta">
                    <div>编号: ${escape(s.id || s.gmId || '')}</div>
                    <div>姓名: ${escape(s.name || '')}</div>
                    <div>联系方式: ${escape(s.phone || s.contact || '')}</div>
                </div>
            </div>
            <div style="text-align:right">
                <div style="color:var(--gray-medium)">所属网格: ${escape(s.network || s.grid || ' -- ')}</div>
            </div>
        </div>
    `;
}

// 将订单数组渲染为表格 HTML
function buildOrdersTableHtml(list) {
    const escape = (v) => v == null ? '' : String(v);
    // 使用与 stations-io 相同的表格样式（.orders-table），但针对网格员出勤记录定制列：
    // 列：订单号 | 出勤状态（已取货-配送中 / 已送达 / 已分派未取货）| 收件人 | 电话 | 地址 | 时间（格式化）
    // 说明：这里把视角调整为“网格员出勤记录”，不展示路线和车辆信息。
    let ordersHtml = '<div class="orders-list">';
    if (!list || list.length === 0) {
        ordersHtml += '<div class="no-data">无关联订单</div>';
        ordersHtml += '</div>';
        return ordersHtml;
    }
    ordersHtml += '<table class="orders-table" aria-label="orders"><thead><tr><th>订单号</th><th>出勤状态</th><th>收件人</th><th>电话</th><th>地址</th><th>时间</th></tr></thead><tbody>';
    list.forEach(o => {
        const oid = escape(o.orderId || o.OrderId || o.id || '');
        // 计算网格员出勤状态：已送达 / 派件中 / 已分派未取货
        const rawStatus = (o.status || o.Status || o.state || '') + '';
        const attendance = computeGMAttendanceStatus(rawStatus, o);
        const statusHtml = renderOrderStatusBadge(attendance);

        const name = escape(o.addressee || o.Addressee || o.name || o.toName || '');
        const phone = escape(o.addresseePhone || o.AddresseePhone || o.phone || o.contact || '');
        const addr = escape(o.address || o.Address || o.toAddress || '');
        // 时间优先使用 startTime（表示取货/开始派件），否则回退到 createdAt
        const rawTime = o.startTime || o.StartTime || o.start || o.createdAt || o.CreateTime || '';
        const time = formatTimeForDisplay(rawTime);

        ordersHtml += `<tr data-order-id="${oid}">
            <td>${oid}</td>
            <td>${statusHtml}</td>
            <td>${name}</td>
            <td>${phone}</td>
            <td>${addr}</td>
            <td>${escape(time)}</td>
        </tr>`;
    });

    ordersHtml += '</tbody></table></div>';
    return ordersHtml;
}

// 根据订单的后端状态或时间字段，针对网格员出勤记录判断三种状态：
//  - "已送达"：后端状态表示已完成/已签收/已送达
//  - "派件中"：后端状态表示配送中/在途/运输（表示网格员已取货并正在派件）
//  - "已分派未取货"：其它情况（任务下发但网格员尚未从门店取货）
// 参数说明：rawStatus-来自订单的 status 字段（字符串），order-完整订单对象（用于检查时间等字段）
function computeGMAttendanceStatus(rawStatus, order) {
    const s = (rawStatus || '') + '';
    if (/(完成|签收|已签收|已送达)/.test(s)) return '已送达';
    if (/(配送中|在途|运输|派件中)/.test(s)) return '派件中';

    // 备用逻辑：如果存在 startTime（表示已开始处理/取货），且状态不为完成，则认为是派件中
    const start = order && (order.startTime || order.StartTime || order.start || order.Start || order.createdAt);
    if (start) return '派件中';

    // 默认：已分派但未取货
    return '已分派未取货';
}

// 将订单状态渲染为带颜色的 badge，复用 stations-io 的风格
function renderOrderStatusBadge(st) {
    if (!st) return `<span class="badge status-pending">--</span>`;
    if (/(完成|签收|已签收)/.test(st)) return `<span class="badge status-complete">${escapeHtml(st)}</span>`;
    if (/(配送中|在途|运输)/.test(st)) return `<span class="badge status-inprogress">${escapeHtml(st)}</span>`;
    if (/(待取件|待配送|待取)/.test(st)) return `<span class="badge status-pending">${escapeHtml(st)}</span>`;
    return `<span class="badge status-pending">${escapeHtml(st)}</span>`;
}

// 从后端拉取某个网格员相关的订单（使用 orders-api 提供的 /api/order/list 接口）
function fetchOrdersForGridMember(gridMemberId) {
    try {
        const qs = new URLSearchParams();
        if (gridMemberId) qs.set('gridMemberId', gridMemberId);
        const url = '/api/order/list' + (qs.toString() ? ('?' + qs.toString()) : '');
        return fetch(url, { method: 'GET', cache: 'no-store' })
            .then(resp => {
                if (!resp.ok) return resp.text().then(t => { throw new Error(t || resp.statusText); });
                return resp.json().catch(() => ({}));
            })
            .then(json => {
                const list = (json && json.ordersList) ? json.ordersList : (Array.isArray(json) ? json : []);
                return list;
            });
    } catch (e) {
        return Promise.reject(e);
    }
}

// 获取订单详情： GET /api/order/detail/:orderId
function fetchOrderDetail(orderId) {
    if (!orderId) return Promise.reject(new Error('orderId required'));
    const url = '/api/order/detail/' + encodeURIComponent(orderId);
    return fetch(url, { method: 'GET', cache: 'no-store' })
        .then(resp => {
            if (!resp.ok) return resp.text().then(t => { throw new Error(t || resp.statusText); });
            return resp.json().catch(() => ({}));
        });
}

// 页面初始化绑定：网格员页面的浮动按钮行为
document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.container');
    if (!container || container.getAttribute('data-page') !== 'gridmember-tasks') return;

    // 浮动新增按钮（若需要快速创建网格员，secondary.js 中已实现 openCreateGridMemberModal）
    const btnAdd = document.getElementById('btn-add');
    if (btnAdd) {
        btnAdd.addEventListener('click', () => {
            if (typeof openCreateGridMemberModal === 'function') openCreateGridMemberModal();
            else if (typeof showToast === 'function') showToast('创建功能暂未实现');
        });
    }
});


