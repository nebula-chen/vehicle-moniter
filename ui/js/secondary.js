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

    // 使用页面上可用的 orders 数据源：优先页面作用域的 `orders`（data.js 中可能使用 const/let 声明），
    // 然后兼容 window.orders、window.dataOrders、window.dataOrdersList，最终回退到空数组
    let ordersSrc = [];
    try {
        if (typeof orders !== 'undefined' && Array.isArray(orders)) {
            ordersSrc = orders;
        } else if (Array.isArray(window.orders)) {
            ordersSrc = window.orders;
        } else if (Array.isArray(window.dataOrders)) {
            ordersSrc = window.dataOrders;
        } else if (Array.isArray(window.dataOrdersList)) {
            ordersSrc = window.dataOrdersList;
        }
    } catch (e) {
        ordersSrc = Array.isArray(window.orders) ? window.orders : (Array.isArray(window.dataOrders) ? window.dataOrders : (Array.isArray(window.dataOrdersList) ? window.dataOrdersList : []));
    }

    // 兼容 data.js 中的订单字段名：sender, senderPhone, senderAddress, addressee, addresseePhone, address, warehouseId, vehicleId, gridMemberId
    const matched = Array.isArray(ordersSrc) ? ordersSrc.filter(order => {
        const o = order || {};
        const matchesOrderId = orderId === '' || (o.id || '').includes(orderId);
        // 合并可能作为姓名的字段，优先匹配收/寄件人相关字段，不把其它非姓名字段误判为姓名
        const nameCandidates = [o.addressee, o.receiver, o.addresseeName, o.receiverName, o.sender, o.senderName]
            .filter(v => v !== undefined && v !== null)
            .map(v => String(v))
            .join(' ');
        const matchesAddressee = addressee === '' || nameCandidates.includes(addressee);
        const matchesPhone = phone === '' || ((o.addresseePhone || o.receiverPhone || o.senderPhone || o.phone || '') + '').includes(phone);
        const matchesAddress = address === '' || ((o.address || o.receiverAddress || o.senderAddress || '') + '').includes(address);
        const matchesPoint = point === '' || ((o.warehouseId || o.warehouse || o.point || '') + '').includes(point);
        const matchesStatus = (function(){
            if (!status) return true;
            const ostat = (o.status || '') + '';
            const aliases = STATUS_ALIASES[status] || [status];
            return aliases.some(a => ostat.includes(a));
        })();
        return matchesOrderId && matchesAddressee && matchesPhone && matchesAddress && matchesPoint && matchesStatus;
    }) : [];
    if (tableBody) {
        tableBody.innerHTML = '';
        if (!matched || matched.length === 0) {
            const tr = document.createElement('tr');
            tr.className = 'table-empty';
            tr.innerHTML = '<td colspan="10">暂无匹配记录。</td>';
            tableBody.appendChild(tr);
            return;
        }
        matched.forEach(order => {
            const tr = document.createElement('tr');
            tr.dataset.id = order.id || '';
            tr.innerHTML = `
                <td>${order.id || ''}</td>
                <td>${order.type || ''}</td>
                <td>${order.status != '已签收' ? order.status : order.status + '<br>' + order.endTime}</td>
                <td>${order.sender || order.senderName || ''}</td>
                <td>${order.senderPhone + '<br>' + order.senderAddress}</td>
                <td>${order.addressee || order.receiver || ''}</td>
                <td>${order.addresseePhone + '<br>' + order.address}</td>
                <td>${(order.warehouseId || order.warehouse) ? `<a href="stations-manage.html?station=${encodeURIComponent(order.warehouseId||order.warehouse)}" class="link-to-station" target="_self">${order.warehouseId || order.warehouse}</a>` : '--'}</td>
                <td>${order.routeId ? `<a href="route-manage.html?route=${encodeURIComponent(order.routeId)}" class="link-to-route" target="_self">${order.routeId}</a>` : ''}</td>
                <td>${(order.vehicleId || order.carId) ? `<a href="car-screen.html?vehicle=${encodeURIComponent(order.vehicleId||order.carId)}" class="link-to-map" target="_blank" rel="noopener">${order.vehicleId || order.carId}</a>` : ''}</td>
                <td>${order.gridMemberId || order.courierId || '--'}</td>
            `;
            tr.addEventListener('click', () => showDetail(order));
            // prevent row click when clicking station/map/route links
            const links = tr.querySelectorAll('.link-to-map, .link-to-station, .link-to-route');
            links.forEach(a => {
                a.addEventListener('click', function(evt){
                    evt.stopPropagation();
                    // allow default navigation for station links (same tab) or map links (new tab)
                });
            });
            tableBody.appendChild(tr);
        });
    }
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
            <td>${item.network || ''}</td>
            <td>${item.joined || ''}</td>
            <td>${item.status || ''}</td>
            <td>${item.note || ''}</td>
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
            const vehicles = Array.isArray(window.vehiclesData) ? window.vehiclesData : (Array.isArray(vehiclesData) ? vehiclesData : []);
            subs = vehicles.filter(v => ((v.routeId||v.route||'')+'').includes(r.id || '')).map(v => v.id);
        }

        const waypointsHtml = Array.isArray(r.waypoints) && r.waypoints.length > 0 ? r.waypoints.map((w, i) => `<li>[${i+1}] ${w.lng}, ${w.lat}</li>`).join('') : '<li>--</li>';
        const vehiclesHtml = subs.length > 0 ? subs.map(id => `<a href="car-screen.html?vehicle=${encodeURIComponent(id)}" target="_blank" rel="noopener">${id}</a>`).join('<br>') : '--';

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

        const wpNode = document.createElement('div');
        wpNode.innerHTML = '<ul>' + waypointsHtml + '</ul>';
        pushItem('途径点', wpNode);

        const vehiclesNode = document.createElement('div');
        vehiclesNode.innerHTML = vehiclesHtml;
        pushItem('下属车辆', ' ');
        pushItem('', vehiclesNode);

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

        // fill station id filter and call filterWarehouse
        const el = document.getElementById('filter-stationId');
        if (el) {
            el.value = stationId || '';
        }
        // run filter to render the matching station
        filterWarehouse();

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

// Helper for stations-io page: set station filter, run filterStation and try to activate the created tab
function openStationsIOAndShowTab(stationId) {
    try {
        const container = document.querySelector('.container');
        const page = container && container.getAttribute('data-page');
        if (page !== 'stations-io') return;

        const el = document.getElementById('filter-stationId');
        if (el) el.value = stationId || '';
        // run filter to create/activate tab
        try { filterStation(); } catch (e) { /* ignore */ }

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
    // TODO: 替换为 fetch('/api/gridmembers'...) 等真实实现
    console.log('fetchGridMembers called with', params);
    return new Promise((resolve) => {
        // mock 数据
        const sample = [
            { id: 'GM001', name: '张三', phone: '18888888888', network: '网格A', joined: '2024-03-10', status: '在职/正常', note: '' },
            { id: 'GM002', name: '王五', phone: '18888888888', network: '网格B', joined: '2023-11-20', status: '在职/排休', note: '早班' },
            { id: 'GM003', name: '赵六', phone: '18888888888', network: '网格C', joined: '2025-01-05', status: '在职/请假', note: '病假中' },
            { id: 'GM004', name: '周七', phone: '18888888888', network: '大学城xxx001', joined: '2022-07-18', status: '离职/流程中', note: '交接中' },
            { id: 'xxx001', name: '李四', phone: '18888888888', network: '大学城xxx001', joined: '2025-09-15', status: '在职/正常', note: '' },
            { id: 'GM005', name: '孙八', phone: '18888888888', network: '中心区-03', joined: '2021-12-01', status: '离职/已离职', note: '已离职' }
        ];
        setTimeout(() => resolve(sample), 200);
    });
}

// 事件绑定
document.addEventListener('DOMContentLoaded', () => {
    // 根据页面根容器上的 data-page 标识初始化对应逻辑，避免根据控件存在与否判断
    const container = document.querySelector('.container');
    const page = container && container.getAttribute('data-page');

    const btnAdd = document.getElementById('btn-add');
    if (btnAdd) btnAdd.addEventListener('click', () => {
        // 对不同页面可以扩展具体动作
        if (page === 'gridmember-profile') alert('打开新增网格员弹窗（占位）');
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
                    if (filterForm) filterForm.addEventListener('submit', (e)=>{ e.preventDefault(); filterWarehouse(); });
                    try { filterWarehouse(); } catch(e) { console.error('filterWarehouse failed', e); }
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
            // 路线管理页面：默认渲染全部路线，并绑定筛选表单
            try {
                const routes = Array.isArray(window.plannedRoutes) ? window.plannedRoutes : (typeof plannedRoutes !== 'undefined' && Array.isArray(plannedRoutes) ? plannedRoutes : []);
                renderRoutes(routes);
                const filterForm = document.getElementById('filterForm');
                if (filterForm) filterForm.addEventListener('submit', (e) => { e.preventDefault(); filterRoutes(); });
                // if URL contains route param, apply it and open detail
                try {
                    const params = new URLSearchParams(window.location.search);
                    const routeParam = params.get('route');
                    if (routeParam) {
                        let decoded = null;
                        try { decoded = decodeURIComponent(routeParam); } catch(e){ decoded = routeParam; }
                        openRoutesAndShowDetail(decoded);
                    }
                } catch(e) { console.warn('route-manage apply param failed', e); }
            } catch (e) { console.error('route-manage init failed', e); }
        } else if (page === 'car-tasks') {
            try { filterTasks(); } catch (e) { console.error('filterTasks failed', e); }
        } else if (page === 'stations-manage') {
            try {
                // bind stations filter form
                const filterForm = document.getElementById('filterForm');
                if (filterForm) filterForm.addEventListener('submit', (e) => { e.preventDefault(); filterWarehouse(); });
                // initial render
                try { filterWarehouse(); } catch (e) { console.error('filterWarehouse failed', e); }

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
                // 初始渲染车辆表格
                renderVehicleTable(window.vehiclesData || []);
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
                    if (typeof window.vehiclesData !== 'undefined' && Array.isArray(window.vehiclesData) && typeof filterCar === 'function') {
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
                        if ((typeof window.vehiclesData !== 'undefined' && Array.isArray(window.vehiclesData)) || typeof fetchVehicles === 'function' || attempts >= maxAttempts) {
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
            if (filterForm) filterForm.addEventListener('submit', (e) => { e.preventDefault(); filterStation(); });
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
        tr.innerHTML = `
            <td>${v.id || ''}</td>
            <td>${v.type || ''}</td>
            <td>${v.status || ''}</td>
            <td>${v.capacity || ''}</td>
            <td>${v.battery || ''}</td>
            <td>${v.routeId || ''}</td>
            <td>${v.createdAt || ''}</td>
            <td><button class="btn-monitor" data-vehicle="${v.id || ''}" title="实时监控">实时监控</button></td>
        `;
        tr.addEventListener('click', () => showDetail(v));
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

    // 数据来源优先 window.vehiclesData，再尝试 window.fetchVehicles()
    let data = Array.isArray(window.vehiclesData) ? window.vehiclesData.slice() : [];
    if ((!data || data.length === 0) && typeof fetchVehicles === 'function') {
        try {
            const res = fetchVehicles();
            // 如果 fetchVehicles 返回 Promise，则异步处理
            if (res && typeof res.then === 'function') {
                res.then(remote => {
                    const arr = normalizeVehicles(remote);
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
                }).catch(err => { console.error('fetchVehicles failed', err); renderVehicleTable([]); });
                return;
            }
        } catch (e) {
            console.error('fetchVehicles call failed', e);
        }
    }

    data = normalizeVehicles(data);
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

    // data source: prefer global plannedRoutes, fallback to empty
    const routes = Array.isArray(window.plannedRoutes) ? window.plannedRoutes : (Array.isArray(plannedRoutes) ? plannedRoutes : []);

    const matched = routes.filter(r => {
        const idMatch = routeId === '' || ((r.id || '') + '').includes(routeId);
        const pointMatch = point === '' || ((r.waypoints || []).some(w => (String(w.lng) + ',' + String(w.lat)).includes(point)) || (r.from || '').includes(point) || (r.to || '').includes(point));
        // normalize status: if route has explicit status use it; otherwise treat as '正常'
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

    // helper to find vehicles assigned to route
    const vehicles = Array.isArray(window.vehiclesData) ? window.vehiclesData : (Array.isArray(vehiclesData) ? vehiclesData : []);

    list.forEach(r => {
        const tr = document.createElement('tr');
        const id = r.id || '';
        // find subordinate vehicles: support either r.vehicles array or lookup from global vehiclesData
        let subs = [];
        if (Array.isArray(r.vehicles)) subs = r.vehicles.slice();
        else subs = vehicles.filter(v => ((v.routeId||v.route||'')+'').includes(id)).map(v=>v.id);

        // 起点和终点应使用 r.from 与 r.to
        const fromText = r.from || ((r.waypoints && r.waypoints[0]) ? (r.waypoints[0].lng + ',' + r.waypoints[0].lat) : '');
        const toText = r.to || ((r.waypoints && r.waypoints[r.waypoints.length-1]) ? (r.waypoints[r.waypoints.length-1].lng + ',' + r.waypoints[r.waypoints.length-1].lat) : '');

        // 途径点：当 waypoints.length > 2 时，显示第二个到倒数第二个点；否则显示 '--'
        let midPoints = '--';
        if (Array.isArray(r.waypoints) && r.waypoints.length > 2) {
            midPoints = r.waypoints.slice(1, r.waypoints.length-1).map((w,i) => `[${i+2}] ${w.lng},${w.lat}`).join('<br>');
        }

        tr.innerHTML = `
            <td>${id}</td>
            <td>${r.status || '正常'}</td>
            <td>${fromText}</td>
            <td>${toText}</td>
            <td>${midPoints}</td>
            <td>${subs.length}</td>
            <td>${r.createdAt || ''}</td>
            <td>${r.estimatedDistanceKm != null ? r.estimatedDistanceKm + ' km' : ''}</td>
        `;
        // prevent row click when clicking links
        const links = tr.querySelectorAll('.link-to-map, .link-to-station, .link-to-route');
        links.forEach(a => a.addEventListener('click', function(evt){ evt.stopPropagation(); }));
        tr.addEventListener('click', () => showDetail(r));
        tbody.appendChild(tr);
    });
}

// 规范化车辆数据：支持 map 或数组项
function normalizeVehicles(src) {
    if (!src) return [];
    if (Array.isArray(src)) return src.map(item => ({
        id: item.id || item.vehicleId || item.carId || '',
        type: item.type || item.vehicleType || '',
        status: item.status || item.state || '',
        capacity: item.capacity || item.loadCapacity || '',
        battery: item.battery || item.batteryLevel || '',
        routeId: item.routeId || item.route || '',
        createdAt: item.createdAt || item.addedAt || ''
    }));
    // 如果是对象 map：将其 values 转为数组
    if (typeof src === 'object') {
        return Object.keys(src).map(k => {
            const item = src[k] || {};
            return {
                id: item.id || k,
                type: item.type || '',
                status: item.status || '',
                capacity: item.capacity || '',
                battery: item.battery || '',
                routeId: item.routeId || '' ,
                createdAt: item.createdAt || ''
            };
        });
    }
    return [];
}

// 仓库/门店筛选与渲染（stations-manage.html 使用）
function filterWarehouse() {
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
        tr.innerHTML = '<td colspan="7">暂无匹配记录。</td>';
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

// 在 stations-io 页面使用的筛选函数：查找 WAREHOUSES/STORES 并创建/切换标签页
function filterStation() {
    const input = document.getElementById('filter-stationId');
    if (!input) return;
    const id = input.value.trim();
    if (!id) return;

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

