import { ema, rsi, macd, atr, last } from './engine/indicators.js';
import * as okx from './data/okx.js';
import * as moex from './data/moex.js';
import { getJson } from './data/net.js';
import { scan } from './candles.js';
import { PRE, run, levelName } from './engine/advice.js';
import { assetKey } from './draw.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const f1 = (x, d = 1) => Number(x).toFixed(d).replace('.', ',');
const big = (x) => (x >= 1e12 ? f1(x / 1e12, 2) + ' трлн' : x >= 1e9 ? f1(x / 1e9, 1) + ' млрд' : x >= 1e6 ? f1(x / 1e6, 0) + ' млн' : f1(x, 0));

export const HZ = {
  short: { name: 'Краткосрочная', note: 'часы и несколько дней', tfs: { crypto: ['15m', '1h', '4h'], stocks: ['10m', '1h', '1d'] }, main: { crypto: '1h', stocks: '1h' }, ctf: '1h', w: { t: 0.6, c: 0.35, f: 0.05 }, stopK: 1.5, tpK: 2.5, hold: 12, risk: 0.5, levMax: 3 },
  mid: { name: 'Среднесрочная', note: 'от нескольких дней до месяцев', tfs: { crypto: ['1h', '4h', '1d'], stocks: ['1h', '1d', '1w'] }, main: { crypto: '4h', stocks: '1d' }, ctf: '1d', w: { t: 0.5, c: 0.2, f: 0.3 }, stopK: 2, tpK: 3.5, hold: 240, risk: 1, levMax: 2 },
  long: { name: 'Долгосрочная', note: 'месяцы и годы', tfs: { crypto: ['1d', '1w', '1M'], stocks: ['1d', '1w', '1M'] }, main: { crypto: '1w', stocks: '1w' }, ctf: '1w', w: { t: 0.35, c: 0.1, f: 0.55 }, stopK: 3, tpK: 6, hold: 1440, risk: 1, levMax: 1 },
};
const TFW = [0.25, 0.35, 0.4];
const SECTOR = { SBER: 'банки', VTBR: 'банки', T: 'банки', CBOM: 'банки', LKOH: 'нефть и газ', ROSN: 'нефть и газ', TATN: 'нефть и газ', SNGS: 'нефть и газ', GAZP: 'нефть и газ', NVTK: 'нефть и газ', GMKN: 'металлы', CHMF: 'металлы', NLMK: 'металлы', MAGN: 'металлы', PLZL: 'металлы', ALRS: 'металлы' };
const MACRO = { 'банки': 'Ключевая ставка ЦБ, качество кредитов, отчётность МСФО, дивиденды.', 'нефть и газ': 'Цена нефти и газа, курс USD/RUB, налоги на добычу, санкции, дивидендная политика.', 'металлы': 'Цены на металлы, курс рубля, экспортные пошлины, налоговая нагрузка.' };

let state = { key: null, h: localStorage.getItem('ig_horizon') || 'mid', seq: 0, ctx: null };
export const getAnalysis = () => state.ctx;

function techTf(cs) {
  const n = cs.length;
  if (n < 35) return null;
  const c = cs.map((x) => x.c), hi = cs.map((x) => x.h), lo = cs.map((x) => x.l), px = last(c);
  const e20 = ema(c, 20), e50 = ema(c, 50), e200 = ema(c, 200), r = rsi(c, 14), m = macd(c), a = atr(hi, lo, c, 14);
  const l20 = last(e20), l50 = last(e50), l200 = last(e200), rv = last(r), mh = last(m.hist), ph = m.hist[n - 2];
  let s = 0;
  const up = px > l20 && l20 > l50, down = px < l20 && l20 < l50;
  s += up ? 30 : down ? -30 : px > l50 ? 10 : -10;
  if (Number.isFinite(l200)) s += px > l200 ? 10 : -10;
  s += mh > 0 ? 15 : -15; s += mh > ph ? 5 : -5;
  s += rv >= 70 ? (up ? -3 : -12) : rv >= 55 ? 10 : rv >= 45 ? 0 : rv > 30 ? -10 : (down ? 3 : 12);
  const h20 = Math.max(...hi.slice(-21, -1)), l20x = Math.min(...lo.slice(-21, -1));
  s += px > h20 ? 10 : px < l20x ? -10 : 0;
  const hs = m.hist.slice(-4);
  const cross = hs[3] > 0 && Math.min(hs[0], hs[1], hs[2]) < 0 ? 1 : hs[3] < 0 && Math.max(hs[0], hs[1], hs[2]) > 0 ? -1 : 0;
  let div = 0;
  const piv = (arr, hiP) => { const o = []; for (let i = Math.max(3, n - 70); i < n - 2; i++) { const w = [arr[i - 2], arr[i - 1], arr[i + 1], arr[i + 2]]; if (hiP ? arr[i] > Math.max(...w) : arr[i] < Math.min(...w)) o.push(i); } return o; };
  const ph2 = piv(hi, true), pl2 = piv(lo, false);
  if (ph2.length >= 2) { const [i1, i2] = ph2.slice(-2); if (n - i2 <= 14 && hi[i2] > hi[i1] && r[i2] < r[i1] - 2) div = -1; }
  if (!div && pl2.length >= 2) { const [i1, i2] = pl2.slice(-2); if (n - i2 <= 14 && lo[i2] < lo[i1] && r[i2] > r[i1] + 2) div = 1; }
  const fmt = (x) => (Math.abs(x) >= 100 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(3) : x.toPrecision(4));
  return { score: clamp(s, -100, 100), px, atr: last(a), atrPct: (last(a) / px) * 100, rsi: rv, trend: up ? 1 : down ? -1 : 0, macdUp: mh > 0, macdCross: cross, div, hi20: fmt(h20), lo20: fmt(l20x), e20: l20, e50: l50, e200: l200 };
}

function candleScore(cs) {
  if (cs.length < 9) return { score: 0, list: [] };
  const list = scan(cs), n = cs.length;
  const rw = [1, 0.8, 0.6, 0.45, 0.3];
  let s = 0;
  for (const p of list) { const ago = n - 1 - p.i; s += (p.bias === 'bull' ? 1 : p.bias === 'bear' ? -1 : 0) * (rw[ago] ?? 0.2) * (1 + 0.25 * (p.len - 1)); }
  return { score: clamp(s * 40, -100, 100), list: list.map((p) => ({ name: p.name, bias: p.bias, ago: n - 1 - p.i })) };
}

const table = (js, t) => (js && js[t] ? js[t].data.map((r) => Object.fromEntries(js[t].columns.map((c, i) => [c, r[i]]))) : []);
const cacheGet = (k) => { try { const v = JSON.parse(sessionStorage.getItem(k)); if (v && Date.now() - v.t < 6 * 3600e3) return v.v; } catch { /* none */ } return null; };
const cacheSet = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), v })); } catch { /* quota */ } };

async function fundStocks(id) {
  const ISS = 'https://iss.moex.com/iss', ok = (j) => j && typeof j === 'object';
  const [d, m] = await Promise.allSettled([getJson(`${ISS}/securities/${id}/dividends.json?iss.meta=off`, { validate: ok }), getJson(`${ISS}/engines/stock/markets/shares/boards/TQBR/securities/${id}.json?iss.meta=off&iss.only=securities,marketdata`, { validate: ok })]);
  if (m.status !== 'fulfilled') throw new Error('нет данных MOEX');
  const sec = table(m.value, 'securities')[0] || {}, md = table(m.value, 'marketdata')[0] || {};
  const price = md.LAST || sec.PREVPRICE || 0, cap = md.ISSUECAPITALIZATION || (sec.ISSUESIZE && price ? sec.ISSUESIZE * price : 0);
  const divs = d.status === 'fulfilled' ? table(d.value, 'dividends').filter((x) => x.currencyid === 'RUB' || x.currencyid === 'SUR') : [];
  const now = Date.now(), ttm = divs.filter((x) => now - Date.parse(x.registryclosedate) < 365 * 864e5).reduce((s, x) => s + (+x.value || 0), 0);
  const years = new Set(divs.filter((x) => now - Date.parse(x.registryclosedate) < 6 * 365 * 864e5).map((x) => (x.registryclosedate || '').slice(0, 4))).size;
  const dy = price ? (ttm / price) * 100 : 0, liq = md.VALTODAY || 0, lvl = sec.LISTLEVEL;
  let s = 50; const good = [], flags = [];
  if (dy >= 8) { s += 10; good.push(`дивиденды ${f1(dy)}% за год`); } else if (dy >= 4) { s += 5; good.push(`дивиденды ${f1(dy)}% за год`); } else if (dy === 0 && d.status === 'fulfilled') { s -= 3; flags.push('дивидендов за год нет'); }
  if (years >= 5) { s += 8; good.push(`дивиденды платятся ${years} из 6 лет`); } else if (years <= 1 && d.status === 'fulfilled') { s -= 4; flags.push('дивиденды платятся нерегулярно'); }
  if (cap >= 1e12) { s += 8; good.push(`крупная капитализация ${big(cap)} ₽`); } else if (cap >= 1e11) s += 3; else if (cap && cap < 5e10) { s -= 8; flags.push(`малая капитализация ${big(cap)} ₽`); }
  if (lvl === 1) { s += 5; good.push('первый уровень листинга'); } else if (lvl === 3) { s -= 6; flags.push('третий уровень листинга'); }
  if (liq >= 1e9) { s += 5; good.push(`оборот ${big(liq)} ₽ в день`); } else if (liq && liq < 5e7) { s -= 8; flags.push(`низкий оборот ${big(liq)} ₽ в день`); }
  const sector = SECTOR[id] || null;
  return { ok: true, score: clamp(s, 0, 100), good, flags, liq, dy, cap, items: [['Капитализация', cap ? big(cap) + ' ₽' : '—'], ['Дивиденды за 12 мес.', ttm ? `${f1(ttm, 2)} ₽ (${f1(dy)}%)` : 'нет данных'], ['Лет с дивидендами из 6', String(years)], ['Уровень листинга', lvl ?? '—'], ['Оборот за день', liq ? big(liq) + ' ₽' : '—'], ['Сектор', sector || 'не определён']], ctx: sector ? MACRO[sector] : 'Отчётность, дивидендная отсечка, ключевая ставка, индекс IMOEX, курс USD/RUB.', src: 'MOEX ISS' };
}

async function fundCrypto(id) {
  const sym = id.split('-')[0], ok = (j) => j && typeof j === 'object';
  const se = await getJson(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(sym)}`, { validate: ok });
  const hit = (se.coins || []).filter((c) => (c.symbol || '').toUpperCase() === sym.toUpperCase()).sort((a, b) => (a.market_cap_rank || 1e9) - (b.market_cap_rank || 1e9))[0];
  if (!hit) throw new Error('токен не найден');
  const j = await getJson(`https://api.coingecko.com/api/v3/coins/${hit.id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`, { validate: ok });
  const md = j.market_data || {}, mc = md.market_cap?.usd, fdv = md.fully_diluted_valuation?.usd, vol = md.total_volume?.usd, rank = md.market_cap_rank || j.market_cap_rank, circ = md.circulating_supply, max = md.max_supply;
  let s = 50; const good = [], flags = [];
  if (rank) { if (rank <= 10) { s += 15; good.push(`топ-10 по капитализации (#${rank})`); } else if (rank <= 30) { s += 10; good.push(`топ-30 (#${rank})`); } else if (rank <= 100) s += 4; else if (rank <= 300) { s -= 4; flags.push(`место #${rank} по капитализации`); } else { s -= 12; flags.push(`место #${rank}: малая капитализация`); } }
  const fr = mc && fdv ? fdv / mc : null;
  if (fr) { if (fr <= 1.15) { s += 6; good.push('почти все токены уже в обращении'); } else if (fr <= 1.6) s += 1; else if (fr <= 3) { s -= 6; flags.push(`FDV в ${f1(fr)} раза больше капитализации`); } else { s -= 12; flags.push(`FDV в ${f1(fr)} раза больше капитализации`); } }
  if (max && circ && circ / max < 0.5) { s -= 5; flags.push('в обращении меньше половины максимального выпуска'); }
  const vr = mc && vol ? vol / mc : null;
  if (vr != null) { if (vr < 0.01) { s -= 6; flags.push('низкий дневной оборот к капитализации'); } else if (vr <= 0.3) s += 3; else if (vr > 0.6) { s -= 3; flags.push('очень высокий оборот к капитализации'); } }
  if (j.genesis_date) { const age = (Date.now() - Date.parse(j.genesis_date)) / (365 * 864e5); if (age >= 5) { s += 5; good.push(`проекту ${f1(age, 0)} лет`); } else if (age < 1) { s -= 8; flags.push('проекту меньше года'); } }
  const ath = md.ath_change_percentage?.usd;
  if (ath != null) { if (ath < -85) { s -= 4; flags.push(`цена на ${f1(-ath, 0)}% ниже максимума`); } else if (ath > -20) s += 2; }
  return { ok: true, score: clamp(s, 0, 100), good, flags, fdvRatio: fr, items: [['Капитализация', mc ? '$' + big(mc) : '—'], ['Место в рейтинге', rank ? '#' + rank : '—'], ['FDV / капитализация', fr ? f1(fr, 2) : '—'], ['Оборот / капитализация', vr != null ? f1(vr * 100, 1) + '%' : '—'], ['Максимум предложения', max ? big(max) : 'не ограничено'], ['Изменение за год', md.price_change_percentage_1y != null ? f1(md.price_change_percentage_1y, 0) + '%' : '—']], ctx: 'Потоки в ETF и ликвидность рынка, разблокировки токенов, листинги и делистинги, корреляция с BTC.', src: 'CoinGecko' };
}

async function getFund(k) {
  const ck = 'fund2:' + k.market + ':' + k.id, c = cacheGet(ck);
  if (c) return c;
  try { const v = k.market === 'crypto' ? await fundCrypto(k.id) : await fundStocks(k.id); cacheSet(ck, v); return v; } catch (e) { return { ok: false, score: null, good: [], flags: [], items: [], err: e.message }; }
}

const cc = new Map();
async function getCandles(k, tf) {
  const key = k.market + k.id + tf, hit = cc.get(key);
  if (hit && Date.now() - hit.t < 90000) return hit.v;
  const v = await (k.market === 'crypto' ? okx.candles(k.id, tf) : moex.candles(k.id, tf));
  cc.set(key, { t: Date.now(), v });
  return v;
}

const feeOf = (fees, mk) => {
  const v = (id) => ($(id) ? $(id).value : '');
  try {
    if (mk === 'crypto') { const ex = fees.crypto[v('pEx')] || fees.crypto.okx; return (ex[v('pInst') || 'spot'] || ex.spot)[v('pOrd') || 'taker']; }
    const b = fees.brokers.find((x) => x.id === v('pBrk')) || fees.brokers[0]; return b.brokerRate + b.exchangeStock;
  } catch { return mk === 'crypto' ? 0.001 : 0.0035; }
};
let feesP = null;
const getFees = () => (feesP ||= fetch('config/fees.json').then((r) => r.json()).catch(() => null));

export function compute(k, hkey, byTf, fund, fees) {
  const H = HZ[hkey], tfs = H.tfs[k.market];
  const per = tfs.map((tf, i) => { const t = techTf(byTf[tf] || []); return t ? { tf, w: TFW[i], ...t } : null; }).filter(Boolean);
  if (!per.length) return null;
  const wsum = per.reduce((s, t) => s + t.w, 0), T = per.reduce((s, t) => s + t.score * t.w, 0) / wsum;
  const main = per.find((t) => t.tf === H.main[k.market]) || per[Math.min(1, per.length - 1)];
  const sign = Math.sign(T) || 0, agree = per.filter((t) => Math.sign(t.score) === sign).length / per.length;
  const C = candleScore(byTf[H.ctf] || byTf[tfs[1]] || []);
  const F = { ...fund, score100: fund && fund.ok ? (fund.score - 50) * 2 : null };
  const w = { ...H.w };
  if (!fund || !fund.ok) { const r = w.f; w.f = 0; const s = w.t + w.c; w.t += r * (w.t / s); w.c += r * (w.c / s); }
  const total = T * w.t + C.score * w.c + (F.score100 != null ? F.score100 * w.f : 0);
  const dir = total >= 15 ? 'long' : total <= -15 ? 'short' : 'wait';
  const conf = clamp(30 + Math.abs(total) * 0.5 + agree * 30 - (fund && fund.ok ? 0 : 8), 5, 95);
  let rng = null; const d1 = byTf['1d'];
  if (d1 && d1.length > 60) { const cl = d1.slice(-252).map((x) => x.c), lo = Math.min(...cl), hi = Math.max(...cl), ath = Math.max(...d1.map((x) => x.h)), px = last(cl); rng = { pct: hi > lo ? ((px - lo) / (hi - lo)) * 100 : 50, dd: (px / ath - 1) * 100 }; }
  const px = main.px, fee = fees ? feeOf(fees, k.market) : 0.001, stopDist = H.stopK * main.atr, gain = H.tpK * main.atr;
  const rr = (gain - 2 * fee * px) / (stopDist + 2 * fee * px);
  const num = (id, d) => { const v = $(id) ? parseFloat($(id).value) : NaN; return Number.isFinite(v) ? v : d; };
  const lev = k.market === 'crypto' ? num('pLev', 1) || 1 : 1;
  let j = []; try { j = JSON.parse(localStorage.getItem('ig_journal')) || []; } catch { /* none */ }
  const open = { long: j.filter((x) => x.status === 'open' && x.dir === 'long').length, short: j.filter((x) => x.status === 'open' && x.dir === 'short').length };
  const levSug = k.market === 'crypto' ? (conf >= 60 ? H.levMax : Math.min(H.levMax, 1.5)) : 1;
  const ctx = { h: hkey, mk: k.market, id: k.id, px, T: { score: T, tfs: per, main, consensus: agree }, C, F, S: total, total, dir, conf, rng, fee, rr, stopPct: (stopDist / px) * 100, lev, levMax: H.levMax, riskPct: num('pRisk', 1), open, stopNearLiq: lev > 1 && stopDist > 0.8 * (px / lev), plan: { stopK: H.stopK, tpK: H.tpK, hold: H.hold, risk: H.risk, lev: levSug, atr: main.atr, tf: main.tf }, at: Date.now() };
  ctx.recs = run(PRE, ctx);
  return ctx;
}

const verdict = (c) => (c.total >= 35 ? 'Long предпочтительнее' : c.total >= 15 ? 'Лёгкий перевес Long' : c.total <= -35 ? 'Short предпочтительнее' : c.total <= -15 ? 'Лёгкий перевес Short' : 'Нейтрально: лучше подождать');
const bar = (v) => { const p = clamp(v, -100, 100); return `<div class="an-bar"><i style="left:${p >= 0 ? 50 : 50 + p / 2}%;width:${Math.abs(p) / 2}%;background:${p >= 0 ? 'var(--ok)' : 'var(--bad)'}"></i></div>`; };
const sg = (v) => (v > 0 ? '+' : '') + f1(v, 0);

const css = document.createElement('style');
css.textContent = '#anBox{border-radius:18px;background:var(--kpi);padding:12px 14px;margin:12px 0}#anBox h3{margin:2px 0 6px}#anBox h4{margin:12px 0 4px;font:600 13px var(--head);color:var(--mut);text-transform:uppercase;letter-spacing:.06em}.an-row{display:grid;grid-template-columns:130px 1fr 52px;gap:8px;align-items:center;font-size:13px;margin:5px 0}.an-bar{position:relative;height:10px;border-radius:6px;background:var(--field)}.an-bar::after{content:"";position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--mut)}.an-bar i{position:absolute;top:0;bottom:0;border-radius:6px}.an-tot{font:600 17px var(--head);margin:10px 0 2px}.an-l{list-style:none;margin:0;padding:0}.an-l li{padding:7px 10px;margin:4px 0;border-radius:12px;background:var(--field);border-left:4px solid var(--l4);font-size:13px}.an-l li.bad{border-left-color:var(--bad)}.an-l li.warn{border-left-color:var(--warn)}.an-l li.good{border-left-color:var(--ok)}.an-l li b{display:block}.an-l li span{color:var(--mut)}.an-fund td{padding:3px 8px 3px 0;text-align:left;white-space:normal}.an-fund td:last-child{text-align:right}@media(max-width:520px){.an-row{grid-template-columns:100px 1fr 44px}}';
document.head.appendChild(css);

function box() {
  let b = $('anBox');
  if (!b) {
    b = document.createElement('div'); b.id = 'anBox'; b.setAttribute('data-nogl', '');
    const top = document.querySelector('#sheet .sh-top') || $('shLights');
    if (!top) return null;
    top.before(b);
    b.addEventListener('click', (e) => {
      const h = e.target.closest('[data-h]');
      if (h) { state.h = h.dataset.h; localStorage.setItem('ig_horizon', state.h); start(true); }
      if (e.target.id === 'anApply') applyPlan();
    });
  }
  return b;
}

function applyPlan() {
  const c = state.ctx; if (!c) return;
  const dirBtn = c.dir !== 'wait' ? document.querySelector(`#shDir [data-d="${c.dir}"]`) : null;
  if (dirBtn && !dirBtn.classList.contains('on')) dirBtn.click();
  const set = (id, v) => { const el = $(id); if (el) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); } };
  set('pStop', c.plan.stopK); set('pTp', c.plan.tpK); set('pHold', c.plan.hold); set('pRisk', c.plan.risk); set('pLev', c.plan.lev);
}

function render(c, loading) {
  const b = box(); if (!b) return;
  const H = HZ[state.h];
  const seg = `<div class="seg" id="anH">${Object.entries(HZ).map(([k, v]) => `<button data-h="${k}" class="${k === state.h ? 'on' : ''}">${v.name}</button>`).join('')}</div>`;
  const head = `<h3>Комплексный анализ</h3>${seg}<p class="hint">${H.name} торговля: ${H.note}. Таймфреймы ${H.tfs[assetKey()?.market || 'crypto'].join(', ')}. Вес в итоге: техника ${Math.round(H.w.t * 100)}%, свечи ${Math.round(H.w.c * 100)}%, фундамент ${Math.round(H.w.f * 100)}%.</p>`;
  if (loading || !c) { b.innerHTML = head + `<p class="hint">${loading ? 'Считаю: загружаю свечи и фундаментальные данные…' : 'Не удалось получить данные для анализа.'}</p>`; return; }
  const F = c.F, risks = c.recs.filter((r) => r.k === 'risk'), recs = c.recs.filter((r) => r.k === 'rec');
  const li = (r) => `<li class="${r.l}"><b>${esc(r.t)} <span>· ${levelName[r.l]}</span></b>${esc(r.x)}</li>`;
  b.innerHTML = head + `
  <div class="an-row"><span>Технический</span>${bar(c.T.score)}<b>${sg(c.T.score)}</b></div>
  <div class="an-row"><span>Свечной</span>${bar(c.C.score)}<b>${sg(c.C.score)}</b></div>
  <div class="an-row"><span>Фундаментальный</span>${F.ok ? bar(F.score100) : '<span class="hint">нет данных</span>'}<b>${F.ok ? sg(F.score100) : '—'}</b></div>
  <div class="an-tot">${verdict(c)} · счёт ${sg(c.total)} · уверенность ${f1(c.conf, 0)}%</div>
  <p class="hint">Таймфреймы: ${c.T.tfs.map((t) => `${t.tf} ${sg(t.score)}`).join(', ')}. Свечи: ${c.C.list.length ? c.C.list.map((p) => esc(p.name)).join(', ') : 'сигналов нет'}.</p>
  <h4>Рекомендации</h4><ul class="an-l">${recs.map(li).join('') || '<li class="info"><b>Особых рекомендаций нет</b>Действуйте по плану и правилам риска.</li>'}</ul>
  <h4>Риски</h4><ul class="an-l">${risks.map(li).join('') || '<li class="good"><b>Явных рисков не найдено</b>Это не значит, что их нет: рынок может измениться в любой момент.</li>'}</ul>
  <details><summary>Фундаментальные данные${F.ok ? ' (' + esc(F.src) + ')' : ''}</summary>${F.ok ? `<table class="an-fund">${F.items.map(([t, v]) => `<tr><td>${esc(t)}</td><td>${esc(v)}</td></tr>`).join('')}</table><p class="hint">Что смотреть: ${esc(F.ctx)}</p><p class="hint">Мультипликаторы (P/E, EBITDA) бесплатно недоступны, поэтому оценка основана на открытых рыночных данных. Это не замена изучению отчётности эмитента.</p>` : `<p class="hint">Источник не ответил: ${esc(F.err || 'нет связи')}.</p>`}</details>
  <details><summary>Как считается</summary><p class="hint">Технический счёт: тренд по EMA 20, 50, 200, MACD, RSI и пробои на каждом таймфрейме, затем среднее с большим весом старшего. Свечной: последние 5 свечей, свежие сигналы весят больше. Фундаментальный: открытые рыночные данные (для акций MOEX, для крипты CoinGecko). Итог от −100 до +100, выше 15 это перевес Long, ниже −15 перевес Short. Это инструмент обучения, а не инвестиционная рекомендация.</p></details>
  <div class="row"><button class="btn sm" id="anApply">Применить параметры сделки к плану</button></div>
  <p class="hint">Рекомендованные: стоп ${c.plan.stopK}×ATR, тейк ${c.plan.tpK}×ATR, удержание ${c.plan.hold >= 48 ? f1(c.plan.hold / 24, 0) + ' дн.' : c.plan.hold + ' ч'}, риск ${c.plan.risk}%${c.mk === 'crypto' ? ', плечо до ' + c.plan.lev : ''}.</p>`;
}

async function start(force) {
  const k = assetKey();
  if (!k) return;
  const key = k.market + ':' + k.id;
  if (!force && key === state.key && state.ctx) { render(state.ctx); return; }
  state.key = key; const seq = ++state.seq;
  render(null, true);
  try {
    const H = HZ[state.h], tfs = H.tfs[k.market];
    const need = [...new Set([...tfs, ...(state.h !== 'short' ? ['1d'] : [])])];
    const [fund, fees, ...cands] = await Promise.all([getFund(k), getFees(), ...need.map((tf) => getCandles(k, tf).catch(() => []))]);
    if (seq !== state.seq) return;
    const byTf = Object.fromEntries(need.map((tf, i) => [tf, cands[i]]));
    state.ctx = compute(k, state.h, byTf, fund, fees);
    render(state.ctx);
  } catch (e) { if (seq === state.seq) { state.ctx = null; render(null); } }
}

document.addEventListener('ig:chart', () => setTimeout(() => start(false), 150));
