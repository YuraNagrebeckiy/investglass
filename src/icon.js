const FULL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#585248"/><stop offset="1" stop-color="#26231F"/></linearGradient><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8F6F3"/><stop offset="1" stop-color="#CFCAC2"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="392" cy="112" r="150" fill="#857E71" opacity=".18"/><g stroke-linecap="round"><path d="M150 140V380" stroke="#857E71" stroke-width="12"/><rect x="108" y="236" width="84" height="104" rx="26" fill="#B2ABA0"/><path d="M256 108V404" stroke="#B2ABA0" stroke-width="12"/><rect x="214" y="176" width="84" height="144" rx="26" fill="#CFCAC2"/><path d="M362 80V340" stroke="#CFCAC2" stroke-width="12"/><rect x="320" y="116" width="84" height="164" rx="26" fill="url(#s)"/></g></svg>';
const head = document.head;
const add = (tag, attrs) => { const e = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); head.appendChild(e); return e; };
const set = (n, c) => { let m = head.querySelector(`meta[name="${n}"]`); if (!m) m = add('meta', { name: n }); m.setAttribute('content', c); };

add('link', { rel: 'icon', type: 'image/svg+xml', href: 'icon.svg' });
add('link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' });
add('link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' });
add('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,600&family=Montserrat:wght@500;600;700&display=swap' });
set('apple-mobile-web-app-capable', 'yes');
set('mobile-web-app-capable', 'yes');
set('apple-mobile-web-app-title', 'InvestGlass');
set('apple-mobile-web-app-status-bar-style', 'default');
set('application-name', 'InvestGlass');

const png = (size) => new Promise((res) => {
  const img = new Image();
  img.onload = () => {
    try { const c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d').drawImage(img, 0, 0, size, size); res(c.toDataURL('image/png')); } catch { res(null); }
  };
  img.onerror = () => res(null);
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(FULL);
});

(async () => {
  const [p180, p192, p512] = await Promise.all([png(180), png(192), png(512)]);
  if (!p512) return;
  add('link', { rel: 'apple-touch-icon', sizes: '180x180', href: p180 });
  add('link', { rel: 'icon', type: 'image/png', sizes: '192x192', href: p192 });
  const base = new URL('./', location.href).href;
  const manifest = {
    name: 'InvestGlass', short_name: 'InvestGlass', lang: 'ru', start_url: base, scope: base, display: 'standalone',
    background_color: '#F8F6F3', theme_color: '#332F2A',
    icons: [{ src: p192, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: p512, sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: p512, sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
  };
  head.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove());
  add('link', { rel: 'manifest', href: URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' })) });
})();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
