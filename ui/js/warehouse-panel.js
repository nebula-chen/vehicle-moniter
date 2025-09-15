// warehouse-panel.js - 仓库门店信息面板组件
(function(){
    const NS = 'WarehousePanel';
    // 查找元素
    const root = document.getElementById('warehouse-panel');
    if(!root) return;
    const mapDom = document.getElementById('warehouse-mini-map');
    const totalWarehousesEl = document.getElementById('warehouse-total');
    const totalStationStoreEl = document.getElementById('station-store-total');
    // 初始化 echarts 实例
    const chart = echarts.init(mapDom, null, {renderer: 'canvas', useDirtyRect: false});
    let geoRegistered = false;
    // 动态切换地图底图为 SPB_STREETS
    function buildOption({points = [], center = [104, 35], zoom = 1.1, mapName = 'SPB_STREETS'} = {}){
        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'item',
                formatter: params => {
                    if(params.componentType === 'series'){
                        return `<div style=\"padding:6px\">`+
                        `<strong>${params.data.name || params.data.id || '点'}</strong><br/>`+
                        `类型: ${params.data.type || '未知'}<br/>`+
                        `库存: ${params.data.stock != null ? params.data.stock : '--'}`+
                        `</div>`;
                    }
                    return params.name || '';
                }
            },
            geo: {
                map: mapName,
                roam: false,
                label: {show:false},
                silent: true,
                itemStyle: {areaColor: '#DFF6FB', borderColor:'rgba(0, 0, 0, 1)'},
                emphasis: {itemStyle:{areaColor:'rgba(49, 152, 255, 1)'}}
            },
            series: [
                // 仓库
                {
                    name: '仓库',
                    type: 'scatter',
                    coordinateSystem: 'geo',
                    data: points.filter(p=>p.type==='仓库').map(p=>(
                        {name: p.name, value: [p.lon, p.lat], id: p.id, type: p.type, stock: p.stock, address: p.address}
                    )),
                    symbol: 'circle',
                    symbolSize: 8,
                    itemStyle: {color: '#ffb300', borderColor: '#b26a00', borderWidth:2, shadowBlur:8, shadowColor:'rgba(255,179,0,0.18)'},
                    label: {show:false, formatter: function(params){return params.data.name;}, color:'#b26a00', fontWeight:'bold', fontSize:6, position:'top'},
                    z: 3
                },
                // 门店
                {
                    name: '门店',
                    type: 'scatter',
                    coordinateSystem: 'geo',
                    data: points.filter(p=>p.type==='门店').map(p=>(
                        {name: p.name, value: [p.lon, p.lat], id: p.id, type: p.type, stock: p.stock, address: p.address}
                    )),
                    symbol: 'circle',
                    symbolSize: 8,
                    itemStyle: {color: '#4fc3f7', borderColor: '#08354a', borderWidth:2, shadowBlur:8, shadowColor:'rgba(79,195,247,0.18)'},
                    label: {show:false, formatter: function(params){return params.data.name;}, color:'#08354a', fontWeight:'bold', fontSize:6, position:'top'},
                    z: 2
                }
            ]
        };
    }
    function updateData({points = [], stats = {warehouses:0, stationStores:0}} = {}){
        totalWarehousesEl.textContent = stats.warehouses != null ? stats.warehouses : '--';
        totalStationStoreEl.textContent = stats.stationStores != null ? stats.stationStores : '--';
        const option = buildOption({points, mapName: geoRegistered ? 'SPB_STREETS' : 'warehouse-map'});
        chart.setOption(option, {notMerge:true});
    }
    function loadGeoJSON(geojson, mapName = 'SPB_STREETS'){
        try{
            // 只保留指定街道/镇，与 car-screen.js 保持一致
            var allowedNames = [
                '虎溪街道','香炉山街道','西永街道','曾家镇','含谷镇','金凤镇','白市驿镇','走马镇','石板镇','巴福镇'
            ];
            var filteredGeo = geojson;
            if (geojson && geojson.features && Array.isArray(geojson.features)) {
                var rawFiltered = (geojson.features || []).filter(function(f){
                    var props = f.properties || {};
                    var cand = (props.name || props.NAME || props.NAME_CH || props.adname || props.adcode || '').toString().trim();
                    if (!cand) return false;
                    return allowedNames.some(function(n){ return n.toLowerCase() === cand.toLowerCase(); });
                });
                // 去重
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
                filteredGeo = Object.assign({}, geojson, { features });
            }
            echarts.registerMap(mapName, filteredGeo);
            geoRegistered = true;
            chart.setOption(buildOption({mapName}), {notMerge:true});
        }catch(e){
            console.warn('注册 GeoJSON 失败', e);
        }
    }
    window.addEventListener('resize', () => chart.resize());
    window[NS] = {updateData, loadGeoJSON, chart};
    // 优先加载 SPB_STREETS 地图（与 car-screen.js 保持一致）
    (function tryLoadStreetsMap(){
        let geo = null;
        if (window.__SPB_STREETS__ && typeof window.__SPB_STREETS__ === 'object') geo = window.__SPB_STREETS__;
        else if (window.streetsGeoJSON && typeof window.streetsGeoJSON === 'object') geo = window.streetsGeoJSON;
        else if (window.SPB_STREETS && typeof window.SPB_STREETS === 'object') geo = window.SPB_STREETS;
        if (geo) {
            loadGeoJSON(geo, 'SPB_STREETS');
        } else {
            // 回退：注册一个矩形占位地图
            const placeholderGeo = {
                type: 'FeatureCollection',
                features: [
                    {type: 'Feature', properties: {name: 'placeholder'}, geometry: {type: 'Polygon', coordinates: [[[80,10],[130,10],[130,50],[80,50],[80,10]]]}}
                ]
            };
            loadGeoJSON(placeholderGeo, 'warehouse-map');
        }
    })();
    // 更丰富的模拟数据，覆盖各街道/镇，区分仓库和门店
    const demoPoints = [
        {id:1, name:'仓库A', lon:106.320, lat:29.610, type:'仓库', stock:420, address:'虎溪街道'},
        {id:2, name:'仓库B', lon:106.350, lat:29.540, type:'仓库', stock:380, address:'西永街道'},
        {id:3, name:'仓库C', lon:106.410, lat:29.520, type:'仓库', stock:295, address:'白市驿镇'},
        {id:4, name:'门店1', lon:106.330, lat:29.600, type:'门店', stock:80, address:'虎溪街道'},
        {id:5, name:'门店2', lon:106.340, lat:29.570, type:'门店', stock:65, address:'香炉山街道'},
        {id:6, name:'门店3', lon:106.360, lat:29.550, type:'门店', stock:120, address:'西永街道'},
        {id:7, name:'门店4', lon:106.390, lat:29.530, type:'门店', stock:55, address:'白市驿镇'},
        {id:8, name:'门店5', lon:106.420, lat:29.510, type:'门店', stock:40, address:'石板镇'},
        {id:9, name:'门店6', lon:106.370, lat:29.590, type:'门店', stock:90, address:'金凤镇'},
        {id:10, name:'门店7', lon:106.380, lat:29.560, type:'门店', stock:70, address:'巴福镇'}
    ];
    updateData({points: demoPoints, stats:{warehouses:3,stationStores:7}});
})();
