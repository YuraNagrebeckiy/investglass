const LS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const $ = (id) => document.getElementById(id);
const COL = { sup: '#3F7052', res: '#A94841', trend: '#4A6B88', entry: '#3F7052', exit: '#A94841', mark: '#8E6420' };
const TOOLS = [['sup', 'Поддержка'], ['res', 'Сопротивление'], ['trend', 'Тренд'], ['entry', 'Вход'], ['exit', 'Выход'], ['mark', 'Отметка']];
let cap = null, st = null;

export function assetKey() {
  const sh = $('sheet');
  if (!sh || sh.hidden) return null;
  const h = sh.querySelector('h2');
  const a = [...sh.querySelectorAll('aside a')].map((x) => x.href).join(' ');
  const id = (/forum\/([^/]+)\//.exec(a) || /trade-spot\/([^"\s]+)/.exec(a) || [])[1];
  const market = a.includes('smart-lab') ? 'stocks' : 'crypto';
  return h && id ? { id: id.toUpperCase(), market, name: h.firstChild ? h.firstChild.textContent.trim() : id } : null;
}

function wrap(LW) {
  if (!LW || LW.__ig) return;
  try {
    const orig = LW.createChart;
    LW.createChart = function (...a) {
      const ch = orig.apply(this, a), add = ch.addCandlestickSeries.bind(ch);
      ch.addCandlestickSeries = (...b) => { const s = add(...b); cap = { chart: ch, series: s, lines: [], series2: [] }; setTimeout(mount, 0); return s; };
      return ch;
    };
    LW.__ig = 1;
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

const load = (k) => LS('ig_draw:' + k.market + ':' + k.id, []);
const save = (k, d) => localStorage.setItem('ig_draw:' + k.market + ':' + k.id, JSON.stringify(d));

function render() {
  if (!cap || !st) return;
  cap.lines.forEach((l) => { try { cap.series.removePriceLine(l); } catch { /* gone */ } });
  cap.series2.forEach((s) => { try { cap.chart.removeSeries(s); } catch { /* gone */ } });
  cap.lines = []; cap.series2 = [];
  const marks = [];
  for (const d of st.data) {
    if (d.t === 'sup' || d.t === 'res') cap.lines.push(cap.series.createPriceLine({ price: d.p, color: COL[d.t], lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: d.t === 'sup' ? 'Поддержка' : 'Сопротивление' }));
    else if (d.t === 'trend') {
      const s = cap.chart.addLineSeries({ color: COL.trend, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      const pts = d.t1 <= d.t2 ? [{ time: d.t1, value: d.p1 }, { time: d.t2, value: d.p2 }] : [{ time: d.t2, value: d.p2 }, { time: d.t1, value: d.p1 }];
      if (pts[0].time !== pts[1].time) s.setData(pts);
      cap.series2.push(s);
    } else marks.push({ time: d.time, position: d.t === 'exit' ? 'aboveBar' : 'belowBar', color: COL[d.t], shape: d.t === 'entry' ? 'arrowUp' : d.t === 'exit' ? 'arrowDown' : 'circle', text: d.note || (d.t === 'entry' ? 'Вход' : d.t === 'exit' ? 'Выход' : 'Отметка') });
  }
  marks.sort((a, b) => a.time - b.time);
  try { cap.series.setMarkers(marks); } catch { /* no data yet */ }
  const n = $('dtbN'); if (n) n.textContent = st.data.length ? `Рисунков: ${st.data.length}` : 'Выберите инструмент и нажмите на график';
}

function mount() {
  const k = assetKey(), el = $('shChart');
  if (!k || !el || !cap) return;
  st = { key: k, data: load(k), tool: null, pend: null };
  document.querySelectorAll('.dtb').forEach((x) => x.remove());
  const bar = document.createElement('div');
  bar.className = 'dtb'; bar.setAttribute('data-nogl', '');
  bar.innerHTML = TOOLS.map(([t, n]) => `<button class="mini" data-t="${t}">${n}</button>`).join('') + '<button class="mini" data-t="undo">Отменить</button><button class="mini" data-t="clear">Очистить</button><span id="dtbN" class="hint"></span>';
  el.before(bar);
  bar.onclick = (e) => {
    const t = e.target.dataset.t; if (!t) return;
    if (t === 'undo') { st.data.pop(); save(k, st.data); render(); return; }
    if (t === 'clear') { if (st.data.length && confirm('Удалить все рисунки по этому активу?')) { st.data = []; save(k, st.data); render(); } return; }
    st.tool = st.tool === t ? null : t; st.pend = null;
    bar.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === st.tool));
    const n = $('dtbN'); if (n) n.textContent = st.tool === 'trend' ? 'Нажмите на две точки графика' : st.tool ? 'Нажмите на график, чтобы поставить отметку' : '';
  };
  const chart = cap.chart, series = cap.series;
  chart.subscribeClick((p) => {
    if (!st || !st.tool || !p.point || !p.time) return;
    const price = series.coordinateToPrice(p.point.y);
    if (price == null) return;
    const t = st.tool;
    if (t === 'sup' || t === 'res') st.data.push({ t, p: price });
    else if (t === 'trend') {
      if (!st.pend) { st.pend = { time: p.time, p: price }; const n = $('dtbN'); if (n) n.textContent = 'Нажмите на вторую точку'; return; }
      st.data.push({ t, t1: st.pend.time, p1: st.pend.p, t2: p.time, p2: price }); st.pend = null;
    } else {
      const note = t === 'mark' ? (prompt('Подпись к отметке (можно пусто):') || '') : '';
      st.data.push({ t, time: p.time, p: price, note });
    }
    save(k, st.data); render();
  });
  render();
}

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'shEnter') setTimeout(() => {
    if (!st) return;
    const j = LS('ig_journal', []);
    const rec = j.reduce((a, b) => (!a || b.id > a.id ? b : a), null);
    if (rec && st.data.length && !rec.drawings) { rec.drawings = st.data.map((x) => ({ ...x })); localStorage.setItem('ig_journal', JSON.stringify(j)); }
  }, 120);
});
export const drawings = (market, id) => LS('ig_draw:' + market + ':' + id, []);
