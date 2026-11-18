// Runs before first paint (no flash of the wrong theme).
(function () {
  try { var t = localStorage.getItem('gm_theme'); document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark'; } catch (e) { document.documentElement.dataset.theme = 'dark'; }
})();
