import { riskPlan } from './engine/risk.js';
import { getAnalysis, HZ } from './analysis.js';
import { PRE, run, levelName } from './engine/advice.js';
import { chartData, assetKey } from './draw.js';
import * as journal from './journal.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (x, d = 2) => (Number.isFinite(x) ? Number(x).toFixed(d).replace('.', ',') : '—');
const fx = (x) => (Number.isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(3) : x.toPrecision(4)) : '—');
let fees = null, feesErr = '', pass = false;

async function loadFees() {
  if (fees) return fees;
  try { const r = await fetch('config/fees.json', { cache: 'no-store' }); if (!r.ok) throw new Error('ответ ' + r.status); fees = await r.json(); feesErr = ''; } catch (e) { feesErr = (e && e.message) || 'нет связи'; }
  return fees;
}
loadFees();

const css = document.createElement('style');
css.textContent = '#enMod,#enWait{z-index:120}#enMod .panel,#enWait .panel{max-width:620px}#enCalc{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:8px 0}#enAdv,#enwL,#enwN{list-style:none;margin:6px 0;padding:0}#enAdv li,#enwL li{padding:7px 10px;margin:4px 0;border-radius:12px;background:var(--kpi);border-left:4px solid var(--l4);font-size:13px}#enAdv li.bad,#enwL li.bad{border-left-color:var(--bad)}#enAdv li.warn,#enwL li.warn{border-left-color:var(--warn)}#enAdv li.good,#enwL li.good{border-left-color:var(--ok)}#enAdv b,#enwL b{display:block}#enMod textarea{min-height:64px}#enwNet{font-size:12px;color:var(--mut);margin:6px 0}';
document.head.appendChild(css);

function latest() { try { return JSON.parse(localStorage.getItem('ig_journal')) || []; } catch { return []; } }

function snap() {
  const k = assetKey(), an = getAnalysis(), data = chartData();
  const px = data.length ? data[data.length - 1].c : (an && an.px) || 0;
  return { k, an, data, px };
}

function netLines() {
  const n = window.__igNet; if (!n) return [];
  const now = Date.now(), out = [];
  for (const v of n.pend.values()) out.push(`⏳ ${v.l}: ждём ${Math.round((now - v.t0) / 1000)} с`);
  for (const [l, v] of Object.entries(n.last)) if (!v.ok) out.push(`⚠ ${l}: ${v.err || 'ответ ' + v.status}`);
  return out.slice(0, 8);
}

function waitDialog() {
  if ($('enWait')) return;
  const m = document.createElement('div');
  m.className = 'sheet'; m.id = 'enWait';
  m.innerHTML = '<div class="panel"><div class="sh-head"><h2>Готовлю данные для записи</h2><button class="mini" id="enwX">Закрыть</button></div><p class="hint">Для записи нужны актив, цена и тарифы. Комплексный анализ подтянется сам. Ниже видно, чего ещё не хватает и какой запрос сейчас идёт.</p><ul id="enwL"></ul><div id="enwNet"></div><div id="enwM" hidden><p class="hint">Источник долго не отвечает. Можно записать сделку по цене, которую вы введёте сами (например, цена в вашем брокерском приложении).</p><label>Цена входа<input id="enwP" type="number" step="any" inputmode="decimal"></label><button class="btn" id="enwGo">Продолжить с этой ценой</button></div></div>';
  document.body.appendChild(m);
  const t0 = Date.now();
  const close = () => { clearInterval(tm); m.remove(); };
  const tick = () => {
    const s = snap(), ready = s.k && fees && s.px > 0;
    if (ready) { close(); openForm(s.px, false); return; }
    const li = (c, t, x) => `<li class="${c}"><b>${t}</b>${esc(x)}</li>`;
    const pend = window.__igNet ? window.__igNet.pend.size : 0;
    $('enwL').innerHTML = [
      s.k ? li('good', 'Актив определён', s.k.name + ' (' + s.k.id + ')') : li('bad', 'Актив не определён', 'Закройте окно актива и откройте его заново.'),
      s.data.length ? li('good', 'График загружен', `${s.data.length} свечей, последняя цена ${fx(s.px)}`) : s.px > 0 ? li('warn', 'График ещё без свечей', 'Цена взята из анализа: ' + fx(s.px)) : li('warn', 'Свечи графика ещё не пришли', pend ? 'Идёт загрузка с биржи, ждём ответ.' : 'Запросов нет: обновите окно актива.'),
      fees ? li('good', 'Тарифы загружены', 'config/fees.json') : feesErr ? li('bad', 'Тарифы не загрузились', 'config/fees.json: ' + feesErr + '. Нажмите «Полное обновление» в настройках.') : li('warn', 'Загружаю тарифы', 'config/fees.json'),
      s.an ? li('good', 'Комплексный анализ готов', 'счёт ' + f1(s.an.total, 0)) : li(pend ? 'warn' : 'info', 'Комплексный анализ', pend ? 'считается: загружаются свечи и фундаментальные данные.' : 'пока недоступен, запись возможна без него.'),
    ].join('');
    const nl = netLines();
    $('enwNet').innerHTML = nl.length ? '<b>Сеть сейчас</b><br>' + nl.map(esc).join('<br>') : '';
    if (Date.now() - t0 > (window.__igWaitMs || 12000) && s.k && fees) $('enwM').hidden = false;
  };
  const tm = setInterval(tick, 400);
  $('enwX').onclick = close;
  m.addEventListener('click', (e) => { if (e.target === m) close(); });
  $('enwGo').onclick = () => { const p = parseFloat($('enwP').value); if (!(p > 0)) { $('enwP').focus(); return; } close(); openForm(p, true); };
  tick();
}

async function openEntry() {
  await loadFees();
  const s = snap();
  if (s.k && fees && s.px > 0) openForm(s.px, false); else waitDialog();
}

function openForm(px, manual) {
  const k = assetKey(), an = getAnalysis();
  if (!k || !fees || !(px > 0)) { waitDialog(); return; }
  const crypto = k.market === 'crypto';
  const sheetDir = (document.querySelector('#shDir .on') || {}).dataset?.d || 'long';
  const hk = an ? an.h : (localStorage.getItem('ig_horizon') || 'mid'), H = HZ[hk];
  const atr = an ? an.plan.atr : px * 0.02;
  let dir = an && an.dir !== 'wait' ? an.dir : sheetDir;
  const m = document.createElement('div');
  m.className = 'sheet'; m.id = 'enMod';
  const opt = (arr) => arr.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('');
  const exOpts = opt(Object.entries(fees.crypto).map(([v, o]) => [v, o.name || v]));
  m.innerHTML = `<div class="panel"><div class="sh-head"><h2>Параметры сделки</h2><button class="mini" id="enX">Закрыть</button></div>
  <p class="hint">${esc(k.name)} · ${esc(H.name.toLowerCase())} торговля${an ? ` · анализ: ${an.dir === 'long' ? 'Long' : an.dir === 'short' ? 'Short' : 'ждать'}, счёт ${f1(an.total, 0)}, уверенность ${f1(an.conf, 0)}%` : ' · комплексный анализ не загружен, подсказки ограничены'}. ${manual ? 'Цена входа введена вручную' : 'Вход по текущей цене'} ${fx(px)}.</p>
  <div class="seg" id="enDir"><button data-d="long">Long</button><button data-d="short">Short</button></div>
  ${crypto ? `<label>Биржа<select id="enEx">${exOpts}</select></label><div class="two"><label>Рынок<select id="enInst"><option value="spot">Спот / маржа</option><option value="swap">Своп</option></select></label><label>Заявка<select id="enOrd"><option value="taker">Taker</option><option value="maker">Maker</option></select></label></div><label>Плечо<input id="enLev" type="number" min="1" step="0.5"></label>` : `<label>Брокер и тариф<select id="enBrk">${opt(fees.brokers.map((b) => [b.id, b.name]))}</select></label>`}
  <div class="two"><label>Капитал, ${crypto ? 'USDT' : '₽'}<input id="enEq" type="number"></label><label>Риск на сделку, %<input id="enRisk" type="number" step="0.1"></label></div>
  <div class="two"><label>Стоп, цена<input id="enStop" type="number" step="any"></label><label>Тейк, цена<input id="enTp" type="number" step="any"></label></div>
  <label>Удержание, ч<input id="enHold" type="number"></label>
  <label>Причина входа и комментарий<textarea id="enNote" placeholder="Что вы видите на графике и почему входите"></textarea></label>
  <div id="enCalc"></div><ul id="enAdv"></ul>
  <label class="chk"><input type="checkbox" id="enOk"> Я проверил параметры и понимаю риск убытка</label>
  <button class="btn" id="enGo" disabled>Записать в журнал</button>
  <p class="hint">Запись попадёт в журнал со снимком анализа. Когда закроете сделку, журнал разберёт результат и даст рекомендации.</p></div>`;
  document.body.appendChild(m);
  const g = (id) => $(id);
  const defaults = () => { const d = dir === 'long' ? 1 : -1, sk = an ? an.plan.stopK : H.stopK, tk = an ? an.plan.tpK : H.tpK; g('enStop').value = +(px - d * sk * atr).toPrecision(7); g('enTp').value = +(px + d * tk * atr).toPrecision(7); };
  g('enEq').value = $('pEq') ? $('pEq').value : crypto ? 1600 : 200000;
  g('enRisk').value = an ? an.plan.risk : H.risk; g('enHold').value = an ? an.plan.hold : H.hold;
  if (crypto) { g('enLev').value = an ? an.plan.lev : 1; if ($('pEx')) g('enEx').value = $('pEx').value || 'okx'; if ($('pInst')) g('enInst').value = $('pInst').value; if ($('pOrd')) g('enOrd').value = $('pOrd').value; } else if ($('pBrk')) g('enBrk').value = $('pBrk').value;
  const setDir = (d) => { dir = d; m.querySelectorAll('#enDir button').forEach((b) => b.classList.toggle('on', b.dataset.d === d)); defaults(); calc(); };
  const calc = () => {
    const d = dir === 'long' ? 1 : -1, stop = +g('enStop').value, tp = +g('enTp').value, eq = +g('enEq').value, risk = +g('enRisk').value, hold = +g('enHold').value, lev = crypto ? +g('enLev').value || 1 : 1;
    const errs = [];
    if (!(d * (px - stop) > 0)) errs.push(dir === 'long' ? 'Для Long стоп должен быть ниже цены входа.' : 'Для Short стоп должен быть выше цены входа.');
    if (!(d * (tp - px) > 0)) errs.push(dir === 'long' ? 'Для Long тейк должен быть выше цены входа.' : 'Для Short тейк должен быть ниже цены входа.');
    if (!(eq > 0) || !(risk > 0)) errs.push('Укажите капитал и риск.');
    let fee, plan = null, rrNet = NaN;
    try { if (crypto) { const ex = fees.crypto[g('enEx').value], inst = g('enInst').value; fee = ex[inst][g('enOrd').value]; } else { const b = fees.brokers.find((x) => x.id === g('enBrk').value); fee = b.brokerRate + b.exchangeStock; } } catch { fee = 0.001; }
    if (!errs.length) {
      const dist = Math.abs(px - stop);
      plan = riskPlan({ direction: dir, entry: px, atr: dist, equity: eq, riskPct: risk, stopK: 1, tpK: Math.abs(tp - px) / dist, leverage: lev, feeRate: fee, instrument: crypto ? g('enInst').value : 'spot', fundingRate8h: crypto ? fees.crypto.okx.fundingRate8h : 0, borrowDaily: crypto ? fees.crypto.okx.borrowDailyUSDT : 0, holdHours: hold });
      rrNet = plan.rrNet;
    }
    m._plan = plan; m._fee = fee;
    const cu = crypto ? 'USDT' : '₽';
    g('enCalc').innerHTML = errs.length ? `<div class="note" style="grid-column:1/-1">${errs.join(' ')}</div>` : [['Объём', fx(plan.qty)], ['Позиция, ' + cu, fx(plan.notional)], ['Маржа, ' + cu, fx(plan.margin)], ['Убыток по стопу', fx(plan.lossNet)], ['Прибыль по тейку', fx(plan.rewardNet)], ['R:R после затрат', f1(plan.rrNet)], ['Безубыток', fx(plan.breakeven)]].map(([t, v]) => `<div class="k"><small>${t}</small><b>${v}</b></div>`).join('') + (plan.capped ? '<p class="warn" style="grid-column:1/-1">Размер ограничен капиталом и плечом.</p>' : '');
    g('enGo').disabled = !(g('enOk').checked && !errs.length);
    const base = an || { h: hk, mk: k.market, T: { tfs: [], main: { tf: '', rsi: 50, atrPct: 1, lo20: '', hi20: '' } }, C: { list: [] }, F: { ok: false, good: [], flags: [] }, rng: null, conf: 50, levMax: H.levMax, plan: {} };
    const ctx = { ...base, dir, lev, riskPct: risk, fee, rr: rrNet, stopPct: (Math.abs(px - stop) / px) * 100, open: base.open || { long: 0, short: 0 }, stopNearLiq: !!(plan && plan.stopTooCloseToLiq), levMax: H.levMax };
    const advs = run(PRE, ctx).filter((r) => (r.l === 'bad' || r.l === 'warn') || (r.k === 'rec' && r.l === 'good')).slice(0, 7);
    g('enAdv').innerHTML = advs.map((r) => `<li class="${r.l}"><b>${esc(r.t)} · ${levelName[r.l]}</b>${esc(r.x)}</li>`).join('');
  };
  m.addEventListener('input', calc); m.addEventListener('change', calc);
  m.querySelector('#enDir').onclick = (e) => { if (e.target.dataset.d) setDir(e.target.dataset.d); };
  g('enX').onclick = () => m.remove();
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  setDir(dir);
  g('enGo').onclick = () => {
    const plan = m._plan, fee = m._fee; if (!plan) return;
    const rec = { dir, stop: +g('enStop').value, tp: +g('enTp').value, eq: +g('enEq').value, risk: +g('enRisk').value, hold: +g('enHold').value, lev: crypto ? +g('enLev').value || 1 : 1, note: g('enNote').value.trim(), ex: crypto ? g('enEx').value : null, inst: crypto ? g('enInst').value : null, ord: crypto ? g('enOrd').value : null, brk: crypto ? null : g('enBrk').value };
    const set = (id, v) => { const el = $(id); if (el && v != null) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); } };
    const dirBtn = document.querySelector(`#shDir [data-d="${rec.dir}"]`); if (dirBtn && !dirBtn.classList.contains('on')) dirBtn.click();
    set('pEq', rec.eq); set('pRisk', rec.risk); set('pHold', rec.hold); if (crypto) { set('pEx', rec.ex); set('pInst', rec.inst); set('pOrd', rec.ord); set('pLev', rec.lev); } else set('pBrk', rec.brk);
    m.remove();
    const recent = () => latest().reduce((a, b) => (!a || b.id > a.id ? b : a), null);
    const fresh = (r) => r && r.symbol === k.id && Date.now() - r.id < 8000;
    pass = true; const btn = $('shEnter'); try { if (btn) btn.click(); } catch { /* handled below */ } pass = false;
    setTimeout(() => {
      if (!fresh(recent())) {
        try { journal.add({ market: k.market, symbol: k.id, dir: rec.dir, price: px, stop: rec.stop, tp: rec.tp, qty: plan.qty, mode: 'trend', consensus: null, verdict: 'yellow', lights: { macd: 'yellow', ema: 'yellow', rsi: 'yellow', overall: 'yellow' }, perTf: {}, plan, equity: rec.eq, riskPct: rec.risk, exchange: rec.ex, inst: rec.inst, ord: rec.ord, broker: rec.brk, lev: rec.lev }); journal.render($('jTbl')); } catch { /* journal unavailable */ }
      }
      const j = latest(), r0 = j.reduce((a, b) => (!a || b.id > a.id ? b : a), null);
      if (!fresh(r0)) return;
      Object.assign(r0, { dir: rec.dir, price: px, stop: rec.stop, tp: rec.tp, qty: plan.qty, plan, equity: rec.eq, riskPct: rec.risk, lev: rec.lev, holdHours: rec.hold, exchange: rec.ex || r0.exchange, inst: rec.inst || r0.inst, ord: rec.ord || r0.ord, broker: rec.brk || r0.broker, brokerName: crypto ? (fees.crypto[rec.ex] || {}).name : (fees.brokers.find((x) => x.id === rec.brk) || {}).name, horizon: hk, fee, note: rec.note, trainer: true, manualPrice: manual || undefined, an: an ? { h: an.h, dir: an.dir, total: an.total, conf: an.conf, T: an.T.score, C: an.C.score, F: an.F.ok ? an.F.score : null, candles: an.C.list.map((p) => p.name), recs: an.recs.slice(0, 8).map((x) => x.t) } : null });
      localStorage.setItem('ig_journal', JSON.stringify(j));
      try { journal.render($('jTbl')); } catch { /* ignore */ }
      if (btn) btn.textContent = 'Записано в журнал';
    }, 60);
  };
}

document.addEventListener('click', (e) => {
  if (!e.target || e.target.id !== 'shEnter' || pass) return;
  e.stopImmediatePropagation(); e.preventDefault();
  openEntry();
}, true);
