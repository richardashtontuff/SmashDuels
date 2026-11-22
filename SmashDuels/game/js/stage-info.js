/* Shared stage details for local and online selectors. */
const StageInfo = (() => {
  const overlay = document.getElementById('stage-info-dialog');
  const closeButton = document.getElementById('stage-info-close');
  const app = document.getElementById('app');
  const panel = overlay.querySelector('.stage-info-panel');
  let opener = null;
  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    app.inert = false;
    if (opener && opener.isConnected) opener.focus({preventScroll:true});
    opener = null;
  }
  function open(key, trigger) {
    const stage = STAGES[key], info = STAGE_INFO[key];
    if (!stage || !info) return;
    opener = trigger;
    document.getElementById('stage-info-title').textContent = stage.name;
    document.getElementById('stage-info-size').textContent = stage.size === 'XL' ? 'XL ARENA' : 'STANDARD ARENA';
    document.getElementById('stage-info-about').textContent = info.about;
    document.getElementById('stage-info-perk').textContent = info.perk;
    document.getElementById('stage-info-hazards').textContent = info.hazards;
    overlay.hidden = false;
    app.inert = true;
    closeButton.focus();
  }
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      if (document.activeElement === closeButton) panel.focus();
      else closeButton.focus();
    }
  });
  return {open, close};
})();
