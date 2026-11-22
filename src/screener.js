import { evaluate, PRESETS } from './engine/signal.js';
import { riskPlan } from './engine/risk.js';
import { ema } from './engine/indicators.js';
import { corrByTime } from './engine/stats.js';
import * as okx from './data/okx.js';
import * as moex from './data/moex.js';
import * as journal from './journal.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const num = (id) => parseFloat($(id).value) || 0;
const fx = (x) => (Number.isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(3) : x.toPrecision(4)) : '—');

const S = { market: 'crypto', mode: 'trend', view: 'long', list: [], favs: new Set(store('ig_favs', [])), sound: false, fees: null, cur: null };
const P = {
  crypto: { tfs: ['4h', '1d'], detail: ['1h', '4h', '1d'], list: () => okx.topUsdt(100), candles: okx.candles, cur: '$', pool: 4, gap: 450 },
  stocks: { tfs: ['1d'], detail: ['1h', '1d', '1w'], list: moex.stocks, candles: (id, tf) => moex.candles(id, tf), cur: '₽', pool: 5, gap: 120 },
};
const preset = () => ({ ...PRESETS[S.market], rsiMode: S.mode });
const key = (a) => S.market + ':' + a.id;

const HINTS = {
  crypto: { BTC: 'Потоки в биржевые ETF, ставка ФРС и индекс доллара, динамика Nasdaq, funding и открытый интерес.', ETH: 'Динамика BTC и пары ETH/BTC, потоки в ETH-ETF, комиссии сети, обновления протокола.', default: 'Корреляция с BTC (бета обычно выше 1), разблокировки токенов, листинги и делистинги, ликвидность и объём за 24 часа.' },
  stocks: { banks: 'Ключевая ставка ЦБ (заседание 18.12), качество кредитов, отчётность МСФО, дивиденды.', oil: 'Нефть Brent и Urals, курс USD/RUB, налоги на добычу, санкции, дивидендная политика.', metals: 'Цены на металлы, курс рубля, экспорт и пошлины, налоговая нагрузка.', default: 'Отчётность, дивидендная отсечка, ключевая ставка, индекс IMOEX, курс USD/RUB.' },
};
const SECTOR = { SBER: 'banks', VTBR: 'banks', T: 'banks', CBOM: 'banks', LKOH: 'oil', ROSN: 'oil', TATN: 'oil', SNGS: 'oil', GAZP: 'oil', NVTK: 'oil', GMKN: 'metals', CHMF: 'metals', NLMK: 'metals', MAGN: 'metals', PLZL: 'metals', ALRS: 'metals' };
const hint = (a) => (S.market === 'crypto' ? HINTS.crypto[a.name] || HINTS.crypto.default : HINTS.stocks[SECTOR[a.id]] || HINTS.stocks.default);

function beep(f = 880) {
  if (!S.sound) return;
  const c = (beep.ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.value = f; g.gain.value = 0.15; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.25);
}

function analyze(a) {
  const d1 = a.byTf['1d'] || Object.values(a.byTf)[0];
  if (!d1 || d1.length < 40) { a.res = null; return; }
  const p = preset();
  const long = evaluate(a.byTf, 'long', 'mid', p), short = evaluate(a.byTf, 'short', 'mid', p);
  const det = long.detail['1d'] || Object.values(long.detail)[0];
  a.res = { long, short, rsi: det?.rsiValue, atrPct: (long.atr / long.price) * 100 };
}

const dots = (ev) => ['macd', 'ema', 'rsi'].map((k) => `<i class="dot ${ev.indicators[k]}" title="${k.toUpperCase()}"></i>`).join('') + `<b class="badge ${ev.overall}">${{ green: 'вход', yellow: 'ждать', red: 'нет' }[ev.overall]}</b>`;
const rank = (ev) => ({ green: 2, yellow: 1, red: 0 }[ev.overall] * 10 + (ev.consensus ?? -1));

function render() {
  const rows = S.list.filter((a) => a.res);
  let v = rows;
  if (S.view === 'long') v = [...rows].sort((a, b) => rank(b.res.long) - rank(a.res.long)).slice(0, 30);
  else if (S.view === 'short') v = [...rows].sort((a, b) => rank(b.res.short) - rank(a.res.short)).slice(0, 30);
  else if (S.view === 'fav') v = S.list.filter((a) => S.favs.has(key(a)));
  $('scanTbl').innerHTML = '<tr><th></th><th>Актив</th><th>Цена</th><th>24ч %</th><th>RSI</th><th>ATR %</th><th>Long</th><th>Short</th></tr>' +
    v.map((a) => `<tr data-id="${a.id}"><td><button class="star ${S.favs.has(key(a)) ? 'on' : ''}" data-fav="${a.id}">★</button></td><td>${a.name}</td><td>${fx(a.price)}</td><td class="${a.chg24 >= 0 ? 'good' : 'bad'}">${(a.chg24 || 0).toFixed(2)}</td><td>${a.res ? fx(a.res.rsi) : '—'}</td><td>${a.res ? a.res.atrPct.toFixed(2) : '—'}</td><td>${a.res ? dots(a.res.long) : ''}</td><td>${a.res ? dots(a.res.short) : ''}</td></tr>`).join('');
}

async function scan() {
  const C = P[S.market];
  $('scanBtn').disabled = true; $('prog').textContent = 'Загружаю список…';
  try { S.list = await C.list(); } catch (e) { $('prog').textContent = 'Не удалось загрузить список: ' + e.message; $('scanBtn').disabled = false; return; }
  const total = S.list.length * C.tfs.length; let done = 0, fail = 0;
  const queue = [...S.list];
  const worker = async () => {
    while (queue.length) {
      const a = queue.shift(); a.byTf = {};
      for (const tf of C.tfs) {
        try { a.byTf[tf] = await C.candles(a.id, tf); } catch { fail++; }
        $('prog').textContent = `Анализ ${++done} из ${total}` + (fail ? `, ошибок: ${fail}` : '');
        await sleep(C.gap);
      }
      analyze(a);
      if (done % 10 === 0) render();
    }
  };
  await Promise.all(Array.from({ length: C.pool }, worker));
  render(); $('scanBtn').disabled = false;
  $('prog').textContent = `Готово: ${S.list.filter((a) => a.res).length} активов, ошибок: ${fail}. ${S.market === 'stocks' ? 'Котировки MOEX бесплатно идут с задержкой около 15 минут.' : ''}`;
  const g = S.list.filter((a) => a.res && a.res.long.overall === 'green').length;
  if (g) beep(660);
}

async function ensureLib() {
  if (window.LightweightCharts) return;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

function stopLive() { (S.stops || []).forEach((f) => f()); S.stops = []; clearInterval(S.timer); }

function evalCur() {
  const { a, dir } = S.cur;
  return evaluate(a.full, dir, 'mid', preset());
}

function feeRate() {
  const f = S.fees;
  if (S.market === 'crypto') return f.crypto.okx[$('pInst').value][$('pOrd').value];
  const b = f.brokers.find((x) => x.id === $('pBrk').value);
  return b.brokerRate + b.exchangeStock;
}

function refresh() {
  const { a, dir } = S.cur, C = P[S.market];
  const ev = evalCur(), last = a.full[S.cur.tf].at(-1);
  const rows = Object.entries(ev.detail).map(([tf, L]) => `<tr><td>${tf}</td><td><i class="dot ${L.macd}"></i></td><td><i class="dot ${L.ema}"></i></td><td><i class="dot ${L.rsi}"></i> ${fx(L.rsiValue)}</td><td>${fx(L.atr)}</td></tr>`).join('');
  const crypto = S.market === 'crypto';
  const plan = riskPlan({ direction: dir, entry: last.c, atr: ev.atr, equity: num('pEq'), riskPct: num('pRisk'), stopK: num('pStop'), tpK: num('pTp'), leverage: crypto ? num('pLev') || 1 : 1, feeRate: feeRate(), instrument: crypto ? $('pInst').value : 'spot', fundingRate8h: crypto ? S.fees.crypto.okx.fundingRate8h : 0, borrowDaily: crypto ? S.fees.crypto.okx.borrowDailyUSDT : 0, holdHours: num('pHold') });
  const atrPct = (ev.atr / last.c) * 100;
  const reasons = [];
  for (const k of ['macd', 'ema', 'rsi']) if (ev.indicators[k] !== 'green') reasons.push(`${k.toUpperCase()}: ${ev.indicators[k] === 'red' ? 'против сделки' : 'нет подтверждения'}`);
  if (plan.rrNet < 1.5) reasons.push(`R:R после затрат ${plan.rrNet.toFixed(2)} < 1.5`);
  if (atrPct < 0.2 || atrPct > 15) reasons.push(`ATR ${atrPct.toFixed(2)}% вне рабочего диапазона`);
  let verdict = ev.overall;
  if (verdict === 'green' && reasons.length) verdict = 'yellow';
  const txt = { green: 'Зелёный: условия для входа выполнены', yellow: 'Жёлтый: не торопиться', red: 'Красный: не лезть' }[verdict];
  $('shLights').innerHTML = `<div class="verdict ${verdict}">${txt}</div><table class="mini-t"><tr><th>ТФ</th><th>MACD</th><th>EMA</th><th>RSI</th><th>ATR</th></tr>${rows}</table>${reasons.length ? '<ul class="why">' + reasons.map((r) => `<li>${r}</li>`).join('') + '</ul>' : ''}`;
  const items = [['Вход', fx(last.c)], ['Стоп', fx(plan.stop)], ['Тейк', fx(plan.tp)], ['Объём', fx(plan.qty)], ['Позиция, ' + C.cur, fx(plan.notional)], ['Убыток по стопу', fx(plan.lossNet)], ['Прибыль по тейку', fx(plan.rewardNet)], ['R:R после затрат', plan.rrNet.toFixed(2)], ['Безубыток', fx(plan.breakeven)]];
  $('shPlan').innerHTML = items.map(([t, v]) => `<div class="k"><small>${t}</small><b>${v}</b></div>`).join('') + (plan.capped ? '<p class="warn">Размер ограничен капиталом и плечом.</p>' : '');
  S.cur.last = { ev, plan, verdict, price: last.c };
  if (S.cur.prev && S.cur.prev !== 'green' && verdict === 'green') beep(990);
  S.cur.prev = verdict;
}

function drawChart() {
  const { a, tf } = S.cur, el = $('shChart');
  el.innerHTML = '';
  const LW = window.LightweightCharts;
  const chart = LW.createChart(el, { height: 340, layout: { background: { color: 'transparent' }, textColor: css('--txt') }, grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } }, timeScale: { timeVisible: true }, rightPriceScale: { borderColor: css('--grid') } });
  const cs = chart.addCandlestickSeries({ upColor: '#16a34a', downColor: '#dc2626', borderVisible: false, wickUpColor: '#16a34a', wickDownColor: '#dc2626' });
  const data = a.full[tf]; cs.setData(data.map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c })));
  const lines = [[20, '#2563eb'], [50, '#f59e0b']].map(([n, col]) => { const s = chart.addLineSeries({ color: col, lineWidth: 1, priceLineVisible: false }); const e = ema(data.map((c) => c.c), n); s.setData(data.map((c, i) => ({ time: c.t, value: e[i] })).filter((x) => Number.isFinite(x.value))); return s; });
  S.cur.chart = chart; S.cur.cs = cs; S.cur.lines = lines;
  chart.timeScale().fitContent();
}

function startLive() {
  stopLive();
  const { a } = S.cur, C = P[S.market];
  if (S.market === 'crypto') {
    S.stops = C.detail.map((tf) => okx.live(a.id, tf, (c) => {
      const arr = a.full[tf], l = arr.at(-1);
      if (l.t === c.t) arr[arr.length - 1] = c; else arr.push(c);
      if (tf === S.cur.tf) S.cur.cs.update({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c });
      if (!S.cur.busy) { S.cur.busy = true; setTimeout(() => { S.cur.busy = false; refresh(); }, 1000); }
    }));
    $('shLive').textContent = 'Онлайн: OKX WebSocket';
  } else {
    S.timer = setInterval(async () => {
      try { a.full['1h'] = await C.candles(a.id, '1h'); a.full['1d'] = await C.candles(a.id, '1d'); refresh(); drawChart(); } catch { /* skip */ }
    }, 30000);
    $('shLive').textContent = 'Обновление каждые 30 с, задержка котировок MOEX около 15 мин';
  }
}

async function related(a) {
  const el = $('shRel');
  try {
    const mine = a.byTf?.['1d'] || a.full['1d'];
    const bench = S.market === 'crypto' ? (S.list.find((x) => x.id === 'BTC-USDT')?.byTf?.['1d'] || await okx.candles('BTC-USDT', '1d')) : await moex.benchmark();
    const rows = S.list.filter((x) => x.id !== a.id && x.byTf?.['1d']).map((x) => ({ n: x.name, c: corrByTime(mine, x.byTf['1d']) })).filter((x) => Number.isFinite(x.c)).sort((p, q) => q.c - p.c);
    const cb = corrByTime(mine, bench);
    el.innerHTML = `<p>С ${S.market === 'crypto' ? 'BTC' : 'индексом IMOEX'}: <b>${fx(cb)}</b> (дневные доходности)</p>` + (rows.length ? `<p>Движутся вместе: ${rows.slice(0, 3).map((x) => `${x.n} ${x.c.toFixed(2)}`).join(', ')}</p><p>Противоположно: ${rows.slice(-2).map((x) => `${x.n} ${x.c.toFixed(2)}`).join(', ')}</p>` : '<p class="hint">Запустите «Проанализировать всё», чтобы увидеть связи с другими активами.</p>');
  } catch { el.innerHTML = '<p class="hint">Не удалось посчитать связи.</p>'; }
}

async function openSheet(a) {
  const C = P[S.market], sh = $('sheet');
  sh.hidden = false; sh.innerHTML = '<div class="panel"><p>Загрузка…</p></div>';
  a.full = {};
  try { for (const tf of C.detail) a.full[tf] = await C.candles(a.id, tf); await ensureLib(); } catch (e) { sh.innerHTML = `<div class="panel"><p>Ошибка загрузки: ${e.message}</p><button class="btn" id="shClose">Закрыть</button></div>`; $('shClose').onclick = closeSheet; return; }
  S.cur = { a, dir: 'long', tf: S.market === 'crypto' ? '1h' : '1d', prev: null };
  const crypto = S.market === 'crypto';
  const brk = !crypto ? `<label>Брокер<select id="pBrk">${S.fees.brokers.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}</select></label>` : `<div class="two"><label>Рынок<select id="pInst"><option value="spot">Спот / маржа</option><option value="swap">Своп</option></select></label><label>Заявка<select id="pOrd"><option value="taker">Taker</option><option value="maker">Maker</option></select></label></div><label>Плечо<input id="pLev" type="number" value="1" step="0.5"></label>`;
  sh.innerHTML = `<div class="panel"><div class="sh-head"><div><h2>${a.name} <small>${fx(a.price)} ${C.cur}</small></h2><span id="shLive" class="hint"></span></div><div><button class="star ${S.favs.has(key(a)) ? 'on' : ''}" id="shFav">★</button><button class="mini" id="shClose">Закрыть</button></div></div>
  <div class="sh-grid"><div>
   <div class="seg" id="shDir"><button data-d="long" class="on">Long</button><button data-d="short">Short</button></div>
   <div class="seg" id="shTf">${C.detail.map((t) => `<button data-t="${t}" class="${t === S.cur.tf ? 'on' : ''}">${t}</button>`).join('')}</div>
   <div id="shChart"></div><p class="hint">Графики: <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener">TradingView Lightweight Charts™</a>. EMA 20 синяя, EMA 50 жёлтая.</p>
   <div id="shLights"></div>
   <h3>Риск-менеджмент</h3>
   <div class="two"><label>Капитал, ${C.cur}<input id="pEq" type="number" value="${crypto ? 1600 : 200000}"></label><label>Риск, %<input id="pRisk" type="number" step="0.1" value="1"></label></div>
   <div class="two"><label>Стоп, ×ATR<input id="pStop" type="number" step="0.1" value="2"></label><label>Тейк, ×ATR<input id="pTp" type="number" step="0.1" value="3"></label></div>
   <div class="two">${brk}<label>Держать, ч<input id="pHold" type="number" value="48"></label></div>
   <div id="shPlan" class="kpis"></div>
   <div class="row"><button class="btn" id="shEnter">Записать вход в журнал</button><button class="btn ghost" id="shSnd">${S.sound ? 'Звук: вкл' : 'Звук: выкл'}</button></div>
  </div><aside><h3>На что смотреть</h3><p>${hint(a)}</p><h3>Связи</h3><div id="shRel"><p class="hint">Считаю…</p></div>
   <h3>Новости</h3><ul class="links">${(crypto ? [[`Google News`, `https://news.google.com/search?q=${a.name}%20crypto`], [`Торговля на OKX`, `https://www.okx.com/trade-spot/${a.id.toLowerCase()}`]] : [[`Форум smart-lab`, `https://smart-lab.ru/forum/${a.id}/`], [`Карточка MOEX`, `https://www.moex.com/ru/issue.aspx?code=${a.id}`], [`Google News`, `https://news.google.com/search?q=${a.name}%20акции&hl=ru`]]).map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${t}</a></li>`).join('')}</ul><p class="hint">Автоматическая лента новостей появится на следующем этапе.</p></aside></div></div>`;
  $('shClose').onclick = closeSheet;
  $('shFav').onclick = () => { toggleFav(a); $('shFav').classList.toggle('on'); };
  $('shDir').onclick = (e) => { const d = e.target.dataset.d; if (!d) return; S.cur.dir = d; S.cur.prev = null; [...$('shDir').children].forEach((b) => b.classList.toggle('on', b.dataset.d === d)); refresh(); };
  $('shTf').onclick = (e) => { const t = e.target.dataset.t; if (!t) return; S.cur.tf = t; [...$('shTf').children].forEach((b) => b.classList.toggle('on', b.dataset.t === t)); drawChart(); refresh(); };
  sh.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', refresh));
  $('shSnd').onclick = () => { S.sound = !S.sound; $('shSnd').textContent = S.sound ? 'Звук: вкл' : 'Звук: выкл'; $('sndBtn').textContent = $('shSnd').textContent; beep(); };
  $('shEnter').onclick = () => {
    const { ev, plan, verdict, price } = S.cur.last;
    journal.add({ market: S.market, symbol: a.id, dir: S.cur.dir, price, stop: plan.stop, tp: plan.tp, qty: plan.qty, mode: S.mode, consensus: ev.consensus, verdict, lights: { ...ev.indicators, overall: ev.overall }, perTf: ev.detail, plan, equity: num('pEq'), riskPct: num('pRisk') });
    journal.render($('jTbl')); $('shEnter').textContent = 'Записано в журнал';
  };
  drawChart(); refresh(); startLive(); related(a);
}

function closeSheet() { stopLive(); $('sheet').hidden = true; $('sheet').innerHTML = ''; S.cur = null; }
function toggleFav(a) { const k = key(a); S.favs.has(k) ? S.favs.delete(k) : S.favs.add(k); localStorage.setItem('ig_favs', JSON.stringify([...S.favs])); render(); }

function init() {
  const seg = (id, fn) => $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; [...$(id).children].forEach((x) => x.classList.toggle('on', x === b)); fn(b); });
  seg('mkt', (b) => { S.market = b.dataset.m; S.list = []; render(); $('prog').textContent = 'Нажмите «Проанализировать всё».'; });
  seg('view', (b) => { S.view = b.dataset.v; render(); });
  $('mode').onchange = () => { S.mode = $('mode').value; S.list.forEach((a) => a.byTf && analyze(a)); render(); };
  $('scanBtn').onclick = scan;
  $('sndBtn').onclick = () => { S.sound = !S.sound; $('sndBtn').textContent = S.sound ? 'Звук: вкл' : 'Звук: выкл'; beep(); };
  $('scanTbl').addEventListener('click', (e) => {
    const f = e.target.closest('[data-fav]');
    const a = S.list.find((x) => x.id === (f ? f.dataset.fav : e.target.closest('tr')?.dataset.id));
    if (!a) return;
    f ? toggleFav(a) : openSheet(a);
  });
  $('jTbl').addEventListener('click', (e) => {
    const id = +e.target.dataset.close; if (!id) return;
    const exit = parseFloat(prompt('Цена выхода?')); if (!exit) return;
    journal.close(id, exit, prompt('Заметка к сделке (что сработало, что нет):') || '', null);
    journal.render($('jTbl'));
  });
  $('jCsv').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + journal.toCSV()], { type: 'text/csv' })); a.download = 'journal.csv'; a.click(); };
  window.addEventListener('themechange', () => S.cur && S.cur.chart && drawChart());
  journal.render($('jTbl'));
  fetch('config/fees.json').then((r) => r.json()).then((f) => { S.fees = f; });
}
init();
