// 弹窗展示详细信息
function showDetail(idx) {
    const pkg = packages[idx];
    document.getElementById('modalTitle').innerText = `包裹编号：${pkg.id}`;
    document.getElementById('modalDetail').innerHTML = `
        <strong>收件人：</strong>${pkg.addressee}<br>
        <strong>手机号：</strong>${pkg.addresseePhone}<br>
        <strong>地址：</strong>${pkg.address}<br>
        <strong>快递点：</strong>${pkg.point}<br>
        <strong>配送状态：</strong>${pkg.endTime ? pkg.status + '  ' + pkg.endTime : pkg.status}<br>
        <hr>
        ${pkg.detail}
    `;
    document.getElementById('modalBg').style.display = 'flex';
}
function closeDetail() {
    document.getElementById('modalBg').style.display = 'none';
}

// 筛选功能
function filterPackages() {
    const addressee = document.getElementById('filterName').value.trim();
    const phone = document.getElementById('filterPhone').value.trim();
    const address = document.getElementById('filterAddress').value.trim();
    const point = document.getElementById('filterPoint').value;
    const status = document.getElementById('filterStatus').value;
    const cardList = document.getElementById('packageCardList');
    cardList.innerHTML = '';
    packages.forEach((pkg, idx) => {
        if (
            (addressee === '' || pkg.addressee.includes(addressee)) &&
            (phone === '' || pkg.addresseePhone.includes(phone)) &&
            (address === '' || pkg.address.includes(address)) &&
            (point === '' || pkg.point === point) &&
            (status === '' || pkg.status === status)
        ) {
            const card = document.createElement('div');
            card.className = 'package-card';
            card.onclick = () => showDetail(idx);
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-status ${pkg.statusClass || ''}">${pkg.status}</span>
                    <span class="card-id">${pkg.id}</span>
                </div>
                <div class="card-body">
                    <div class="card-route">
                        <span class="from">${pkg.senderAddress.slice(0, 3)}</span>
                        <strong style="color:#1a56db;">→</strong>
                        <span class="to">${pkg.address.slice(0, 3)}</span>
                    </div>
                    <div class="card-names">
                        <span class="sender">${pkg.sender}</span>
                        <span class="addressee">${pkg.addressee}</span>
                    </div>
                    <hr>
                    <div class="card-status-info">${pkg.endTime ? '已签收：' + pkg.endTime : pkg.status}</div>
                </div>
            `;
            cardList.appendChild(card);
        }
    });
}
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

// 页面加载时填充包裹列表
window.onload = filterPackages;
