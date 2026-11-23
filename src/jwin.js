import * as journal from './journal.js';
import * as okx from './data/okx.js';
import * as moex from './data/moex.js';
import { scanOutcome, tradePnl, dailySeries } from './engine/trade.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cssv = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const nf = (x, d = 2) => (Number.isFinite(x) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d }).format(x) : '—');
const px = (x) => (Number.isFinite(+x) ? (Math.abs(x) >= 100 ? nf(x, 2) : Math.abs(x) >= 1 ? nf(x, 4) : (+x).toPrecision(4)) : '—');
const sgn = (x, d = 2) => (x > 0 ? '+' : '') + nf(x, d);
const css = document.createElement('style');
css.textContent = '#jTbl tr:not(:first-child){cursor:pointer}#jTbl tr:not(:first-child):hover{background:var(--kpi)}.jw-c{height:320px;margin:10px 0;border-radius:16px;overflow:hidden;background:var(--kpi)}.jw-v{padding:12px 14px;border-radius:16px;margin:10px 0;color:#fff;font:600 15px var(--head)}.jw-v.ok{background:var(--ok)}.jw-v.bad{background:var(--bad)}.jw-v.open{background:var(--warn)}';
document.head.appendChild(css);

let timer = null, S = null;

async function ensureLib() {
  if (window.LightweightCharts) return;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

function paint(S) {
  const { chart, series, rec, cs } = S;
  (S.lines || []).forEach((l) => { try { series.removePriceLine(l); } catch { /* gone */ } });
  (S.extra || []).forEach((x) => { try { chart.removeSeries(x); } catch { /* gone */ } });
  S.lines = []; S.extra = [];
  const line = (price, color, title, style = 0) => S.lines.push(series.createPriceLine({ price, color, lineWidth: 2, lineStyle: style, axisLabelVisible: true, title }));
  line(rec.price, cssv('--info') || '#4A6B88', 'Вход');
  if (rec.stop) line(+rec.stop, cssv('--bad') || '#A94841', 'Стоп', 2);
  if (rec.tp) line(+rec.tp, cssv('--ok') || '#3F7052', 'Тейк', 2);
  if (rec.status === 'closed' && rec.exit) line(+rec.exit, cssv('--warn') || '#8E6420', 'Выход', 1);
  const marks = [];
  const t0 = Date.parse(rec.ts) / 1000, dur = cs.length > 1 ? cs[1].t - cs[0].t : 3600;
  const bar = cs.find((c) => c.t + dur > t0);
  if (bar) marks.push({ time: bar.t, position: rec.dir === 'short' ? 'aboveBar' : 'belowBar', color: cssv('--info') || '#4A6B88', shape: rec.dir === 'short' ? 'arrowDown' : 'arrowUp', text: 'Вход' });
  for (const d of rec.drawings || []) {
    if (d.t === 'sup' || d.t === 'res') line(d.p, d.t === 'sup' ? '#3F7052' : '#A94841', d.t === 'sup' ? 'Поддержка' : 'Сопротивление', 1);
    else if (d.t === 'trend' && d.t1 !== d.t2) {
      const s = chart.addLineSeries({ color: '#4A6B88', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      s.setData(d.t1 < d.t2 ? [{ time: d.t1, value: d.p1 }, { time: d.t2, value: d.p2 }] : [{ time: d.t2, value: d.p2 }, { time: d.t1, value: d.p1 }]);
      S.extra.push(s);
    } else if (d.time) marks.push({ time: d.time, position: d.t === 'exit' ? 'aboveBar' : 'belowBar', color: d.t === 'exit' ? '#A94841' : d.t === 'entry' ? '#3F7052' : '#8E6420', shape: d.t === 'entry' ? 'arrowUp' : d.t === 'exit' ? 'arrowDown' : 'circle', text: d.note || (d.t === 'entry' ? 'Мой вход' : d.t === 'exit' ? 'Мой выход' : 'Отметка') });
  }
  marks.sort((a, b) => a.time - b.time);
  try { series.setMarkers(marks); } catch { /* ignore */ }
}

function analysis(S, fees) {
  const { rec, cs, daily } = S, cur = rec.market === 'crypto' ? '$' : '₽';
  const pl = rec.plan || {};
  const lev = pl.margin > 0 && pl.notional > 0 ? Math.max(1, pl.notional / pl.margin) : 1;
  const feeRate = pl.feesAtTp && rec.qty ? pl.feesAtTp / (rec.qty * (rec.price + rec.tp)) : rec.market === 'crypto' ? fees?.crypto?.okx?.spot?.taker || 0.001 : 0.001;
  const calc = { ...rec, lev, feeRate };
  const o = { feeRate, borrowDaily: fees?.crypto?.okx?.borrowDailyUSDT || 0, marginYear: 0.2 };
  const out = scanOutcome(rec, cs);
  const closed = rec.status === 'closed' && rec.exit;
  const endTs = closed ? Date.parse(rec.exitTs) : Date.now();
  const exitPx = closed ? +rec.exit : out.last;
  const now = tradePnl(calc, exitPx, endTs, o), atTp = tradePnl(calc, rec.tp, endTs, o), atStop = tradePnl(calc, rec.stop, endTs, o);
  const fav = (rec.dir === 'short' ? -1 : 1) * (out.last - rec.price) >= 0;
  let vt, vc;
  if (out.status === 'tp') { vt = 'Индикатор сработал: цена дошла до тейка раньше стопа.'; vc = 'ok'; }
  else if (out.status === 'stop') { vt = 'Индикатор не сработал: цена сначала дошла до стопа.'; vc = 'bad'; }
  else { vt = fav ? 'Пока в нужную сторону: ни стоп, ни тейк не достигнуты, цена идёт по плану.' : 'Пока против плана: ни стоп, ни тейк не достигнуты, цена ниже входа для Long или выше для Short.'; vc = fav ? 'ok' : 'open'; }
  const L = rec.lights || {};
  const dot = (c) => `<i class="dot ${esc(c)}"></i>`;
  const row = (n, p) => `<tr><td>${n}</td><td>${sgn(p.net)} ${cur}</td><td>${sgn(p.pctMargin)} %</td><td>${nf(p.fees)}</td><td>${nf(p.financing)}</td></tr>`;
  const ds = dailySeries(calc, daily, endTs, { ...o, exitPrice: closed ? exitPx : undefined });
  const html = `<div class="jw-v ${vc}">${vt}</div>
  <p class="hint">Светофор на входе: MACD ${dot(L.macd)} EMA ${dot(L.ema)} RSI ${dot(L.rsi)} · итог «${esc(L.overall || rec.verdict || '—')}». Максимальный ход в плюс ${sgn(out.mfe * 100)} %, в минус ${sgn(out.mae * 100)} %.</p>
  <h3>Прибыль и убыток</h3>
  <div class="kpis"><div class="k"><small>${closed ? 'Результат по выходу' : 'Сейчас по цене ' + px(exitPx)}</small><b class="${now.net >= 0 ? 'good' : 'bad'}">${sgn(now.net)} ${cur}</b></div><div class="k"><small>К собственным деньгам${lev > 1 ? ' (плечо ×' + nf(lev, 1) + ')' : ''}</small><b class="${now.pctMargin >= 0 ? 'good' : 'bad'}">${sgn(now.pctMargin)} %</b></div><div class="k"><small>Изменение цены</small><b>${sgn(now.pctPrice)} %</b></div><div class="k"><small>Дней в сделке</small><b>${nf(now.days, 1)}</b></div></div>
  <div class="scroll"><table><tr><th>Сценарий</th><th>Итог</th><th>% от своих</th><th>Комиссии</th><th>Проценты за плечо</th></tr>${row(closed ? 'Выход' : 'Сейчас', now)}${row('По тейку ' + px(rec.tp), atTp)}${row('По стопу ' + px(rec.stop), atStop)}</table></div>
  <p class="fine">Комиссия ${nf(feeRate * 100, 3)} % за сторону${lev > 1 ? (rec.market === 'crypto' ? ', проценты по займу OKX из последних данных' : ', ставка маржинального кредита принята 20 % годовых, уточните у брокера') : ''}. Расчёт ориентировочный.</p>
  <h3>По дням</h3>${ds.length ? `<div class="scroll"><table><tr><th>Дата</th><th>Цена</th><th>Итог, ${cur}</th><th>% от своих</th><th>Проценты за плечо</th></tr>${ds.map((r) => `<tr><td>${r.date}</td><td>${px(r.close)}</td><td class="${r.net >= 0 ? 'good' : 'bad'}">${sgn(r.net)}</td><td>${sgn(r.pct)} %</td><td>${nf(r.financing)}</td></tr>`).join('')}</table></div>` : '<p class="hint">Данных по дням пока нет.</p>'}`;
  return html;
}

async function load(first) {
  const { rec } = S, src = rec.market === 'crypto' ? okx : moex;
  const age = (Date.now() - Date.parse(rec.ts)) / 864e5, tf = age <= 10 ? '1h' : '1d';
  const cs = await src.candles(rec.symbol, tf);
  S.cs = cs; S.daily = tf === '1d' ? cs : await src.candles(rec.symbol, '1d').catch(() => cs);
  if (first) {
    await ensureLib();
    const el = $('jwChart'); el.innerHTML = '';
    const LW = window.LightweightCharts;
    S.chart = LW.createChart(el, { height: 320, layout: { background: { color: 'transparent' }, textColor: cssv('--txt') }, grid: { vertLines: { color: cssv('--grid') }, horzLines: { color: cssv('--grid') } }, timeScale: { timeVisible: true }, rightPriceScale: { borderColor: cssv('--grid') } });
    S.series = S.chart.addCandlestickSeries({ upColor: '#3F7052', downColor: '#A94841', borderVisible: false, wickUpColor: '#3F7052', wickDownColor: '#A94841' });
  }
  S.series.setData(cs.map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c })));
  paint(S);
  if (first) S.chart.timeScale().fitContent();
  const fees = S.fees || (S.fees = await fetch('config/fees.json').then((r) => r.json()).catch(() => null));
  $('jwBody').innerHTML = analysis(S, fees);
  $('jwTf').textContent = `Свечи ${tf}. Обновляется каждые 30 секунд, пока окно открыто.`;
}

function stop() { clearInterval(timer); timer = null; S = null; }

export function openEntry(id) {
  const rec = journal.all().find((r) => r.id === id);
  if (!rec) return;
  let sh = $('jSheet');
  if (!sh) { sh = document.createElement('div'); sh.id = 'jSheet'; sh.className = 'sheet'; document.body.appendChild(sh); new MutationObserver(() => { if (sh.hidden) stop(); }).observe(sh, { attributes: true, attributeFilter: ['hidden'] }); }
  const closed = rec.status === 'closed';
  sh.hidden = false;
  sh.innerHTML = `<div class="panel"><div class="sh-head"><div><h2>${esc(rec.symbol)} <small>${rec.dir === 'short' ? 'Short' : 'Long'} · вход ${px(rec.price)} · ${esc(rec.ts.slice(0, 16).replace('T', ' '))}</small></h2><span class="hint">${closed ? 'Закрыта, выход ' + px(rec.exit) : 'Открыта'}</span></div><button class="mini" id="jwX">Закрыть</button></div>
  <div id="jwChart" class="jw-c"></div><p id="jwTf" class="hint">Загружаю…</p>
  <div class="kpis"><div class="k"><small>Вход</small><b>${px(rec.price)}</b></div><div class="k"><small>Стоп</small><b>${px(rec.stop)}</b></div><div class="k"><small>Тейк</small><b>${px(rec.tp)}</b></div><div class="k"><small>Объём</small><b>${px(rec.qty)}</b></div></div>
  <div id="jwBody"><p class="hint">Считаю…</p></div>
  <h3>Мой план и заметки</h3><textarea id="jwNote" rows="3" placeholder="Почему вхожу, что жду, при каких условиях выйду">${esc(rec.planNote || '')}</textarea>
  <div class="row"><button class="btn sm ghost" id="jwSave">Сохранить заметку</button>${closed ? '' : '<button class="btn sm" id="jwClose">Закрыть позицию</button>'}</div>
  <div class="note">Прибыль и убыток рассчитаны по вашим данным и не гарантируют результат. Это не инвестиционная рекомендация.</div></div>`;
  $('jwX').onclick = () => { sh.hidden = true; };
  $('jwSave').onclick = () => { const a = journal.all(), r = a.find((x) => x.id === id); if (r) { r.planNote = $('jwNote').value; localStorage.setItem('ig_journal', JSON.stringify(a)); $('jwSave').textContent = 'Сохранено'; } };
  if ($('jwClose')) $('jwClose').onclick = () => {
    const last = S && S.cs && S.cs.length ? S.cs[S.cs.length - 1].c : '';
    const exit = parseFloat(prompt('Цена выхода?', last));
    if (!exit) return;
    journal.close(id, exit, prompt('Заметка к сделке (что сработало, что нет):') || '', null);
    journal.render($('jTbl'));
    openEntry(id);
  };
  stop();
  S = { rec, fees: null };
  load(true).catch((e) => { $('jwTf').textContent = 'Не удалось загрузить график: ' + e.message; });
  timer = setInterval(() => { if (S && !sh.hidden && !closed) load(false).catch(() => {}); }, 30000);
}

document.addEventListener('click', (e) => {
  const tbl = $('jTbl');
  if (!tbl || !tbl.contains(e.target) || e.target.closest('button')) return;
  const tr = e.target.closest('tr');
  const i = [...tbl.rows].indexOf(tr) - 1;
  const rec = i >= 0 ? journal.all()[i] : null;
  if (rec) openEntry(rec.id);
});
