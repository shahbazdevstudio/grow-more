const KEY = 'gm_theme'; // theme is not sensitive; cached only so the PIN screen matches before login
export function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === 'light' ? '#F2EFE8' : '#0A0B0E';
  window.dispatchEvent(new CustomEvent('gm:theme', { detail: t }));
}
export const currentTheme = () => document.documentElement.dataset.theme || 'dark';
