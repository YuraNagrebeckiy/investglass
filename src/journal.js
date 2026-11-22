const K = 'ig_journal';
export const all = () => { try { return JSON.parse(localStorage.getItem(K)) || []; } catch { return []; } };
const save = (a) => localStorage.setItem(K, JSON.stringify(a));

export function add(e) {
  const a = all();
  const rec = { id: Date.now(), ts: new Date().toISOString(), status: 'open', ...e };
  a.unshift(rec); save(a); return rec;
}

export function close(id, exit, note, snapshot) {
  const a = all(), r = a.find((x) => x.id === id);
  if (!r) return;
  const d = r.dir === 'short' ? -1 : 1;
  const risk = Math.abs(r.price - r.stop) || 1;
  Object.assign(r, { status: 'closed', exit, exitTs: new Date().toISOString(), exitNote: note, exitSnapshot: snapshot, pnlR: (d * (exit - r.price)) / risk, pnlPct: d * (exit / r.price - 1) * 100 });
  save(a);
}

export function toCSV() {
  const h = ['ts', 'market', 'symbol', 'dir', 'price', 'stop', 'tp', 'qty', 'consensus', 'macd', 'ema', 'rsi', 'status', 'exit', 'pnlR', 'pnlPct'];
  const cell = (r, k) => (k in r ? r[k] : r.lights && k in r.lights ? r.lights[k] : '');
  return [h.join(';')].concat(all().map((r) => h.map((k) => cell(r, k)).join(';'))).join('\n');
}

export function render(el) {
  const rows = all();
  el.innerHTML = '<tr><th>Дата</th><th>Актив</th><th>Напр.</th><th>Вход</th><th>Стоп</th><th>Тейк</th><th>Светофор</th><th>Статус</th><th>Итог, R</th><th></th></tr>' +
    rows.map((r) => `<tr><td>${r.ts.slice(0, 16).replace('T', ' ')}</td><td>${r.symbol}</td><td>${r.dir}</td><td>${r.price}</td><td>${(+r.stop).toPrecision(6)}</td><td>${(+r.tp).toPrecision(6)}</td><td>${r.lights ? [r.lights.macd, r.lights.ema, r.lights.rsi].map((x) => `<i class="dot ${x}"></i>`).join('') : ''}</td><td>${r.status}</td><td>${r.pnlR != null ? r.pnlR.toFixed(2) : ''}</td><td>${r.status === 'open' ? `<button class="mini" data-close="${r.id}">Закрыть</button>` : ''}</td></tr>`).join('');
}
