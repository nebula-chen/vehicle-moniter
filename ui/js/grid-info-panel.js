// 网格员信息面板数据更新函数
function updateGridInfo({ total, online, idle, offline }) {
  document.getElementById('total-count').textContent = total;
  document.getElementById('online-count').textContent = online;
  document.getElementById('idle-count').textContent = idle;
  document.getElementById('offline-count').textContent = offline;
}
// 示例：后续可通过接口调用 updateGridInfo({ total: 120, online: 80, idle: 30, offline: 10 });
// document.getElementById('distribution-btn').onclick = function() { /* 预留分布弹窗/跳转 */ };
