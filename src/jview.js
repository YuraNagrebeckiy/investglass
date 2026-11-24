import * as journal from './journal.js';
import * as okx from './data/okx.js';
import * as moex from './data/moex.js';
import { evaluate, PRESETS } from './engine/signal.js';
import { riskPlan } from './engine/risk.js';
import { scanOutcome, tradePnl } from './engine/trade.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cssv = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const nf = (x, d = 2) => (Number.isFinite(x) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d }).format(x) : '—');
const px = (x) => (Number.isFinite(+x) ? (Math.abs(x) >= 100 ? nf(x, 2) : Math.abs(x) >= 1 ? nf(x, 4) : (+x).toPrecision(4).replace('.', ',')) : '—');
const sg = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + nf(Math.abs(x), d);
const TFS = { crypto: ['1h', '4h', '1d'], stocks: ['1h', '1d', '1w'] };
const CHART_TFS = { crypto: ['1h', '4h', '1d'], stocks: ['1h', '1d'] };
const TAX = 0.13;
let S = null, timer = null, fees = null;

const css = document.createElement('style');
css.textContent = '#jTbl tr:not(:first-child),#alCard .chip{cursor:pointer}#jTbl tr:not(:first-child):hover,#alCard .chip:hover{background:var(--field)}.jw-c{height:340px;margin:10px 0;border-radius:16px;overflow:hidden;background:var(--kpi)}.jw-v{padding:12px 14px;border-radius:16px;margin:10px 0;color:#fff;font:600 15px var(--head)}.jw-v.ok{background:var(--ok)}.jw-v.bad{background:var(--bad)}.jw-v.open{background:var(--warn)}.jw-l{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--mut);margin:4px 0}.jw-l i{display:inline-block;width:14px;height:3px;margin-right:5px;vertical-align:middle}#jvBody li{margin:6px 0}';
document.head.appendChild(css);

async function ensureLib() {
  if (window.LightweightCharts) return;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

const src = () => (S.market === 'crypto' ? okx : moex);
const cur = () => (S.market === 'crypto' ? 'USDT' : '₽');
const val = (id, d = 0) => { const el = $(id); const v = el ? parseFloat(el.value) : NaN; return Number.isFinite(v) ? v : d; };

function feeRate() {
  if (!fees) return 0.001;
  if (S.market === 'crypto') {
    const ex = fees.crypto[$('jvEx') ? $('jvEx').value : 'okx'] || fees.crypto.okx;
    return (ex[$('jvInst') ? $('jvInst').value : 'spot'] || ex.spot)[$('jvOrd') ? $('jvOrd').value : 'taker'];
  }
  const b = fees.brokers.find((x) => x.id === ($('jvBrk') ? $('jvBrk').value : '')) || fees.brokers[0];
  return b.brokerRate + b.exchangeStock;
}

function levels(cs, entry) {
  const k = 3, n = cs.length, lows = [], highs = [];
  for (let i = k; i < n - k; i++) {
    let lo = true, hi = true;
    for (let j = 1; j <= k; j++) { if (cs[i].l > cs[i - j].l || cs[i].l > cs[i + j].l) lo = false; if (cs[i].h < cs[i - j].h || cs[i].h < cs[i + j].h) hi = false; }
    if (lo) lows.push(cs[i].l);
    if (hi) highs.push(cs[i].h);
  }
  const last = cs.slice(-40);
  const sup = lows.filter((x) => x < entry).sort((a, b) => b - a)[0] ?? Math.min(...last.map((c) => c.l));
  const res = highs.filter((x) => x > entry).sort((a, b) => a - b)[0] ?? Math.max(...last.map((c) => c.h));
  return { sup, res };
}

function position() {
  const r = S.rec, dir = S.dir, last = S.last;
  const eq = val('jvEq', S.market === 'crypto' ? 1600 : 200000), rk = val('jvRisk', 1), sk = val('jvSK', 2), tk = val('jvTK', 3), lev = S.market === 'crypto' ? val('jvLev', 1) || 1 : 1;
  const entry = r ? r.price : (S.al && S.al.kind === 'price' && S.al.level ? S.al.level : last);
  const sameDir = r && r.dir === dir;
  if (r && sameDir) return { entry, stop: +r.stop, tp: +r.tp, qty: +r.qty, dir, ts: r.ts, lev: r.lev || lev, custom: false };
  const inst = $('jvInst') ? $('jvInst').value : 'spot';
  const plan = riskPlan({ direction: dir, entry, atr: S.atr, equity: eq, riskPct: rk, stopK: sk, tpK: tk, leverage: S.market === 'crypto' ? lev : 1, feeRate: feeRate(), instrument: S.market === 'crypto' ? inst : 'spot', fundingRate8h: fees && fees.crypto ? fees.crypto.okx.fundingRate8h : 0, borrowDaily: fees && fees.crypto ? fees.crypto.okx.borrowDailyUSDT : 0, holdHours: val('jvHold', 48) });
  return { entry, stop: plan.stop, tp: plan.tp, qty: plan.qty, dir, ts: r ? r.ts : new Date().toISOString(), lev, custom: true };
}

function money(pos, exitPrice, endTs) {
  const inst = $('jvInst') ? $('jvInst').value : 'spot';
  const rec = { ts: pos.ts, dir: pos.dir, price: pos.entry, qty: pos.qty, market: S.market, lev: pos.lev, inst: S.market === 'crypto' ? inst : 'spot' };
  const o = { feeRate: feeRate(), borrowDaily: fees && fees.crypto ? fees.crypto.okx.borrowDailyUSDT : 0, fundingRate8h: fees && fees.crypto ? fees.crypto.okx.fundingRate8h : 0, marginYear: 0.2 };
  const p = tradePnl(rec, exitPrice, endTs, o);
  const tax = Math.max(0, p.net) * TAX;
  return { ...p, tax, after: p.net - tax };
}

function whySection(pos, out, ev) {
  const r = S.rec, d = pos.dir === 'short' ? -1 : 1, items = [];
  let cls = 'open', head;
  const dt = (t) => new Date(t * 1000).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  if (!r || pos.custom) {
    head = 'Это идея, а не открытая сделка. Расчёт показывает, что было бы при входе по цене ' + px(pos.entry) + ' и выбранном направлении.';
  } else if (out.status === 'tp') {
    cls = 'ok'; head = `Сделка сработала: цена дошла до цели ${px(pos.tp)} (${dt(out.hitT)}) раньше, чем до стопа.`;
  } else if (out.status === 'stop') {
    cls = 'bad'; head = `Сделка не сработала: цена сначала дошла до стопа ${px(pos.stop)} (${dt(out.hitT)}).`;
  } else {
    const fav = d * (S.last - pos.entry) >= 0;
    cls = fav ? 'ok' : 'open'; head = fav ? 'Сделка пока идёт по плану: цена в вашу сторону, ни стоп, ни цель не достигнуты.' : 'Сделка пока идёт против плана: цена хуже входа, но стоп не достигнут.';
  }
  items.push(`Максимальный ход в вашу пользу ${sg(out.mfe * 100)}%, максимальный ход против вас ${sg(out.mae * 100)}% от цены входа.`);
  if (r && r.lights && !pos.custom) {
    const g = ['macd', 'ema', 'rsi'].filter((k) => r.lights[k] === 'green').length;
    items.push(`На входе светофор показывал ${g} зелёных из 3 (MACD ${r.lights.macd}, EMA ${r.lights.ema}, RSI ${r.lights.rsi}). ${g === 3 ? 'Индикаторы согласились с входом, это повышало шансы.' : 'Вход был без полного подтверждения индикаторов, это повышало риск.'}`);
  }
  if (r && r.plan && r.plan.rrNet != null && !pos.custom) items.push(`Прибыль к риску после комиссий при входе: ${nf(r.plan.rrNet)}. ${r.plan.rrNet >= 1.5 ? 'Это выше порога 1,5.' : 'Это ниже порога 1,5: цель была слишком близко для такого риска.'}`);
  if (ev) items.push(`Сейчас индикаторы для ${pos.dir === 'short' ? 'Short' : 'Long'}: MACD ${ev.indicators.macd}, EMA ${ev.indicators.ema}, RSI ${ev.indicators.rsi}, общий сигнал «${{ green: 'вход', yellow: 'ждать', red: 'нет' }[ev.overall]}».`);
  if (out.status === 'stop' && !pos.custom) items.push('Стоп стоит на расстоянии обычного размаха цены (ATR). Такой выход означает, что рынок пошёл против идеи; потеря ограничена планом. Причину разворота по графику установить нельзя, проверьте новости за этот день.');
  if (out.status === 'tp' && !pos.custom) items.push('Цель достигнута: по плану прибыль стоило зафиксировать. Если позиция ещё открыта, закройте её и укажите цену выхода.');
  return { cls, head, items };
}

function adviceSection(pos, price, ev, lv, comm) {
  const d = pos.dir === 'short' ? -1 : 1, R = Math.abs(pos.entry - pos.stop) || 1, prog = (d * (price - pos.entry)) / R;
  const stopHit = d * (price - pos.stop) <= 0, tpHit = d * (price - pos.tp) >= 0;
  const be = pos.entry * (1 + d * 2 * comm);
  const at = (k) => pos.entry + d * R * k;
  let now, tone = 'open';
  if (tpHit) { now = 'Цель достигнута: зафиксируйте прибыль, закройте позицию или хотя бы часть.'; tone = 'ok'; }
  else if (stopHit) { now = 'Цена на уровне стопа или за ним: по плану позицию закрывают, чтобы убыток не вырос.'; tone = 'bad'; }
  else if (prog >= 1) { now = `Цена прошла ${nf(prog, 1)}R в вашу пользу: передвиньте стоп на уровень безубытка ${px(be)} и дальше подтягивайте его за ценой.`; tone = 'ok'; }
  else if (ev && ev.overall === 'red') { now = 'Сигнал по вашему направлению стал красным: если позиция в плюсе, рассмотрите частичную фиксацию, если в минусе, придерживайтесь стопа.'; tone = 'bad'; }
  else now = `Держать по плану: до цели осталось ${nf(Math.abs(pos.tp - price) / price * 100, 2)}%, до стопа ${nf(Math.abs(price - pos.stop) / price * 100, 2)}%.`;
  const rows = [
    ['Стоп (выход с убытком)', pos.stop], ['Безубыток с учётом комиссий', be], [`Передвинуть стоп в безубыток (+1R)`, at(1)], ['Зафиксировать треть позиции (+1,5R)', at(1.5)], ['Цель (выход с прибылью)', pos.tp],
  ];
  const tips = [
    `Пока цена не прошла +1R (${px(at(1))}), стоп не двигайте: обычный шум не должен выбивать вас из сделки.`,
    `После +1R подтягивайте стоп на расстояние ${nf(2 * S.atr, 4)} (2 ATR) от максимума для Long или от минимума для Short.`,
    `${pos.dir === 'long' ? 'Закрытие свечи ниже поддержки ' + px(lv.sup) + ' — повод выйти раньше цели.' : 'Закрытие свечи выше сопротивления ' + px(lv.res) + ' — повод выйти раньше цели.'}`,
    `${pos.dir === 'long' ? 'Рядом с сопротивлением ' + px(lv.res) + ' рост часто тормозит: там разумно зафиксировать часть.' : 'Рядом с поддержкой ' + px(lv.sup) + ' падение часто тормозит: там разумно зафиксировать часть.'}`,
    'Выходите, если сигнал по вашему направлению стал красным или если за разумное время (для акций 5–10 торговых дней, для крипты 2–5 дней) цена не пошла к цели.',
    S.market === 'crypto' ? 'У бессрочных контрактов ежедневные расходы на удержание (funding) съедают прибыль: не держите позицию без движения.' : 'Перед отчётностью и дивидендной отсечкой цена может скакнуть: проверьте даты событий.',
  ];
  return { now, tone, rows, tips };
}

function bodyHtml(pos, out, ev, lv) {
  const price = S.last, d = pos.dir === 'short' ? -1 : 1, c = cur();
  const closed = S.rec && S.rec.status === 'closed';
  const endTs = closed ? Date.parse(S.rec.exitTs) : Date.now();
  const exitNow = closed ? +S.rec.exit : price;
  const now = money(pos, exitNow, endTs), tp = money(pos, pos.tp, endTs), st = money(pos, pos.stop, endTs);
  const diff = exitNow - pos.entry, diffPct = (diff / pos.entry) * 100 * d;
  const comm = feeRate();
  const w = whySection(pos, out, ev), a = adviceSection(pos, price, ev, lv, comm);
  const row = (n, p) => `<tr><td>${n}</td><td class="${p.gross >= 0 ? 'good' : 'bad'}">${sg(p.gross)}</td><td>${nf(p.fees)}${p.financing ? ' + ' + nf(p.financing) : ''}</td><td>${nf(p.tax)}</td><td class="${p.after >= 0 ? 'good' : 'bad'}"><b>${sg(p.after)} ${c}</b></td></tr>`;
  const kp = (t, v, k) => `<div class="k"><small>${t}</small><b${k ? ` class="${k}"` : ''}>${v}</b></div>`;
  return `<div class="jw-v ${w.cls}">${esc(w.head)}</div>
  <div class="kpis">${kp('Цена входа', px(pos.entry))}${kp(closed ? 'Цена выхода' : 'Сейчас', px(exitNow))}${kp('Разница с входом', `${sg(diff, 4)} (${sg(diffPct)}%)`, diffPct >= 0 ? 'good' : 'bad')}${kp('Объём', px(pos.qty))}${kp('Поддержка', px(lv.sup))}${kp('Сопротивление', px(lv.res))}</div>
  <h3>Сколько можно заработать и потерять</h3>
  <div class="scroll"><table><tr><th>Выход</th><th>До комиссий, ${c}</th><th>Комиссии${S.market === 'crypto' && pos.lev > 1 ? ' + плечо' : ''}</th><th>Налог 13%</th><th>Итог, ${c}</th></tr>${row(closed ? 'По факту выхода' : 'Сейчас по ' + px(exitNow), now)}${row('По цели ' + px(pos.tp), tp)}${row('По стопу ' + px(pos.stop), st)}</table></div>
  <p class="hint">Комиссия ${nf(comm * 100, 3)}% с каждой стороны сделки${S.market === 'crypto' ? ' (биржа и тип заявки выбраны выше)' : ' (брокер и биржа)'}. Налог 13% взят с прибыли после комиссий, убыток налог не уменьшает в этом расчёте. Для крипты порядок налогообложения уточните у налогового консультанта.</p>
  <h3>Когда выходить</h3>
  <div class="jw-v ${a.tone}">${esc(a.now)}</div>
  <div class="scroll"><table><tr><th>Уровень</th><th>Цена</th></tr>${a.rows.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${px(v)}</td></tr>`).join('')}</table></div>
  <ul>${a.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  <h3>Сработала ли сделка и почему</h3><ul>${w.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  <p class="hint">Объяснение строится по данным цены и индикаторам, оно не доказывает причину движения. Это не инвестиционная рекомендация, решение и риски остаются на вас.</p>`;
}

function paint(pos, lv) {
  const { series } = S;
  (S.lines || []).forEach((l) => { try { series.removePriceLine(l); } catch { /* gone */ } });
  S.lines = [];
  const long = pos.dir === 'long';
  const add = (price, color, title, style = 0, w = 2) => S.lines.push(series.createPriceLine({ price, color, lineWidth: w, lineStyle: style, axisLabelVisible: true, title }));
  add(pos.entry, cssv('--info') || '#4A6B88', 'Вход');
  add(lv.sup, '#3F7052', long ? 'Поддержка' : 'Поддержка (цель)', 1, 1);
  add(lv.res, '#A94841', long ? 'Сопротивление' : 'Сопротивление (стоп-зона)', 1, 1);
  add(pos.stop, cssv('--bad') || '#A94841', 'Стоп', 2);
  add(pos.tp, cssv('--ok') || '#3F7052', 'Выход: цель', 2);
  if (S.rec && S.rec.status === 'closed' && S.rec.exit) add(+S.rec.exit, cssv('--warn') || '#8E6420', 'Мой выход', 1);
  const cs = S.cs, dur = cs.length > 1 ? cs[1].t - cs[0].t : 3600, t0 = Date.parse(pos.ts) / 1000;
  const bar = !pos.custom || S.rec ? cs.find((c) => c.t + dur > t0) : null;
  try { series.setMarkers(bar ? [{ time: bar.t, position: long ? 'belowBar' : 'aboveBar', color: cssv('--info') || '#4A6B88', shape: long ? 'arrowUp' : 'arrowDown', text: 'Вход' }] : []); } catch { /* ignore */ }
}

async function loadAll(first) {
  const byTf = {};
  for (const tf of TFS[S.market]) byTf[tf] = await src().candles(S.id, tf);
  const ev = evaluate(byTf, S.dir, 'mid', { ...PRESETS[S.market], rsiMode: 'trend' });
  S.byTf = byTf; S.ev = ev; S.atr = ev.atr; S.last = byTf[TFS[S.market][0]].at(-1).c;
  const ctf = S.tf, cs = byTf[ctf] || (await src().candles(S.id, ctf));
  S.cs = cs; S.last = cs.at(-1).c;
  if (first) {
    await ensureLib();
    const el = $('jvChart'); el.innerHTML = '';
    S.chart = window.LightweightCharts.createChart(el, { height: 340, layout: { background: { color: 'transparent' }, textColor: cssv('--txt') }, grid: { vertLines: { color: cssv('--grid') }, horzLines: { color: cssv('--grid') } }, timeScale: { timeVisible: true }, rightPriceScale: { borderColor: cssv('--grid') } });
    S.series = S.chart.addCandlestickSeries({ upColor: '#3F7052', downColor: '#A94841', borderVisible: false, wickUpColor: '#3F7052', wickDownColor: '#A94841' });
  }
  render(first);
}

function render(fit) {
  const pos = position(), lv = levels(S.cs, pos.entry);
  const out = S.rec && !pos.custom ? scanOutcome({ ts: pos.ts, dir: pos.dir, price: pos.entry, stop: pos.stop, tp: pos.tp }, S.cs) : scanOutcome({ ts: new Date(Date.now() - 1000).toISOString(), dir: pos.dir, price: pos.entry, stop: pos.stop, tp: pos.tp }, S.cs);
  S.series.setData(S.cs.map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c })));
  paint(pos, lv);
  if (fit) S.chart.timeScale().fitContent();
  $('jvBody').innerHTML = bodyHtml(pos, out, S.ev, lv);
  $('jvNow').textContent = px(S.last);
  $('jvTf').textContent = `Свечи ${S.tf}. Обновление каждые 30 секунд, пока окно открыто.${S.market === 'stocks' ? ' Котировки MOEX идут с задержкой около 15 минут.' : ''}`;
}

function stop() { clearInterval(timer); timer = null; S = null; }

async function open(init) {
  let sh = $('jvSheet');
  if (!sh) {
    sh = document.createElement('div'); sh.id = 'jvSheet'; sh.className = 'sheet'; document.body.appendChild(sh);
    new MutationObserver(() => { if (sh.hidden) stop(); }).observe(sh, { attributes: true, attributeFilter: ['hidden'] });
  }
  stop();
  if (!fees) fees = await fetch('config/fees.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  const crypto = init.market === 'crypto', r = init.rec || null;
  S = { ...init, rec: r, dir: (r && r.dir) || (init.al && init.al.dir && /long|short/.test(init.al.dir) ? init.al.dir : 'long'), tf: r && (Date.now() - Date.parse(r.ts)) / 864e5 > 10 ? '1d' : '1h', market: init.market };
  const closed = r && r.status === 'closed';
  const exOpts = fees ? Object.entries(fees.crypto).map(([k, v]) => `<option value="${k}"${(r && r.exchange === k) ? ' selected' : ''}>${esc(v.name || k)}</option>`).join('') : '<option value="okx">OKX</option>';
  const brOpts = fees ? fees.brokers.map((b) => `<option value="${b.id}"${(r && r.broker === b.id) ? ' selected' : ''}>${esc(b.name)}</option>`).join('') : '';
  const alInfo = init.al ? `<div class="note">Уведомление: ${esc(init.al.kind === 'price' ? 'по цене ' + (init.al.dir === 'above' ? 'выше ' : 'ниже ') + init.al.level : init.al.kind === 'signal' ? 'сигнал на вход ' + init.al.dir : 'разворот ' + init.al.dir)}${init.al.fired ? ' · сработало' : ''}. Окно показывает, что получилось бы при входе.</div>` : '';
  sh.hidden = false;
  sh.innerHTML = `<div class="panel"><div class="sh-head"><div><h2>${esc(init.name || init.id)} <small>сейчас <span id="jvNow">…</span> ${cur()}</small></h2><span class="hint">${r ? (closed ? 'Закрытая запись' : 'Открытая запись') + ' от ' + esc(r.ts.slice(0, 16).replace('T', ' ')) : 'Идея из уведомления'}</span></div><button class="mini" id="jvX">Закрыть</button></div>
  ${alInfo}
  <div class="seg" id="jvDir"><button data-d="long" class="${S.dir === 'long' ? 'on' : ''}">Long</button><button data-d="short" class="${S.dir === 'short' ? 'on' : ''}">Short</button></div>
  <div class="seg" id="jvTfs">${CHART_TFS[init.market].map((t) => `<button data-t="${t}" class="${t === S.tf ? 'on' : ''}">${t}</button>`).join('')}</div>
  <div id="jvChart" class="jw-c"></div>
  <div class="jw-l"><span><i style="background:#4A6B88"></i>Вход</span><span><i style="background:#3F7052"></i>Поддержка</span><span><i style="background:#A94841"></i>Сопротивление</span><span><i style="background:#A94841;opacity:.7"></i>Стоп</span><span><i style="background:#3F7052;opacity:.7"></i>Выход: цель</span></div>
  <p id="jvTf" class="hint">Загружаю…</p>
  <h3>Параметры расчёта</h3>
  <div class="two"><label>${crypto ? 'Капитал, USDT' : 'Капитал, ₽'}<input id="jvEq" type="number" value="${r && r.equity ? r.equity : crypto ? 1600 : 200000}"></label><label>Риск, %<input id="jvRisk" type="number" step="0.1" value="${r && r.riskPct ? r.riskPct : 1}"></label></div>
  <div class="two"><label>Стоп, ×ATR<input id="jvSK" type="number" step="0.1" value="2"></label><label>Тейк, ×ATR<input id="jvTK" type="number" step="0.1" value="3"></label></div>
  ${crypto ? `<div class="two"><label>Биржа (комиссии)<select id="jvEx">${exOpts}</select></label><label>Рынок<select id="jvInst"><option value="spot"${r && r.inst === 'spot' ? ' selected' : ''}>Спот / маржа</option><option value="swap"${r && r.inst === 'swap' ? ' selected' : ''}>Своп</option></select></label></div><div class="two"><label>Заявка<select id="jvOrd"><option value="taker"${r && r.ord === 'taker' ? ' selected' : ''}>Taker</option><option value="maker"${r && r.ord === 'maker' ? ' selected' : ''}>Maker</option></select></label><label>Плечо<input id="jvLev" type="number" step="0.5" value="${r && r.lev ? r.lev : 1}"></label></div>` : `<label>Брокер<select id="jvBrk">${brOpts}</select></label>`}
  <label>Держать, часов<input id="jvHold" type="number" value="48"></label>
  <div id="jvBody"><p class="hint">Считаю…</p></div>
  <h3>Мои заметки</h3><textarea id="jvNote" rows="3" placeholder="Почему вхожу, что жду, при каких условиях выйду">${esc((r && r.planNote) || '')}</textarea>
  <div class="row"><button class="btn sm ghost" id="jvSave"${r ? '' : ' hidden'}>Сохранить заметку</button>${r && !closed ? '<button class="btn sm" id="jvClose">Закрыть позицию</button>' : ''}</div></div>`;
  $('jvX').onclick = () => { sh.hidden = true; };
  $('jvDir').onclick = (e) => { const d = e.target.dataset.d; if (!d || !S) return; S.dir = d; [...$('jvDir').children].forEach((b) => b.classList.toggle('on', b.dataset.d === d)); loadAll(false).catch(() => {}); };
  $('jvTfs').onclick = async (e) => { const t = e.target.dataset.t; if (!t || !S) return; S.tf = t; [...$('jvTfs').children].forEach((b) => b.classList.toggle('on', b.dataset.t === t)); S.cs = await src().candles(S.id, t); S.last = S.cs.at(-1).c; render(true); };
  sh.querySelectorAll('#jvEq,#jvRisk,#jvSK,#jvTK,#jvEx,#jvInst,#jvOrd,#jvLev,#jvBrk,#jvHold').forEach((i) => i.addEventListener('input', () => S && S.series && render(false)));
  if ($('jvSave')) $('jvSave').onclick = () => { const a = journal.all(), x = a.find((q) => q.id === r.id); if (x) { x.planNote = $('jvNote').value; localStorage.setItem('ig_journal', JSON.stringify(a)); $('jvSave').textContent = 'Сохранено'; } };
  if ($('jvClose')) $('jvClose').onclick = () => {
    const exit = parseFloat(prompt('Цена выхода?', S ? S.last : '')); if (!exit) return;
    journal.close(r.id, exit, prompt('Заметка к сделке (что сработало, что нет):') || '', null);
    journal.render($('jTbl'));
    open({ ...init, rec: journal.all().find((q) => q.id === r.id) });
  };
  try {
    await loadAll(true);
    timer = setInterval(() => { if (S && !sh.hidden && !closed) loadAll(false).catch(() => {}); }, 30000);
  } catch (e) { if ($('jvTf')) $('jvTf').textContent = 'Не удалось загрузить данные: ' + e.message; }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  const tbl = $('jTbl');
  if (tbl && tbl.contains(e.target)) {
    const tr = e.target.closest('tr'), i = [...tbl.rows].indexOf(tr) - 1, rec = i >= 0 ? journal.all()[i] : null;
    if (rec) open({ market: rec.market, id: rec.symbol, name: rec.symbol, rec });
    return;
  }
  const card = $('alCard');
  if (card && card.contains(e.target)) {
    const chip = e.target.closest('.chip'), i = chip ? [...card.querySelectorAll('.chip')].indexOf(chip) : -1;
    let list = []; try { list = JSON.parse(localStorage.getItem('ig_alerts')) || []; } catch { /* none */ }
    const al = list[i];
    if (al) open({ market: al.market, id: al.sym, name: al.name, al });
  }
});
