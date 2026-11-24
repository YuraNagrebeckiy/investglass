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
setTimeout(() => { import('./draw.js').then(() => import('./alerts.js')).catch((e) => console.error('alerts', e)); }, 300);
setTimeout(() => { import('./fxdetail.js').catch((e) => console.error('fxdetail', e)); }, 1000);
setTimeout(() => { import('./plan.js').catch((e) => console.error('plan', e)); import('./sectors.js').catch((e) => console.error('sectors', e)); }, 1300);
