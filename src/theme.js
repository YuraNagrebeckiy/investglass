const BOOT_OFF = localStorage.getItem('boot_off') === '1';
const B = { t0: performance.now(), steps: new Map(), total: 19, done: 0, last: performance.now(), closed: false, prog: 0 };
const WHY = { moex: 'Мосбиржа отвечает медленно или недоступна из вашей сети: приложение пробует запасные пути.', cbr: 'Запрашиваю официальные курсы ЦБ РФ.', ecb: 'Запрашиваю дневные курсы мировых валют ЕЦБ.', okx: 'Запрашиваю котировки криптобиржи OKX.', sheet: 'Загружаю и сверяю ваши данные с Google Таблицей.', lib: 'Скачиваю библиотеку графиков.', bonds: 'База облигаций большая, при медленном интернете она грузится дольше.', cfg: 'Загружаю справочники: тарифы, ставки, вклады.', app: 'Загружаю файлы приложения.', other: 'Загружаю дополнительные данные.' };

function labelFor(u) {
  try {
    const x = new URL(u, location.href);
    let h = x.host, p = x.pathname, via = false;
    if (/corsproxy|allorigins|codetabs|thingproxy/.test(h)) { via = true; const inner = decodeURIComponent(x.href); const m = /https?:\/\/([^/?]+)(\/[^?\s]*)?/.exec(inner.slice(inner.indexOf('http', 8))); if (m) { h = m[1]; p = m[2] || ''; } }
    const k = h === 'iss.moex.com' ? ['moex', 'Котировки Мосбиржи'] : /cbr-xml-daily/.test(h) ? ['cbr', 'Курсы ЦБ РФ'] : /frankfurter/.test(h) ? ['ecb', 'Мировые валютные пары (ЕЦБ)'] : /okx\.com/.test(h) ? ['okx', 'Крипта: биржа OKX'] : /script\.google\.com/.test(h) ? ['sheet', 'Облако: Google Таблица'] : /unpkg/.test(h) ? ['lib', 'Библиотека графиков'] : /bonds\.json/.test(p) ? ['bonds', 'База облигаций'] : /\/(data|config)\//.test(p) ? ['cfg', 'Справочники и настройки'] : h === location.host ? ['app', 'Файлы приложения'] : ['other', 'Прочие данные'];
    return { k: k[0], n: k[1], via };
  } catch { return { k: 'other', n: 'Прочие данные', via: false }; }
}
function begin(l) {
  let s = B.steps.get(l.k);
  if (!s) { s = { k: l.k, n: l.n, start: performance.now() - B.t0, end: null, total: 0, done: 0, fail: 0, pend: 0, via: false }; B.steps.set(l.k, s); }
  s.total++; s.pend++; s.end = null; if (l.via) s.via = true; B.last = performance.now();
  return s;
}
function finish(s, ok) { s.pend--; s.done++; if (!ok) s.fail++; if (s.pend === 0) s.end = performance.now() - B.t0; B.last = performance.now(); }

if (!BOOT_OFF) {
  const orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const u = typeof input === 'string' ? input : (input && input.url) || String(input);
    const s = begin(labelFor(u));
    return orig(input, init).then((r) => { finish(s, r.ok); return r; }, (e) => { finish(s, false); throw e; });
  };
}
const imp = (p) => import(p).catch((e) => console.error(p, e)).finally(() => { B.done++; B.last = performance.now(); });

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

function boot() {
  const css = document.createElement('style');
  css.textContent = '#boot{position:fixed;inset:0;z-index:250;display:flex;align-items:center;justify-content:center;padding:14px;background:var(--backdrop,rgba(0,0,0,.4));backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:opacity .35s}#boot.off{opacity:0;pointer-events:none}#boot .panel{width:min(480px,100%);margin:auto}#boot h2{margin:0 0 4px}.bt-bar{height:12px;border-radius:999px;background:var(--kpi);overflow:hidden;margin:10px 0 4px}.bt-bar i{display:block;height:100%;background:var(--bar,var(--acc));border-radius:999px;transition:width .3s}.bt-row{display:grid;grid-template-columns:42% 1fr;gap:8px;align-items:center;font-size:12px;margin:6px 0}.bt-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-tr{position:relative;height:16px;background:var(--kpi);border-radius:8px}.bt-tr i{position:absolute;top:2px;bottom:2px;border-radius:6px;background:var(--acc2,var(--acc));min-width:6px}.bt-tr i.p{opacity:.55}.bt-tr i.f{background:var(--bad)}.bt-tr em{position:absolute;right:6px;top:0;font-style:normal;font-size:11px;line-height:16px;color:var(--txt)}.bt-why{font-size:13px;margin:10px 0 4px}.bt-act{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:8px}.bt-act .lk{background:none;border:0;color:var(--mut);text-decoration:underline;cursor:pointer;font:inherit;font-size:12px;padding:6px 0}';
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.id = 'boot';
  el.innerHTML = '<div class="panel"><h2>Загружаю приложение</h2><p class="hint" id="btSub"></p><div class="bt-bar"><i id="btBar" style="width:2%"></i></div><div class="hint" id="btPct"></div><div id="btRows"></div><p class="bt-why" id="btWhy"></p><div class="bt-act"><button class="lk" id="btNo">Не показывать больше</button><button class="mini" id="btHide" hidden>Скрыть</button></div></div>';
  document.body.appendChild(el);
  const close = () => { if (B.closed) return; B.closed = true; clearInterval(tm); el.classList.add('off'); setTimeout(() => el.remove(), 400); };
  document.getElementById('btHide').onclick = close;
  document.getElementById('btNo').onclick = () => { localStorage.setItem('boot_off', '1'); close(); };
  const sec = (ms) => (ms / 1000).toFixed(1).replace('.', ',');
  const tick = () => {
    const now = performance.now(), el_ms = now - B.t0, steps = [...B.steps.values()];
    const reqTot = steps.reduce((a, s) => a + s.total, 0), reqDone = steps.reduce((a, s) => a + s.done, 0), pend = steps.reduce((a, s) => a + s.pend, 0);
    const modDone = B.done >= B.total;
    const finished = modDone && pend === 0 && now - B.last > 700 && el_ms > 900;
    const raw = 0.4 * Math.min(1, B.done / B.total) + 0.6 * (reqTot ? reqDone / reqTot : 0);
    B.prog = finished ? 1 : Math.max(B.prog, Math.min(0.97, raw));
    document.getElementById('btBar').style.width = Math.max(2, B.prog * 100) + '%';
    document.getElementById('btPct').textContent = `Прошло ${sec(el_ms)} с · примерно ${Math.round(B.prog * 100)}%`;
    document.getElementById('btSub').textContent = `Модулей приложения: ${Math.min(B.done, B.total)} из ${B.total}. Запросов данных: ${reqDone} из ${reqTot}.`;
    const T = Math.max(el_ms, 2000);
    const rows = [{ n: 'Модули приложения', start: 0, end: modDone ? B.last - B.t0 : null, fail: 0, done: B.done, total: B.total }, ...steps].map((s) => {
      const e = s.end ?? el_ms, l = (s.start / T) * 100, w = Math.max(2, ((e - s.start) / T) * 100), st = s.fail ? 'f' : s.end == null ? 'p' : '';
      const mark = s.end == null ? '…' : s.fail ? `есть сбои: ${s.fail}` : '✓';
      return `<div class="bt-row"><span>${s.n}${s.via ? ' (через прокси)' : ''}</span><div class="bt-tr"><i class="${st}" style="left:${Math.min(l, 96)}%;width:${Math.min(w, 100 - Math.min(l, 96))}%"></i><em>${sec(e - s.start)} с ${mark}</em></div></div>`;
    });
    document.getElementById('btRows').innerHTML = rows.join('');
    const wait = steps.filter((s) => s.pend > 0).sort((a, c) => a.start - c.start)[0];
    let why;
    if (wait) why = `Сейчас жду: ${wait.n}${wait.via ? ' через прокси' : ''}, уже ${sec(el_ms - wait.start)} с. ${WHY[wait.k] || ''}`;
    else if (!modDone) why = 'Запускаю модули приложения.';
    else why = 'Почти готово.';
    if (el_ms > 8000 && (wait || !modDone)) why += ' Это дольше обычного, окно можно скрыть: приложение уже работает.';
    const failed = steps.filter((s) => s.fail);
    if (failed.length && !wait) why += ` Не ответили: ${failed.map((s) => s.n).join(', ')}. Приложение использует запасные данные.`;
    document.getElementById('btWhy').textContent = why;
    if (el_ms > 2000) document.getElementById('btHide').hidden = false;
    if (finished && (!failed.length || el_ms > 3500)) setTimeout(close, failed.length ? 1500 : 250);
    if (el_ms > 45000) close();
  };
  const tm = setInterval(tick, 200);
  tick();
}
if (!BOOT_OFF && document.body) boot();

function bootSetting() {
  const sh = document.getElementById('cfgSheet');
  if (!sh || sh.hidden || document.getElementById('bootSet')) return;
  const row = document.createElement('div');
  row.className = 'set'; row.id = 'bootSet';
  row.innerHTML = '<div><b>Окно загрузки при запуске</b><p>Показывает, что именно грузится и почему приходится ждать.</p></div><label class="sw"><input type="checkbox" id="bootChk"><span></span></label>';
  const ref = sh.querySelector('#cfgRefresh') || sh.querySelector('.note');
  if (ref) ref.before(row); else sh.querySelector('.panel').appendChild(row);
  const c = document.getElementById('bootChk');
  c.checked = localStorage.getItem('boot_off') !== '1';
  c.onchange = () => { if (c.checked) localStorage.removeItem('boot_off'); else localStorage.setItem('boot_off', '1'); };
}
new MutationObserver(bootSetting).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

setTimeout(() => { imp('./login.js').then(() => imp('./sheetsync.js')); }, 0);
setTimeout(() => { imp('./account.js'); }, 250);
setTimeout(() => { imp('./draw.js').then(() => imp('./alerts.js')).then(() => imp('./patterns.js')).then(() => imp('./shlayout.js')).then(() => imp('./candles.js')); imp('./scansearch.js'); }, 300);
setTimeout(() => { imp('./refresh.js'); }, 500);
setTimeout(() => { imp('./fxdetail.js'); }, 1000);
setTimeout(() => { imp('./plan.js'); imp('./sectors.js'); imp('./funds.js'); imp('./assetinfo.js'); }, 1300);
setTimeout(() => { imp('./fxworld.js'); }, 1400);
setTimeout(() => { imp('./jview.js'); imp('./fixes.js'); imp('./dataset.js'); }, 1600);
