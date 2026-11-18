/**
 * Vercel build step (`npm run build`): copies ONLY the browser files into public/ (so server.js, package files,
 * scripts/ and .env never become downloadable) and writes the two files the local Express server generates on the fly:
 *   config.js               -> API_URL "" = same origin; vercel.json forwards /api/* to your backend project
 *   assets/logos/index.json -> list of official logo files you dropped into assets/logos/
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');
const OUT = path.join(__dirname, '..', 'public');
const COPY = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'components', 'pages', 'assets'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const name of COPY) {
  const from = path.join(SRC, name);
  if (!fs.existsSync(from)) throw new Error(`${name} is missing - cannot build.`);
  fs.cpSync(from, path.join(OUT, name), { recursive: true });
}

fs.writeFileSync(path.join(OUT, 'config.js'), `window.GROW_MORE_CONFIG=${JSON.stringify({ API_URL: '' })};\n`);

const logoDir = path.join(OUT, 'assets', 'logos');
fs.mkdirSync(logoDir, { recursive: true });
const logos = fs.readdirSync(logoDir).filter((f) => /^[a-z0-9-]+\.(svg|png|webp|jpg)$/i.test(f));
fs.writeFileSync(path.join(logoDir, 'index.json'), JSON.stringify(logos));

const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`[build] public/ ready: ${count(OUT)} files, ${logos.length} logo file(s), API_URL="" (same origin)`);
