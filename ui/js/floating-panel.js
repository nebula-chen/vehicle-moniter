// 浮动面板交互逻辑
// 可根据需要扩展回调，联动地图内容

document.addEventListener('DOMContentLoaded', function() {
  const panel = document.getElementById('floatingPanel');
  if (!panel) return;
    // helper to apply visual state on label
    function applyLabelState(checkbox){
      const label = checkbox && checkbox.closest('.panel-checkbox');
      if (!label) return;
      if (checkbox.checked) {
        label.classList.remove('panel-off');
        label.setAttribute('aria-pressed', 'true');
      } else {
        label.classList.add('panel-off');
        label.setAttribute('aria-pressed', 'false');
      }
      // small ripple animation
      label.classList.add('panel-toggle-anim');
      setTimeout(()=>label.classList.remove('panel-toggle-anim'), 220);
    }

    // on change, call toggleMapLayer and update visuals
    panel.addEventListener('change', function(e) {
      if (e.target && e.target.type === 'checkbox') {
        const type = e.target.getAttribute('data-type');
        const checked = e.target.checked;
        applyLabelState(e.target);
        if (window.toggleMapLayer) {
          window.toggleMapLayer(type, checked);
        }
      }
    });

    // initialize from current checkboxes so map layers reflect defaults
    const boxes = panel.querySelectorAll('input[type="checkbox"][data-type]');
    boxes.forEach(function(b){
      try { applyLabelState(b); } catch(e){}
      try { if (window.toggleMapLayer) window.toggleMapLayer(b.getAttribute('data-type'), b.checked); } catch(e){}
    });
});
