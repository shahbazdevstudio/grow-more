/* Browser-side whitelist sanitiser for note HTML (second layer — the server already sanitises before saving).
   Parsed with DOMParser (an inert document: nothing executes, nothing loads), then rebuilt from allowed tags only. */
const ALLOWED = new Set(['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li']);
const ALIAS = { b: 'strong', i: 'em', div: 'p' };
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math']);

function walk(src, dst) {
  for (const n of src.childNodes) {
    if (n.nodeType === 3) dst.append(document.createTextNode(n.nodeValue));
    else if (n.nodeType === 1) {
      const raw = n.tagName.toLowerCase(); if (DROP.has(raw)) continue;
      const tag = ALIAS[raw] || raw;
      if (!ALLOWED.has(tag)) { walk(n, dst); continue; }
      const el = document.createElement(tag); if (tag !== 'br') walk(n, el); dst.append(el);
    }
  }
}
export function sanitize(htmlStr) {
  const doc = new DOMParser().parseFromString(`<body>${htmlStr || ''}</body>`, 'text/html');
  const out = document.createElement('div'); walk(doc.body, out); return out.innerHTML;
}
export const toText = (htmlStr) => { const d = document.createElement('div'); d.innerHTML = sanitize(htmlStr); return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
