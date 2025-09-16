// 车辆信息子面板JS，后续可扩展为接口动态获取
(function() {
    const html = `
    <div class="vehicle-info-panel">
        <div class="panel-header" id="vehicle-total">
            <a href="/car-manage.html">车辆总数</a> <span class="stat-value" id="total-value">128</span>
        </div>
        <div class="panel-stats-4">
            <div class="stat-block">
                <div class="stat-label" id="stat-onroad">在途车辆</div>
                <div class="stat-value" id="onroad-value">56</div>
            </div>
            <div class="stat-block">
                <div class="stat-label" id="stat-idle">空闲车辆</div>
                <div class="stat-value" id="idle-value">5</div>
            </div>
            <div class="stat-block">
                <div class="stat-label" id="stat-charging">充电车辆</div>
                <div class="stat-value" id="charging-value">10</div>
            </div>
            <div class="stat-block">
                <div class="stat-label" id="stat-abnormal">异常车辆</div>
                <div class="stat-value" id="abnormal-value">2</div>
            </div>
        </div>
        <div class="panel-info">
            <div class="info-col">
                <div class="info-row">车辆ID：<span id="vehicle-id">000001</span></div>
                <div class="info-row">车辆类型：<span id="vehicle-type">普通</span></div>
                <div class="info-row">容量：<span id="vehicle-capacity">6立方</span></div>
            </div>
            <div class="info-col">
                <div class="info-row">电量：<span id="vehicle-battery">100%</span></div>
                <div class="info-row">速度：<span id="vehicle-speed">10km/h</span></div>
                <div class="info-row">路线：<span id="vehicle-route">xx-&gt;xxx</span></div>
            </div>
        </div>
        <div class="info-row eta-row" style="margin: 4px 0 0 0; text-align: left; font-size: 1.01rem;">
            预计送达时间：<span id="vehicle-eta">2025-9-11 18:00</span>
        </div>
        <div class="panel-video-block">
            <div class="panel-video-title">当前实时画面：</div>
            <div class="panel-video" id="vehicle-video">
                <div class="video-placeholder">实时画面接口预留</div>
            </div>
        </div>
    </div>
    `;
    const container = document.getElementById('vehicle-info-panel-container');
    if (container) {
        container.innerHTML = html;
    }
    // 数据接口预留示例
    window.updateVehiclePanel = function(data) {
        document.getElementById('vehicle-total').childNodes[0].textContent = (data.totalTitle || '总车辆数目') + ' ';
        document.getElementById('total-value').textContent = data.totalValue || '128';
        document.getElementById('stat-onroad').textContent = data.onroadTitle || '在途车辆';
        document.getElementById('onroad-value').textContent = data.onroadValue || '56';
        document.getElementById('stat-abnormal').textContent = data.abnormalTitle || '异常车辆';
        document.getElementById('abnormal-value').textContent = data.abnormalValue || '2';
        document.getElementById('stat-idle').textContent = data.idleTitle || '空闲车辆';
        document.getElementById('idle-value').textContent = data.idleValue || '60';
        document.getElementById('stat-charging').textContent = data.chargingTitle || '充电车辆';
        document.getElementById('charging-value').textContent = data.chargingValue || '10';
        document.getElementById('vehicle-id').textContent = data.vehicleId || '000001';
        document.getElementById('vehicle-type').textContent = data.vehicleType || '普通';
        document.getElementById('vehicle-capacity').textContent = data.vehicleCapacity || '6立方';
        document.getElementById('vehicle-battery').textContent = data.vehicleBattery || '100%';
        document.getElementById('vehicle-speed').textContent = data.vehicleSpeed || '10km/h';
        document.getElementById('vehicle-route').textContent = data.vehicleRoute || 'xx->xxx';
        document.getElementById('vehicle-eta').textContent = data.vehicleEta || '2025-9-11 18:00';
        // 实时画面接口预留
        if (data.videoElement) {
            const videoContainer = document.getElementById('vehicle-video');
            videoContainer.innerHTML = '';
            videoContainer.appendChild(data.videoElement);
        }
    };
})();
