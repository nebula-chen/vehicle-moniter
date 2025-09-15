// order-panel.js - extracted from order-panel.html
(function(){
  // sample data - in future replace with API calls
  

  function renderStats() {
    const orderStats = {
        total: 1280,
        finishedToday: 56,
        inTransit: 12,
        abnormal: 2
    };

    const totalEl = document.querySelector('#order-total .summary-num');
    const finishedEl = document.querySelector('#order-finished .summary-num');
    const intransitEl = document.querySelector('#order-intransit .status-num');
    const abnormalEl = document.querySelector('#order-abnormal .status-num');
    if (totalEl) totalEl.textContent = orderStats.total;
    if (finishedEl) finishedEl.textContent = orderStats.finishedToday;
    if (intransitEl) intransitEl.textContent = orderStats.inTransit;
    if (abnormalEl) abnormalEl.textContent = orderStats.abnormal;
  }

  // wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderStats);
  } else {
    renderStats();
  }
})();
