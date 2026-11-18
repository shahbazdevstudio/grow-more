// Builds assets/icons/sprite.svg from the Lucide icons listed below (ISC licence).
// Usage:  npm i -D lucide-static   then   node tools/build-icons.mjs
// Add a name to ICONS, re-run, and use it as icon('name') in the UI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICONS = [
  'house', 'arrow-left-right', 'wallet', 'chart-pie', 'chart-column', 'piggy-bank', 'settings', 'lock', 'lock-open', 'plus', 'minus', 'x', 'check',
  'chevron-right', 'chevron-left', 'chevron-down', 'search', 'list-filter', 'pencil', 'trash-2', 'ellipsis', 'arrow-up-right', 'arrow-down-left',
  'banknote', 'landmark', 'smartphone', 'coins', 'circle-ellipsis', 'utensils', 'car', 'shopping-bag', 'wifi', 'receipt', 'megaphone', 'user', 'code',
  'package', 'gift', 'trending-up', 'trending-down', 'tag', 'dumbbell', 'calendar', 'calendar-days', 'target', 'flag', 'triangle-alert', 'circle-alert',
  'info', 'sun', 'moon', 'download', 'shield-check', 'key-round', 'timer', 'log-out', 'undo-2', 'eye', 'image', 'palette', 'globe', 'database',
  'file-json', 'file-spreadsheet', 'sliders-horizontal', 'notebook-pen', 'list-todo', 'bitcoin', 'store', 'clock', 'circle-check', 'sparkles', 'history',
  'scale', 'percent', 'tags', 'refresh-cw', 'wallet-cards', 'archive', 'archive-restore', 'delete', 'hand-coins', 'receipt-text', 'bell', 'circle-dollar-sign',
  'layout-dashboard', 'menu', 'server', 'boxes', 'truck', 'hourglass', 'calendar-clock', 'box', 'package-plus', 'package-minus', 'shopping-cart', 'users', 'laptop', 'clipboard-list', 'badge-dollar-sign', 'warehouse', 'package-check', 'arrow-down-to-line', 'eye-off', 'bold', 'italic', 'underline', 'list', 'list-ordered', 'pin', 'pin-off', 'square-check', 'chart-line', 'sticky-note', 'eraser', 'calendar-check', 'circle-dashed', 'sunrise', 'repeat', 'house-plus', 'pie-chart', 'heart-pulse', 'graduation-cap', 'plane', 'zap', 'film', 'briefcase',
];

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'node_modules', 'lucide-static', 'icons');
const out = path.join(here, '..', 'assets', 'icons', 'sprite.svg');
const missing = [];
const symbols = [];
for (const name of [...new Set(ICONS)]) {
  const file = path.join(src, `${name}.svg`);
  if (!fs.existsSync(file)) { missing.push(name); continue; }
  const inner = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '').replace(/\s+/g, ' ').trim();
  symbols.push(`<symbol id="${name}" viewBox="0 0 24 24">${inner}</symbol>`);
}
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${symbols.join('')}</svg>`);
console.log(`sprite.svg: ${symbols.length} icons, ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
if (missing.length) console.warn('Not found in lucide-static (skipped):', missing.join(', '));
