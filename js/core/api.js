const cfg = window.GROW_MORE_CONFIG || {};
// API_URL "" (set by the Vercel build) = same origin: the API lives at /api on this domain. Local dev: http://localhost:5000.
const apiUrl = typeof cfg.API_URL === 'string' ? cfg.API_URL : 'http://localhost:5000';
export const API_BASE = `${apiUrl.replace(/\/+$/, '')}/api`;

export class ApiErr extends Error {
  constructor(message, status, code, data) { super(message); this.status = status; this.code = code; this.data = data || {}; }
}

const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && p.append(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

async function send(method, path, body) {
  try {
    return await fetch(API_BASE + path, {
      method,
      credentials: 'include', // httpOnly session cookie — no token is ever kept in JavaScript or localStorage
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GrowMore' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiErr('Cannot reach the server. Check your connection and try again.', 0, 'NETWORK');
  }
}

async function fail(res, path) {
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (res.status === 401 && data && data.code === 'LOCKED' && !path.startsWith('/auth/')) window.dispatchEvent(new Event('gm:session-ended'));
  throw new ApiErr((data && data.error) || `Request failed (${res.status}).`, res.status, data && data.code, data);
}

async function request(method, path, body) {
  const res = await send(method, path, body);
  if (!res.ok) await fail(res, path);
  return res.json();
}

export const api = {
  get: (path, params) => request('GET', path + qs(params)),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
  async download(path, filename) {
    const res = await send('GET', path);
    if (!res.ok) await fail(res, path);
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  },
};
