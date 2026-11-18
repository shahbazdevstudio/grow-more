// Tiny static server for the Grow More frontend. Runs separately from the API.
const path = require('path');
const fs = require('fs');
const express = require('express');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const app = express();
const PORT = Number(process.env.PORT) || 5173;
const API_URL = (process.env.API_URL || 'https://grow-more-backend-ten.vercel.app').replace(/\/+$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://grow-more-shahbaz.vercel.app').replace(/\/+$/, '');
const apiOrigin = new URL(API_URL).origin;
const ROOT = __dirname;

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': [`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `style-src-attr 'unsafe-inline'`, `img-src 'self' data: https://res.cloudinary.com`, `font-src 'self'`, `connect-src 'self'`, `manifest-src 'self'`, `worker-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`].join('; '),
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Same-origin API proxy (mirrors the rewrite in vercel.json): the browser only talks to this server, so there is no CORS.
app.use('/api', express.raw({ type: () => true, limit: '1mb' }), async (req, res) => {
  try {
    const headers = { 'content-type': req.get('content-type') || 'application/json', 'x-requested-with': req.get('x-requested-with') || '', origin: FRONTEND_URL };
    if (req.get('cookie')) headers.cookie = req.get('cookie');
    const hasBody = !['GET', 'HEAD'].includes(req.method) && Buffer.isBuffer(req.body) && req.body.length;
    const r = await fetch(API_URL + req.originalUrl, { method: req.method, headers, body: hasBody ? req.body : undefined, redirect: 'manual' });
    res.status(r.status);
    r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie', 'connection'].includes(k)) res.set(k, v); });
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((c) => res.append('Set-Cookie', c.replace(/;\s*Secure/i, '').replace(/;\s*SameSite=None/i, '; SameSite=Lax')));
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch { res.status(502).json({ error: 'Cannot reach the server. Please try again.', code: 'NETWORK' }); }
});

// Runtime config → the API address can change per deployment without editing code
app.get('/config.js', (req, res) => res.type('application/javascript').set('Cache-Control', 'no-store').send('window.GROW_MORE_CONFIG={"API_URL":""};'));

// Lists logo files you drop into assets/logos/ so the app only requests files that exist
app.get('/assets/logos/index.json', (req, res) => {
  const dir = path.join(ROOT, 'assets', 'logos');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^[a-z0-9-]+\.(svg|png|webp|jpg)$/i.test(f)) : [];
  res.set('Cache-Control', 'no-cache').json(files);
});

const BLOCK = /^\/(server\.js|package(-lock)?\.json|\.env.*|tools|node_modules|README\.md)/i;
app.use((req, res, next) => (BLOCK.test(req.path) ? res.status(404).end() : next()));
app.use(express.static(ROOT, {
  index: 'index.html', dotfiles: 'deny',
  setHeaders: (res, p) => {
    if (/\.(woff2|png|svg|webp)$/.test(p)) res.set('Cache-Control', 'public, max-age=2592000, immutable');
    else res.set('Cache-Control', 'no-cache');
  },
}));
app.use((req, res) => res.status(404).type('text').send('Not found'));

app.listen(PORT, () => console.log(`[grow-more] Frontend on http://localhost:${PORT}  (API: ${API_URL})`));
