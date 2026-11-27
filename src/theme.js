const tabInfo = document.querySelector('#tabs [data-tab="info"]');
if (tabInfo) tabInfo.remove();
const lay = document.createElement('link');
lay.rel = 'stylesheet'; lay.href = 'layout.css';
document.head.appendChild(lay);
const root = document.documentElement;
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const mode = () => localStorage.getItem('ig_theme') || 'auto';
const eff = () => (mode() === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : mode());
function apply() {
  root.dataset.theme = eff();
  let m = document.querySelector('meta[name=theme-color]');
  if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
  m.content = eff() === 'dark' ? '#1B1916' : '#F8F6F3';
  window.dispatchEvent(new Event('themechange'));
}
export function setTheme(v) { localStorage.setItem('ig_theme', v); apply(); }
export const themeMode = mode;
apply();
if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (mode() === 'auto') apply(); });
const b = document.getElementById('theme');
if (b) b.addEventListener('click', () => setTheme(eff() === 'light' ? 'dark' : 'light'));
setTimeout(() => { import('./login.js').then(() => import('./sheetsync.js')).catch((e) => console.error('login', e)); }, 0);
setTimeout(() => { import('./account.js').catch((e) => console.error('account', e)); }, 250);
setTimeout(() => { import('./draw.js').then(() => import('./alerts.js')).then(() => import('./patterns.js')).then(() => import('./shlayout.js')).then(() => import('./candles.js')).catch((e) => console.error('alerts', e)); import('./scansearch.js').catch((e) => console.error('scansearch', e)); }, 300);
setTimeout(() => { import('./refresh.js').catch((e) => console.error('refresh', e)); }, 500);
setTimeout(() => { import('./fxdetail.js').catch((e) => console.error('fxdetail', e)); }, 1000);
setTimeout(() => { import('./plan.js').catch((e) => console.error('plan', e)); import('./sectors.js').catch((e) => console.error('sectors', e)); import('./funds.js').catch((e) => console.error('funds', e)); import('./assetinfo.js').catch((e) => console.error('assetinfo', e)); }, 1300);
setTimeout(() => { import('./fxworld.js').catch((e) => console.error('fxworld', e)); }, 1400);
setTimeout(() => { import('./jview.js').catch((e) => console.error('jview', e)); import('./fixes.js').catch((e) => console.error('fixes', e)); import('./dataset.js').catch((e) => console.error('dataset', e)); }, 1600);
