import { POST, PORT, levelName, run } from './engine/advice.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (x, d = 1) => (Number.isFinite(x) ? Number(x).toFixed(d).replace('.', ',') : '—');
const HN = { short: 'Краткосрочная', mid: 'Среднесрочная', long: 'Долгосрочная' };
const jr = () => { try { return JSON.parse(localStorage.getItem('ig_journal')) || []; } catch { return []; } };

export function review(r) {
  const d = r.dir === 'short' ? -1 : 1, risk = Math.abs(r.price - r.stop) || 1;
  const pnlR = Number.isFinite(r.pnlR) ? r.pnlR : (d * (r.exit - r.price)) / risk;
  const nearStop = d * (r.exit - r.stop) <= risk * 0.08, nearTp = d * (r.exit - r.tp) >= -risk * 0.08;
  const hit = nearTp ? 'tp' : nearStop ? 'stop' : 'manual';
  const hours = r.exitTs ? (Date.parse(r.exitTs) - Date.parse(r.ts)) / 36e5 : null;
  const an = r.an || null, aligned = an ? (an.dir === 'wait' ? null : an.dir === r.dir) : null;
  const t = { r: pnlR, hit, plannedR: Math.abs(r.tp - r.price) / risk, hours, plannedHours: r.holdHours || null, aligned, anDir: an ? { long: 'Long', short: 'Short', wait: 'ждать' }[an.dir] : null, rrPlan: r.plan && r.plan.rrNet, lev: r.lev || 1, verdict: r.verdict, fund: an ? an.F : null, cdBias: an ? Math.sign(an.C) : 0, horizon: r.horizon, dir: r.dir };
  return { t, recs: run(POST.map((p) => ({ ...p, k: 'rec' })), { t }) };
}

export function stats(j) {
  const closed = j.filter((r) => r.status === 'closed' && Number.isFinite(+r.exit)), open = j.filter((r) => r.status === 'open').length;
  const rows = closed.map((r) => ({ r, rev: review(r) })).sort((a, b) => Date.parse(a.r.exitTs || a.r.ts) - Date.parse(b.r.exitTs || b.r.ts));
  const R = rows.map((x) => x.rev.t.r), n = R.length, wins = R.filter((x) => x > 0), loss = R.filter((x) => x <= 0);
  let cum = 0, peak = 0, dd = 0, sl = 0, ms = 0; const curve = [0];
  for (const x of R) { cum += x; curve.push(cum); peak = Math.max(peak, cum); dd = Math.min(dd, cum - peak); if (x <= 0) { sl++; ms = Math.max(ms, sl); } else sl = 0; }
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const grp = (fn) => { const m = new Map(); rows.forEach((x) => { const k = fn(x.r) || '—'; m.set(k, [...(m.get(k) || []), x.rev.t.r]); }); return [...m.entries()].map(([k, v]) => ({ k, n: v.length, win: (100 * v.filter((x) => x > 0).length) / v.length, avg: sum(v) / v.length, sum: sum(v) })).sort((a, b) => b.n - a.n); };
  const al = rows.filter((x) => x.rev.t.aligned === true), ag = rows.filter((x) => x.rev.t.aligned === false);
  const wr = (a) => (a.length >= 3 ? (100 * a.filter((x) => x.rev.t.r > 0).length) / a.length : null);
  return {
    open, closed: n, win: n ? (100 * wins.length) / n : 0, exp: n ? sum(R) / n : 0, sumR: sum(R), avgWin: wins.length ? sum(wins) / wins.length : 0, avgLoss: loss.length ? Math.abs(sum(loss) / loss.length) : 0,
    pf: Math.abs(sum(loss)) > 0 ? sum(wins) / Math.abs(sum(loss)) : wins.length ? 99 : 0, maxDD: dd, streakLoss: ms, curve, rows,
    lowRR: rows.filter((x) => x.rev.t.rrPlan && x.rev.t.rrPlan < 1.5).length, against: ag.length, alignedWin: wr(al), againstWin: wr(ag),
    avgLev: n ? sum(rows.map((x) => x.rev.t.lev)) / n : 1,
    byH: grp((r) => HN[r.horizon]), byDir: grp((r) => (r.dir === 'short' ? 'Short' : 'Long')), byBrk: grp((r) => r.brokerName || r.exchange || r.broker), byLev: grp((r) => ((r.lev || 1) <= 1 ? 'без плеча' : r.lev <= 3 ? 'плечо 2–3' : 'плечо больше 3')), byAn: grp((r) => (r.an ? (r.an.dir === r.dir ? 'по анализу' : r.an.dir === 'wait' ? 'анализ: ждать' : 'против анализа') : 'без анализа')),
  };
}

const css = document.createElement('style');
css.textContent = '#trBox .tr-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}#trBox svg{width:100%;height:120px;background:var(--kpi);border-radius:14px;margin:8px 0}.tr-l{list-style:none;margin:6px 0;padding:0}.tr-l li{padding:7px 10px;margin:4px 0;border-radius:12px;background:var(--kpi);border-left:4px solid var(--l4);font-size:13px}.tr-l li.bad{border-left-color:var(--bad)}.tr-l li.warn{border-left-color:var(--warn)}.tr-l li.good{border-left-color:var(--ok)}.tr-l li b{display:block}#trBox details{background:var(--kpi);border-radius:14px;padding:8px 12px;margin:6px 0}#trBox summary{cursor:pointer;font-size:14px}#trBox table{font-size:12px}';
document.head.appendChild(css);

const tbl = (title, rows) => rows.length ? `<h3>${title}</h3><div class="scroll" style="max-height:none"><table><tr><th>Группа</th><th>Сделок</th><th>Прибыльных</th><th>Средн. R</th><th>Сумма R</th></tr>${rows.map((x) => `<tr><td style="text-align:left">${esc(x.k)}</td><td>${x.n}</td><td>${f1(x.win, 0)}%</td><td class="${x.avg >= 0 ? 'good' : 'bad'}">${f1(x.avg, 2)}</td><td class="${x.sum >= 0 ? 'good' : 'bad'}">${f1(x.sum, 2)}</td></tr>`).join('')}</table></div>` : '';

function curveSvg(c) {
  if (c.length < 2) return '';
  const lo = Math.min(...c), hi = Math.max(...c, 0.0001), W = 600, H = 120, X = (i) => (W * i) / (c.length - 1), Y = (v) => H - 10 - ((H - 20) * (v - lo)) / (hi - lo || 1);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--mut)" stroke-dasharray="4 4"/><path d="${c.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}" fill="none" stroke="var(--line)" stroke-width="2.5"/></svg>`;
}

function draw() {
  const box = $('trBox'); if (!box) return;
  const j = jr(), s = stats(j);
  const adv = run(PORT.map((p) => ({ ...p, k: 'rec' })), s);
  const li = (r) => `<li class="${r.l}"><b>${esc(r.t)} · ${levelName[r.l]}</b>${esc(r.x)}</li>`;
  box.innerHTML = `<h2>Тренажёр: разбор сделок</h2><p class="hint">Каждая закрытая сделка автоматически разбирается: достиг ли результат плана, согласовался ли вход с анализом, как соблюдены правила риска. Чем больше сделок, тем точнее выводы.</p>
  <div class="tr-k">${[['Закрыто сделок', s.closed], ['Открыто', s.open], ['Прибыльных', f1(s.win, 0) + '%'], ['Средний результат', f1(s.exp, 2) + ' R'], ['Сумма', f1(s.sumR, 2) + ' R'], ['Профит-фактор', s.closed ? f1(s.pf, 2) : '—'], ['Макс. просадка', f1(s.maxDD, 1) + ' R'], ['Серия убытков', s.streakLoss]].map(([t, v]) => `<div class="k"><small>${t}</small><b>${v}</b></div>`).join('')}</div>
  ${curveSvg(s.curve)}<p class="hint">Кривая показывает накопленный результат в R (1R равно вашему риску на сделку).</p>
  <h3>Рекомендации по вашей торговле</h3><ul class="tr-l">${adv.map(li).join('') || '<li class="info"><b>Пока нечего разбирать</b>Закройте несколько сделок, и здесь появятся выводы.</li>'}</ul>
  ${tbl('По горизонту', s.byH)}${tbl('По направлению', s.byDir)}${tbl('По брокеру или бирже', s.byBrk)}${tbl('По плечу', s.byLev)}${tbl('Дисциплина: сделки по анализу и против него', s.byAn)}
  <h3>Разбор последних закрытых сделок</h3>${s.rows.slice(-15).reverse().map(({ r, rev }) => `<details><summary>${esc(r.symbol)} · ${r.dir === 'short' ? 'Short' : 'Long'} · <b class="${rev.t.r >= 0 ? 'good' : 'bad'}">${f1(rev.t.r, 2)} R</b> · ${esc((r.exitTs || r.ts || '').slice(0, 10))}</summary>
  <p class="hint">Вход ${r.price}, стоп ${r.stop}, тейк ${r.tp}, выход ${r.exit}. ${r.brokerName ? esc(r.brokerName) + '. ' : ''}${r.horizon ? esc(HN[r.horizon]) + ' сделка. ' : ''}${r.an ? `Анализ на входе: ${{ long: 'Long', short: 'Short', wait: 'ждать' }[r.an.dir]}, счёт ${f1(r.an.total, 0)}.` : 'Снимка анализа нет.'}</p>${r.note ? `<p><b>Ваш комментарий:</b> ${esc(r.note)}</p>` : ''}${r.exitNote ? `<p><b>Заметка при выходе:</b> ${esc(r.exitNote)}</p>` : ''}
  <ul class="tr-l">${rev.recs.map(li).join('') || '<li class="info"><b>Без замечаний</b>Сделка прошла по плану.</li>'}</ul></details>`).join('') || '<p class="hint">Закрытых сделок пока нет. Нажмите «Закрыть» в таблице журнала и укажите цену выхода.</p>'}
  <div class="note">Разбор и рекомендации построены по правилам на ваших данных и не являются инвестиционной рекомендацией. Результаты прошлых сделок не гарантируют будущих.</div>`;
}

let sig = '';
function mount() {
  const t = $('jTbl');
  if (!t) return;
  let box = $('trBox');
  if (!box) {
    box = document.createElement('div'); box.id = 'trBox'; box.className = 'card glass';
    const card = t.closest('.card') || t.parentNode, tab = t.closest('.tab');
    if (tab) tab.appendChild(box); else card.after(box);
    draw();
  }
}
function tick() { const s = localStorage.getItem('ig_journal') || ''; if (s !== sig) { sig = s; if ($('trBox')) draw(); } }
new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
setInterval(tick, 2000);
mount();
