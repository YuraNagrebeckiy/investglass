import { play, soundOn } from './ui.js';
import { evaluate, PRESETS } from './engine/signal.js';
import * as okx from './data/okx.js';
import * as moex from './data/moex.js';
import { assetKey } from './draw.js';

const $ = (id) => document.getElementById(id);
const LS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const all = () => LS('ig_alerts', []);
const put = (a) => { localStorage.setItem('ig_alerts', JSON.stringify(a)); renderCard(); };
const TFS = { crypto: ['1h', '4h', '1d'], stocks: ['1h', '1d', '1w'] };
const KIND = { price: 'По цене', signal: 'Сигнал на вход', reversal: 'Разворот' };

const css = document.createElement('style');
css.textContent = '#toasts{position:fixed;right:12px;top:calc(12px + env(safe-area-inset-top));z-index:100;display:flex;flex-direction:column;gap:8px;max-width:min(360px,calc(100vw - 24px))}.toast{background:var(--acc);color:var(--on-acc);padding:12px 14px;border-radius:18px;box-shadow:0 14px 34px rgba(0,0,0,.3);animation:sheetIn .4s var(--ease);font-size:14px}.toast b{display:block;font-family:var(--head)}.dtb{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}.dtb .mini.on{background:var(--acc);color:var(--on-acc)}.alb{margin:12px 0;padding:12px;border-radius:18px;background:var(--kpi)}.alb h3{margin-top:0}';
document.head.appendChild(css);
const tw = document.createElement('div'); tw.id = 'toasts'; document.body.appendChild(tw);

export function notify(title, text, sound) {
  const t = document.createElement('div');
  t.className = 'toast'; t.innerHTML = '<b></b><span></span>';
  t.firstChild.textContent = title; t.lastChild.textContent = text;
  tw.appendChild(t);
  setTimeout(() => t.remove(), 12000);
  t.onclick = () => t.remove();
  play(sound);
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: text }); } catch { /* not allowed */ }
}

async function price(market, id) {
  if (market === 'crypto') {
    const j = await (await fetch('https://www.okx.com/api/v5/market/ticker?instId=' + encodeURIComponent(id))).json();
    return +j.data[0].last;
  }
  const j = await (await fetch(`https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/${encodeURIComponent(id)}.json?iss.meta=off&iss.only=marketdata&marketdata.columns=SECID,LAST`)).json();
  return +j.marketdata.data[0][1];
}
async function verdict(market, id, dir) {
  const src = market === 'crypto' ? okx : moex, byTf = {};
  for (const tf of TFS[market]) byTf[tf] = await src.candles(id, tf);
  return evaluate(byTf, dir, 'mid', { ...PRESETS[market], rsiMode: 'trend' }).overall;
}

let busy = false, tick = 0;
async function check() {
  if (busy) return;
  busy = true; tick++;
  try {
    const list = all(), journal = LS('ig_journal', []).filter((r) => r.status === 'open');
    let changed = false;
    const prices = new Map();
    const get = async (m, id) => { const k = m + id; if (!prices.has(k)) prices.set(k, await price(m, id).catch(() => NaN)); return prices.get(k); };
    for (const a of list) {
      if (a.fired) continue;
      if (a.kind === 'price') {
        const p = await get(a.market, a.sym);
        if (Number.isFinite(p) && (a.dir === 'above' ? p >= a.level : p <= a.level)) { a.fired = true; changed = true; notify(`${a.name}: цена ${a.dir === 'above' ? 'выше' : 'ниже'} ${a.level}`, `Сейчас ${p}`, 'price'); }
      } else if (tick % 4 === 1) {
        const v = await verdict(a.market, a.sym, a.dir).catch(() => null);
        if (!v) continue;
        if (a.kind === 'signal' && v === 'green') { a.fired = true; changed = true; notify(`${a.name}: сигнал ${a.dir === 'long' ? 'Long' : 'Short'} стал зелёным`, 'Условия входа выполнены, проверьте план и риск.', 'deal'); }
        if (a.kind === 'reversal') { if (a.prev && a.prev !== 'red' && v === 'red') { a.fired = true; changed = true; notify(`${a.name}: возможен разворот`, 'Индикаторы развернулись против вашего направления.', 'reversal'); } a.prev = v; changed = true; }
      }
    }
    for (const r of journal) {
      const p = await get(r.market, r.symbol);
      if (!Number.isFinite(p) || r.notified) continue;
      const d = r.dir === 'short' ? -1 : 1;
      const tp = d * (p - r.tp) >= 0, stop = d * (p - r.stop) <= 0;
      if (tp || stop) {
        const all2 = LS('ig_journal', []), x = all2.find((q) => q.id === r.id);
        if (x) { x.notified = tp ? 'tp' : 'stop'; localStorage.setItem('ig_journal', JSON.stringify(all2)); }
        notify(`${r.symbol}: ${tp ? 'тейк достигнут' : 'сработал стоп'}`, `Цена ${p}. Закройте запись в журнале и укажите цену выхода.`, tp ? 'deal' : 'reversal');
      }
    }
    if (changed) put(list);
  } finally { busy = false; }
}
setInterval(check, 30000);
setTimeout(check, 4000);

function renderCard() {
  const sec = $('journal');
  if (!sec) return;
  let c = $('alCard');
  if (!c) { c = document.createElement('div'); c.id = 'alCard'; c.className = 'card glass'; sec.appendChild(c); c.onclick = (e) => { const id = +e.target.dataset.del; if (id) put(all().filter((x) => x.id !== id)); }; }
  const l = all();
  c.innerHTML = `<h2>Мои уведомления</h2><p class="hint">Проверяются раз в 30 секунд, пока страница открыта. На iPhone в фоне они не работают.</p>` + (l.length ? l.map((a) => `<div class="chip"><span><b>${esc(a.name)}</b> <small>${KIND[a.kind]}${a.kind === 'price' ? (a.dir === 'above' ? ' выше ' : ' ниже ') + a.level : a.dir === 'long' ? ' Long' : a.dir === 'short' ? ' Short' : ''}${a.fired ? ' · сработало' : ''}</small></span><button class="mini" data-del="${a.id}">×</button></div>`).join('') : '<p class="hint">Пока нет. Добавьте в окне актива.</p>');
}

function addBox() {
  const sh = $('sheet'), enter = $('shEnter');
  if (!sh || sh.hidden || !enter || $('alBox')) return;
  const k = assetKey();
  if (!k) return;
  const cur = parseFloat(((sh.querySelector('h2 small') || {}).textContent || '').replace(/\s/g, '').replace(',', '.')) || '';
  const box = document.createElement('div');
  box.id = 'alBox'; box.className = 'alb'; box.setAttribute('data-nogl', '');
  box.innerHTML = `<h3>Уведомления</h3><div class="row"><label>Цена<input id="alP" type="number" inputmode="decimal" value="${cur}"></label><label>Когда<select id="alD"><option value="above">выше или равна</option><option value="below">ниже или равна</option></select></label><button class="btn sm" id="alAdd">Сообщить по цене</button></div>
  <div class="row"><button class="btn sm ghost" id="alSig">Сообщить, когда сигнал позеленеет</button><button class="btn sm ghost" id="alRev">Сообщить о развороте</button></div><p class="hint">Звуки: цена, хорошая сделка и разворот звучат по-разному. Включите звук 🔔 вверху и настройте в ⚙.</p>`;
  enter.parentElement.before(box);
  const dir = () => ((sh.querySelector('#shDir .on') || {}).dataset || {}).d || 'long';
  const add = (o) => {
    put([...all(), { id: Date.now(), market: k.market, sym: k.id, name: k.name, fired: false, ...o }]);
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ }
    notify('Уведомление добавлено', soundOn() ? 'Звук включён.' : 'Включите звук 🔔, чтобы слышать сигналы.', 'price');
  };
  $('alAdd').onclick = () => { const p = parseFloat($('alP').value); if (p > 0) add({ kind: 'price', dir: $('alD').value, level: p }); };
  $('alSig').onclick = () => add({ kind: 'signal', dir: dir() });
  $('alRev').onclick = () => add({ kind: 'reversal', dir: dir() });
}
new MutationObserver(addBox).observe(document.body, { childList: true, subtree: true });
renderCard();
