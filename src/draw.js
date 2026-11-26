const LS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const TOOLS = [['cur', 'Курсор'], ['edit', 'Править'], ['pen', 'Карандаш'], ['line', 'Линия'], ['lvl', 'Уровень'], ['rect', 'Зона'], ['fib', 'Фибо'], ['long', 'Лонг'], ['short', 'Шорт'], ['erase', 'Ластик']];
const HINT = { cur: 'Курсор: двигайте и масштабируйте график, как обычно.', edit: 'Править: потяните за точку или линию, чтобы передвинуть рисунок.', pen: 'Карандаш: проведите пальцем по графику.', line: 'Линия: протяните от первой точки ко второй.', lvl: 'Уровень: нажмите на цену, поставится поддержка или сопротивление.', rect: 'Зона: протяните по диагонали.', fib: 'Фибоначчи: протяните от минимума к максимуму или наоборот.', long: 'Лонг: нажмите на вход и протяните вверх до цели, стоп поставится сам. Потом поправьте в режиме «Править».', short: 'Шорт: нажмите на вход и протяните вниз до цели, стоп поставится сам. Потом поправьте в режиме «Править».', erase: 'Ластик: нажмите на рисунок, чтобы удалить.' };
let cap = null, cur = null, fees = null;

export function assetKey() {
  const sh = $('sheet');
  if (!sh || sh.hidden) return null;
  const h = sh.querySelector('h2');
  const a = [...sh.querySelectorAll('aside a')].map((x) => x.href).join(' ');
  const id = (/forum\/([^/]+)\//.exec(a) || /trade-spot\/([^"\s]+)/.exec(a) || [])[1];
  const market = a.includes('smart-lab') ? 'stocks' : 'crypto';
  return h && id ? { id: id.toUpperCase(), market, name: h.firstChild ? h.firstChild.textContent.trim() : id } : null;
}
export const drawings = (market, id) => LS('ig_draw:' + market + ':' + id, []);
export const chartData = () => (cur && cur.c && cur.c.data) || [];
export function setBand(t0, t1) { if (cur) { cur.band = t0 == null ? null : [t0, t1]; cur.sig = ''; } }

function wrap(LW) {
  if (!LW || LW.__ig2) return;
  try {
    const orig = LW.createChart;
    LW.createChart = function (el, ...a) {
      const ch = orig.call(this, el, ...a), add = ch.addCandlestickSeries.bind(ch);
      ch.addCandlestickSeries = (...b) => {
        const s = add(...b), c = { chart: ch, series: s, el, data: [] };
        const sd = s.setData.bind(s), up = s.update.bind(s);
        s.setData = (d) => { c.data = d.map((x) => ({ t: x.time, o: x.open, h: x.high, l: x.low, c: x.close })); return sd(d); };
        s.update = (x) => { const L = c.data[c.data.length - 1]; const n = { t: x.time, o: x.open, h: x.high, l: x.low, c: x.close }; if (L && L.t === n.t) c.data[c.data.length - 1] = n; else c.data.push(n); return up(x); };
        cap = c; setTimeout(() => mount(c), 0); return s;
      };
      return ch;
    };
    LW.__ig2 = 1;
  } catch { /* library is frozen */ }
}
if (window.LightweightCharts) wrap(window.LightweightCharts);
else {
  Object.defineProperty(window, 'LightweightCharts', {
    configurable: true,
    get() { return undefined; },
    set(v) { wrap(v); Object.defineProperty(window, 'LightweightCharts', { value: v, writable: true, configurable: true }); },
  });
}

const stAll = (k) => { const raw = LS('ig_draw:' + k.market + ':' + k.id, []); return raw.map((d) => (d.t === 'trend' ? { t: 'line', a: [d.t1, d.p1], b: [d.t2, d.p2] } : d)); };

function mount(c) {
  if (c.el.id !== 'shChart') return;
  const k = assetKey();
  if (!k) return;
  if (cur) { cur.alive = false; if (cur.root) cur.root.remove(); }
  document.querySelectorAll('.dtb').forEach((x) => x.remove());
  const st = { c, k, data: stAll(k), tool: 'cur', tmp: null, drag: null, sel: -1, alive: true, sig: '', band: cur && cur.band };
  cur = st;
  c.el.style.position = 'relative';
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none;touch-action:none';
  c.el.appendChild(cv);
  st.cv = cv; st.g = cv.getContext('2d');
  const bar = document.createElement('div');
  bar.className = 'dtb'; bar.setAttribute('data-nogl', '');
  bar.innerHTML = `<div class="dtt">${TOOLS.map(([t, n]) => `<button class="mini${t === 'cur' ? ' on' : ''}" data-t="${t}">${n}</button>`).join('')}<button class="mini" data-t="undo">Отменить</button><button class="mini" data-t="clear">Очистить</button></div><div id="dtbN" class="hint">${HINT.cur}</div><div id="dtbRisk"></div>`;
  c.el.before(bar);
  st.root = bar;
  bar.addEventListener('click', (e) => {
    const t = e.target.dataset && e.target.dataset.t;
    if (t === 'undo') { st.data.pop(); persist(st); return; }
    if (t === 'clear') { if (st.data.length && confirm('Удалить все рисунки по этому активу?')) { st.data = []; persist(st); } return; }
    if (t) setTool(st, t);
    if (e.target.id === 'dtbApply') applyPlan(st);
  });
  new ResizeObserver(() => { st.sig = ''; }).observe(c.el);
  bind(st);
  loop(st);
  document.dispatchEvent(new CustomEvent('ig:chart'));
  if (!fees) fetch('config/fees.json').then((r) => r.json()).then((f) => { fees = f; st.sig = ''; }).catch(() => {});
  risk(st);
}

function setTool(st, t) {
  st.tool = t; st.tmp = null; st.drag = null;
  st.root.querySelectorAll('.dtt [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  st.cv.style.pointerEvents = t === 'cur' ? 'none' : 'auto';
  const n = $('dtbN'); if (n) n.textContent = HINT[t] || '';
}
function persist(st) { localStorage.setItem('ig_draw:' + st.k.market + ':' + st.k.id, JSON.stringify(st.data)); st.sig = ''; risk(st); }

const nbar = (c) => (c.data.length > 1 ? c.data[c.data.length - 1].t - c.data[c.data.length - 2].t : 3600);
function idxOf(c, t) {
  const d = c.data, n = d.length;
  if (!n) return 0;
  const dur = nbar(c) || 3600;
  if (t <= d[0].t) return (t - d[0].t) / dur;
  if (t >= d[n - 1].t) return n - 1 + (t - d[n - 1].t) / dur;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d[m].t <= t) lo = m; else hi = m; }
  return lo + (t - d[lo].t) / (d[hi].t - d[lo].t || 1);
}
function timeOf(c, i) {
  const d = c.data, n = d.length;
  if (!n) return 0;
  const dur = nbar(c) || 3600;
  if (i <= 0) return d[0].t + i * dur;
  if (i >= n - 1) return d[n - 1].t + (i - (n - 1)) * dur;
  const lo = Math.floor(i);
  return d[lo].t + (i - lo) * (d[lo + 1].t - d[lo].t);
}
const X = (st, t) => st.c.chart.timeScale().logicalToCoordinate(idxOf(st.c, t));
const Y = (st, p) => st.c.series.priceToCoordinate(p);
const T = (st, x) => { const l = st.c.chart.timeScale().coordinateToLogical(x); return l == null ? null : timeOf(st.c, l); };
const P = (st, y) => st.c.series.coordinateToPrice(y);
const pt = (st, e) => { const r = st.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

function atr(st) {
  const tf = ((document.querySelector('#shTf .on') || {}).dataset || {}).t;
  const row = [...document.querySelectorAll('#shLights .mini-t tr')].find((r) => r.children[0] && r.children[0].textContent.trim() === tf);
  const v = row && row.children[4] ? parseFloat(row.children[4].textContent.replace(',', '.')) : NaN;
  if (v > 0) return v;
  const d = st.c.data.slice(-15);
  return d.length ? d.reduce((s, x) => s + (x.h - x.l), 0) / d.length : 1;
}
const lastPrice = (st) => { const d = st.c.data; return d.length ? d[d.length - 1].c : 0; };

function bind(st) {
  const cv = st.cv;
  cv.addEventListener('pointerdown', (e) => {
    if (st.tool === 'cur') return;
    const p = pt(st, e), t = T(st, p.x), pr = P(st, p.y);
    if (t == null || pr == null) return;
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (st.tool === 'erase') { const i = hit(st, p.x, p.y); if (i >= 0) { st.data.splice(i, 1); persist(st); } return; }
    if (st.tool === 'edit') { st.drag = pickHandle(st, p.x, p.y); st.sel = st.drag ? st.drag.i : -1; st.sig = ''; return; }
    if (st.tool === 'lvl') { st.data.push({ t: pr < lastPrice(st) ? 'sup' : 'res', p: pr }); persist(st); return; }
    st.tmp = { tool: st.tool, a: [t, pr], b: [t, pr], pts: [[t, pr]], x0: p.x, y0: p.y };
  });
  cv.addEventListener('pointermove', (e) => {
    const p = pt(st, e);
    if (st.drag) {
      const t = T(st, p.x), pr = P(st, p.y), o = st.data[st.drag.i], h = st.drag.h;
      if (pr == null) return;
      if (h === 'p') o.p = pr;
      else if (h === 'a' || h === 'b') { o[h] = [t ?? o[h][0], pr]; }
      else if (h === 'e') o.e = pr; else if (h === 's') o.s = pr; else if (h === 'tp') o.tp = pr;
      else if (h === 'l' && t != null) { const w = o.t1 - o.t0; o.t0 = t; o.t1 = t + w; }
      else if (h === 'r' && t != null && t > o.t0) o.t1 = t;
      st.sig = ''; return;
    }
    if (!st.tmp) return;
    const t = T(st, p.x), pr = P(st, p.y);
    if (t == null || pr == null) return;
    st.tmp.b = [t, pr];
    if (st.tmp.tool === 'pen') st.tmp.pts.push([t, pr]);
    st.tmp.x1 = p.x; st.tmp.y1 = p.y; st.sig = '';
  });
  const up = () => {
    if (st.drag) { st.drag = null; persist(st); return; }
    const m = st.tmp; if (!m) return;
    st.tmp = null;
    const moved = Math.hypot((m.x1 ?? m.x0) - m.x0, (m.y1 ?? m.y0) - m.y0);
    if (m.tool === 'pen') { if (m.pts.length > 3) st.data.push({ t: 'pen', pts: simplify(m.pts) }); }
    else if (m.tool === 'line' || m.tool === 'rect' || m.tool === 'fib') { if (moved > 8) st.data.push({ t: m.tool, a: m.a, b: m.b }); }
    else if (m.tool === 'long' || m.tool === 'short') {
      const dir = m.tool, e = m.a[1], a = atr(st), sg = dir === 'long' ? 1 : -1;
      let tp = m.b[1], s;
      if (moved < 12 || sg * (tp - e) <= 0) { tp = e + sg * 3 * a; s = e - sg * 2 * a; } else s = e - sg * (tp - e) / 2;
      const bars = Math.max(20, Math.round(st.c.data.length / 6));
      st.data.push({ t: 'pos', dir, t0: m.a[0], t1: timeOf(st.c, idxOf(st.c, m.a[0]) + bars), e, s, tp });
      persist(st); st.sel = st.data.length - 1; setTool(st, 'edit'); return;
    }
    persist(st);
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
}

function simplify(a) {
  if (a.length <= 160) return a;
  const k = Math.ceil(a.length / 160);
  return a.filter((_, i) => i % k === 0 || i === a.length - 1);
}

function dseg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function geom(st, o) {
  const W = st.cv.clientWidth;
  switch (o.t) {
    case 'sup': case 'res': { const y = Y(st, o.p); return y == null ? [] : [['seg', 0, y, W, y]]; }
    case 'line': { const a = [X(st, o.a[0]), Y(st, o.a[1])], b = [X(st, o.b[0]), Y(st, o.b[1])]; return a[0] == null || b[0] == null || a[1] == null || b[1] == null ? [] : [['seg', a[0], a[1], b[0], b[1]]]; }
    case 'pen': { const s = []; let prev = null; for (const [t, p] of o.pts) { const x = X(st, t), y = Y(st, p); if (x == null || y == null) { prev = null; continue; } if (prev) s.push(['seg', prev[0], prev[1], x, y]); prev = [x, y]; } return s; }
    case 'rect': case 'fib': { const x1 = X(st, o.a[0]), x2 = X(st, o.b[0]), y1 = Y(st, o.a[1]), y2 = Y(st, o.b[1]); if ([x1, x2, y1, y2].some((v) => v == null)) return []; return [['box', Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]]; }
    case 'pos': { const x1 = X(st, o.t0), x2 = X(st, o.t1), ys = [o.e, o.s, o.tp].map((p) => Y(st, p)); if (x1 == null || x2 == null || ys.some((v) => v == null)) return []; return [['box', x1, Math.min(...ys), x2, Math.max(...ys)], ...ys.map((y) => ['seg', x1, y, x2, y])]; }
    case 'entry': case 'exit': case 'mark': { const x = X(st, o.time), y = Y(st, o.p); return x == null || y == null ? [] : [['pt', x, y]]; }
    default: return [];
  }
}
function hit(st, x, y) {
  let best = -1, bd = 22;
  st.data.forEach((o, i) => {
    for (const g of geom(st, o)) {
      let d = 1e9;
      if (g[0] === 'seg') d = dseg(x, y, g[1], g[2], g[3], g[4]);
      else if (g[0] === 'pt') d = Math.hypot(x - g[1], y - g[2]);
      else if (g[0] === 'box') d = x >= g[1] && x <= g[3] && y >= g[2] && y <= g[4] ? 12 : Math.min(dseg(x, y, g[1], g[2], g[3], g[2]), dseg(x, y, g[1], g[4], g[3], g[4]), dseg(x, y, g[1], g[2], g[1], g[4]), dseg(x, y, g[3], g[2], g[3], g[4]));
      if (d < bd) { bd = d; best = i; }
    }
  });
  return best;
}
function pickHandle(st, x, y) {
  let best = null, bd = 26;
  const test = (i, h, hx, hy, vertOnly) => { if (hx == null || hy == null) return; const d = vertOnly ? Math.abs(y - hy) : Math.hypot(x - hx, y - hy); if (d < bd) { bd = d; best = { i, h }; } };
  st.data.forEach((o, i) => {
    if (o.t === 'sup' || o.t === 'res') test(i, 'p', x, Y(st, o.p), true);
    else if (o.t === 'line' || o.t === 'rect' || o.t === 'fib') { test(i, 'a', X(st, o.a[0]), Y(st, o.a[1])); test(i, 'b', X(st, o.b[0]), Y(st, o.b[1])); }
    else if (o.t === 'pos') {
      const x1 = X(st, o.t0), x2 = X(st, o.t1);
      test(i, 'l', x1, Y(st, o.e)); test(i, 'r', x2, Y(st, o.e));
      const mx = x1 != null && x2 != null && x >= x1 - 10 && x <= x2 + 10;
      if (mx) { test(i, 'e', x, Y(st, o.e), true); test(i, 's', x, Y(st, o.s), true); test(i, 'tp', x, Y(st, o.tp), true); }
    }
  });
  return best;
}

function feeRate(st) {
  if (!fees) return 0.001;
  const v = (id) => ($(id) ? $(id).value : '');
  if (st.k.market === 'crypto') { const ex = fees.crypto[v('pEx')] || fees.crypto.okx; return (ex[v('pInst') || 'spot'] || ex.spot)[v('pOrd') || 'taker']; }
  const b = fees.brokers.find((x) => x.id === v('pBrk')) || fees.brokers[0];
  return b.brokerRate + b.exchangeStock;
}
function calc(st, o) {
  const num = (id, d) => { const v = $(id) ? parseFloat($(id).value) : NaN; return Number.isFinite(v) ? v : d; };
  const eq = num('pEq', st.k.market === 'crypto' ? 1600 : 200000), rk = num('pRisk', 1), lev = st.k.market === 'crypto' ? num('pLev', 1) || 1 : 1, f = feeRate(st);
  const sg = o.dir === 'long' ? 1 : -1, dist = sg * (o.e - o.s), gain = sg * (o.tp - o.e);
  if (!(dist > 0) || !(gain > 0)) return { bad: true, text: dist > 0 ? 'Цель стоит не с той стороны от входа.' : 'Стоп стоит не с той стороны от входа.' };
  const perUnit = dist + f * (o.e + o.s);
  let qty = (eq * rk / 100) / perUnit, capped = false;
  if (qty * o.e > eq * lev) { qty = (eq * lev) / o.e; capped = true; }
  const loss = qty * perUnit, rawWin = qty * (gain - f * (o.e + o.tp)), tax = Math.max(0, rawWin) * 0.13;
  return { qty, loss, win: rawWin, after: rawWin - tax, rr: rawWin / loss, stopPct: (dist / o.e) * 100, tpPct: (gain / o.e) * 100, capped, fee: f, a: atr(st), dist, gain };
}
const nf = (x, d = 2) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d }).format(x);

function risk(st) {
  const box = $('dtbRisk'); if (!box) return;
  let i = st.sel >= 0 && st.data[st.sel] && st.data[st.sel].t === 'pos' ? st.sel : -1;
  if (i < 0) for (let j = st.data.length - 1; j >= 0; j--) if (st.data[j].t === 'pos') { i = j; break; }
  if (i < 0) { box.innerHTML = ''; return; }
  const o = st.data[i], r = calc(st, o), cu = st.k.market === 'crypto' ? 'USDT' : '₽';
  if (r.bad) { box.innerHTML = `<div class="note">${r.text}</div>`; return; }
  const q = r.rr >= 1.5 ? 'good' : 'warn';
  box.innerHTML = `<div class="dtr"><b>${o.dir === 'long' ? 'Лонг' : 'Шорт'}: риск и выход</b><span>Стоп −${nf(r.stopPct)}%, цель +${nf(r.tpPct)}%</span><span>Прибыль к риску после комиссий <b class="${q}">${nf(r.rr)}</b>${r.rr < 1.5 ? ' (ниже 1,5)' : ''}</span><span>Объём ${nf(r.qty, 6)}, убыток по стопу ${nf(r.loss)} ${cu}</span><span>Прибыль по цели ${nf(r.win)} ${cu}, после налога 13% ${nf(r.after)} ${cu}</span>${r.capped ? '<span class="warn">Размер ограничен капиталом и плечом.</span>' : ''}<button class="btn sm" id="dtbApply">Применить к плану ниже</button></div>`;
}
function applyPlan(st) {
  let i = st.sel >= 0 && st.data[st.sel] && st.data[st.sel].t === 'pos' ? st.sel : -1;
  if (i < 0) for (let j = st.data.length - 1; j >= 0; j--) if (st.data[j].t === 'pos') { i = j; break; }
  if (i < 0) return;
  const o = st.data[i], r = calc(st, o);
  if (r.bad) return;
  const dirBtn = document.querySelector(`#shDir [data-d="${o.dir}"]`); if (dirBtn && !dirBtn.classList.contains('on')) dirBtn.click();
  const set = (id, v) => { const el = $(id); if (el) { el.value = (Math.round(v * 10) / 10).toString(); el.dispatchEvent(new Event('input', { bubbles: true })); } };
  set('pStop', r.dist / r.a); set('pTp', r.gain / r.a);
  const t = $('pEq'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function loop(st) {
  const tick = () => {
    if (!st.alive || !st.cv.isConnected) return;
    const c = st.c, ts = c.chart.timeScale(), rg = ts.getVisibleLogicalRange();
    const sig = [st.cv.clientWidth, st.cv.clientHeight, rg ? rg.from.toFixed(2) + rg.to.toFixed(2) : '', Y(st, 1), Y(st, 1000), c.data.length, c.data.length ? c.data[c.data.length - 1].c : 0, st.data.length, st.tmp ? st.tmp.b.join() : '', st.sel, st.band ? st.band.join() : '', fees ? 1 : 0].join('|');
    if (sig !== st.sig) { st.sig = sig; paint(st); }
    requestAnimationFrame(tick);
  };
  tick();
}

function paint(st) {
  const cv = st.cv, W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = st.g;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  g.font = '11px -apple-system, system-ui, sans-serif'; g.lineCap = 'round'; g.lineJoin = 'round';
  const ok = css('--ok') || '#3F7052', bad = css('--bad') || '#A94841', info = css('--info') || '#4A6B88', warn = css('--warn') || '#8E6420', txt = css('--txt') || '#333';
  const label = (s, x, y, col) => { const w = g.measureText(s).width + 8; g.fillStyle = col; g.globalAlpha = 0.92; g.fillRect(x, y - 8, w, 16); g.globalAlpha = 1; g.fillStyle = '#fff'; g.fillText(s, x + 4, y + 4); };
  if (st.band) { const x1 = X(st, st.band[0]), x2 = X(st, st.band[1]); if (x1 != null && x2 != null) { g.fillStyle = info; g.globalAlpha = 0.1; g.fillRect(Math.min(x1, x2), 0, Math.abs(x2 - x1), H); g.globalAlpha = 1; label('окно сравнения', Math.min(x1, x2) + 2, 12, info); } }
  const draw1 = (o, i, tmp) => {
    const sel = i === st.sel && st.tool === 'edit';
    g.lineWidth = sel ? 3 : 2; g.setLineDash([]);
    if (o.t === 'sup' || o.t === 'res') {
      const y = Y(st, o.p); if (y == null) return;
      g.strokeStyle = o.t === 'sup' ? ok : bad; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      label((o.t === 'sup' ? 'Поддержка ' : 'Сопротивление ') + nf(o.p, o.p > 100 ? 2 : 5), 4, y - 10, o.t === 'sup' ? ok : bad);
    } else if (o.t === 'line') {
      const x1 = X(st, o.a[0]), y1 = Y(st, o.a[1]), x2 = X(st, o.b[0]), y2 = Y(st, o.b[1]); if ([x1, y1, x2, y2].some((v) => v == null)) return;
      g.strokeStyle = info; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      if (sel) { g.fillStyle = info; for (const [x, y] of [[x1, y1], [x2, y2]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); } }
    } else if (o.t === 'pen') {
      g.strokeStyle = warn; g.beginPath(); let s = false;
      for (const [t, p] of o.pts) { const x = X(st, t), y = Y(st, p); if (x == null || y == null) { s = false; continue; } if (!s) { g.moveTo(x, y); s = true; } else g.lineTo(x, y); }
      g.stroke();
    } else if (o.t === 'rect') {
      const x1 = X(st, o.a[0]), y1 = Y(st, o.a[1]), x2 = X(st, o.b[0]), y2 = Y(st, o.b[1]); if ([x1, y1, x2, y2].some((v) => v == null)) return;
      g.fillStyle = info; g.globalAlpha = 0.14; g.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); g.globalAlpha = 1;
      g.strokeStyle = info; g.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      if (sel) { g.fillStyle = info; for (const [x, y] of [[x1, y1], [x2, y2]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); } }
    } else if (o.t === 'fib') {
      const x1 = X(st, o.a[0]), x2 = X(st, o.b[0]); if (x1 == null || x2 == null) return;
      const L = Math.min(x1, x2), R = Math.max(x1, x2) + 30;
      FIB.forEach((f, k) => {
        const p = o.b[1] + (o.a[1] - o.b[1]) * f, y = Y(st, p); if (y == null) return;
        g.strokeStyle = k === 0 || k === 6 ? txt : info; g.globalAlpha = 0.85; g.lineWidth = 1; g.setLineDash(k === 0 || k === 6 ? [] : [4, 4]);
        g.beginPath(); g.moveTo(L, y); g.lineTo(Math.max(R, L + 40), y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
        g.fillStyle = txt; g.fillText(`${(f * 100).toFixed(1)}%  ${nf(p, p > 100 ? 2 : 5)}`, Math.max(R, L + 40) + 4, y + 4);
      });
      if (sel) { const y1 = Y(st, o.a[1]), y2 = Y(st, o.b[1]); g.fillStyle = info; for (const [x, y] of [[x1, y1], [x2, y2]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); } }
    } else if (o.t === 'pos') {
      const x1 = X(st, o.t0), x2 = X(st, o.t1), ye = Y(st, o.e), ys = Y(st, o.s), yt = Y(st, o.tp); if ([x1, x2, ye, ys, yt].some((v) => v == null)) return;
      g.globalAlpha = 0.16; g.fillStyle = ok; g.fillRect(x1, Math.min(ye, yt), x2 - x1, Math.abs(yt - ye)); g.fillStyle = bad; g.fillRect(x1, Math.min(ye, ys), x2 - x1, Math.abs(ys - ye)); g.globalAlpha = 1;
      g.lineWidth = sel ? 3 : 2;
      for (const [y, col] of [[ye, info], [ys, bad], [yt, ok]]) { g.strokeStyle = col; g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); }
      const r = calc(st, o);
      label(`Вход ${nf(o.e, o.e > 100 ? 2 : 5)}`, x1 + 4, ye - (ye > (ys + yt) / 2 ? 10 : -10), info);
      label(r.bad ? 'Стоп' : `Стоп −${nf(r.stopPct)}%`, x1 + 4, ys + (ys > ye ? 10 : -10), bad);
      label(r.bad ? 'Цель' : `Цель +${nf(r.tpPct)}%${r.rr ? '  R:R ' + nf(r.rr) : ''}`, x1 + 4, yt + (yt > ye ? 10 : -10), ok);
      if (sel) { g.fillStyle = info; for (const [x, y] of [[x1, ye], [x2, ye]]) { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); } }
    } else if (o.t === 'entry' || o.t === 'exit' || o.t === 'mark') {
      const x = X(st, o.time), y = Y(st, o.p); if (x == null || y == null) return;
      g.fillStyle = o.t === 'exit' ? bad : o.t === 'entry' ? ok : warn; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill();
      if (o.note || o.t !== 'mark') g.fillText(o.note || (o.t === 'entry' ? 'Вход' : 'Выход'), x + 8, y + 4);
    }
  };
  st.data.forEach((o, i) => draw1(o, i));
  const m = st.tmp;
  if (m) {
    const o = m.tool === 'pen' ? { t: 'pen', pts: m.pts } : m.tool === 'long' || m.tool === 'short' ? (() => { const sg = m.tool === 'long' ? 1 : -1, e = m.a[1], tp = sg * (m.b[1] - e) > 0 ? m.b[1] : e + sg * 3 * atr(st); return { t: 'pos', dir: m.tool, t0: m.a[0], t1: timeOf(st.c, idxOf(st.c, m.a[0]) + Math.max(20, Math.round(st.c.data.length / 6))), e, s: e - sg * (tp - e) / 2, tp }; })() : { t: m.tool, a: m.a, b: m.b };
    g.globalAlpha = 0.85; draw1(o, -2); g.globalAlpha = 1;
  }
}

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'shEnter') setTimeout(() => {
    if (!cur || !cur.data.length) return;
    const j = LS('ig_journal', []);
    const rec = j.reduce((a, b) => (!a || b.id > a.id ? b : a), null);
    if (rec && !rec.drawings) { rec.drawings = cur.data.map((x) => ({ ...x })); localStorage.setItem('ig_journal', JSON.stringify(j)); }
  }, 120);
});
document.addEventListener('input', (e) => { if (cur && e.target && /^p(Eq|Risk|Lev|Brk|Ex|Inst|Ord)$/.test(e.target.id)) { cur.sig = ''; risk(cur); } });
document.addEventListener('change', (e) => { if (cur && e.target && /^p(Brk|Ex|Inst|Ord)$/.test(e.target.id)) { cur.sig = ''; risk(cur); } });

const style = document.createElement('style');
style.textContent = '.dtb{margin:8px 0}.dtt{display:flex;gap:6px;overflow-x:auto;padding:2px 0 6px;scrollbar-width:none}.dtt::-webkit-scrollbar{display:none}.dtt .mini{flex:none;min-height:36px;padding:6px 12px;font-size:13px}.dtt .mini.on{background:var(--acc);color:var(--on-acc)}#dtbN{margin:2px 0}.dtr{display:flex;flex-direction:column;gap:3px;padding:10px 12px;margin:6px 0;border-radius:16px;background:var(--kpi);font-size:13px}.dtr .btn{margin-top:8px;align-self:flex-start}';
document.head.appendChild(style);
