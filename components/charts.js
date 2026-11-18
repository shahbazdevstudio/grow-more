/* Chart.js is large, so it is only loaded when a page actually needs a chart (Analytics). */
let loader = null;
export function loadChartLib() {
  if (window.Chart) return Promise.resolve(window.Chart);
  loader ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'assets/vendor/chart.umd.min.js';
    s.onload = () => resolve(window.Chart);
    s.onerror = () => { loader = null; reject(new Error('Could not load the charts library.')); };
    document.head.append(s);
  });
  return loader;
}

export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const palette = () => ({ text: css('--muted'), grid: css('--chart-grid'), gold: css('--gold'), pos: css('--pos'), neg: css('--neg'), info: css('--info'), surface: css('--surface-solid'), strong: css('--text') });

export async function createChart(canvas, config, set) {
  const Chart = await loadChartLib();
  const p = palette();
  Chart.defaults.font.family = css('--font') || 'Manrope, system-ui, sans-serif';
  Chart.defaults.font.weight = 600;
  Chart.defaults.color = p.text;
  const chart = new Chart(canvas, {
    ...config,
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 650, easing: 'easeOutQuart' },
      ...config.options,
      plugins: {
        legend: { display: false },
        ...config.options?.plugins,
        tooltip: { backgroundColor: p.surface, titleColor: p.strong, bodyColor: p.text, borderColor: css('--stroke-2'), borderWidth: 1, padding: 12, cornerRadius: 12, displayColors: true, boxPadding: 4, ...config.options?.plugins?.tooltip },
      },
    },
  });
  set && set.push(chart);
  return chart;
}
export const gridScale = (fmt) => ({ grid: { color: palette().grid, drawBorder: false }, border: { display: false }, ticks: { color: palette().text, maxTicksLimit: 5, callback: fmt } });
export const xScale = () => ({ grid: { display: false }, border: { display: false }, ticks: { color: palette().text, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } });
export const destroyAll = (set) => { set.splice(0).forEach((c) => c.destroy()); };
