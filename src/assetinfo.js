import * as okx from './data/okx.js';
import * as moex from './data/moex.js';
import { analyze, HORIZONS } from './engine/fxwhy.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const ST = { id: null, market: null, cs: null, days: 21, rates: null };

const css = document.createElement('style');
css.textContent = '#aiBox{margin:14px 0}#aiBox h3{margin:16px 0 6px}#aiBox li{margin:5px 0}.aiR{display:inline-block;padding:2px 10px;border-radius:999px;font:600 12px var(--head);color:#fff}.aiR.g{background:var(--ok)}.aiR.y{background:var(--warn)}.aiR.r{background:var(--bad)}.aiC{display:flex;gap:8px;align-items:flex-start;margin:5px 0}.aiC i{flex:none;margin-top:5px}';
document.head.appendChild(css);

function ident() {
  const sh = $('sheet');
  const o = sh.querySelector('a[href*="okx.com/trade-spot/"]');
  if (o) { const m = /trade-spot\/([^/?#]+)/.exec(o.href); return m ? { market: 'crypto', id: m[1].toUpperCase() } : null; }
  const s = sh.querySelector('a[href*="issue.aspx?code="]');
  if (s) { try { return { market: 'stocks', id: new URL(s.href).searchParams.get('code') }; } catch { return null; } }
  return null;
}

function stats(cs) {
  const c = cs.map((x) => x.c), n = c.length - 1, yr = c.slice(-250);
  const hi = Math.max(...yr), lo = Math.min(...yr);
  let peak = yr[0], dd = 0;
  for (const p of yr) { peak = Math.max(peak, p); dd = Math.min(dd, p / peak - 1); }
  const v = cs.map((x) => x.v || 0), a5 = v.slice(-5).reduce((s, x) => s + x, 0) / 5, a20 = v.slice(-25, -5).reduce((s, x) => s + x, 0) / 20 || 1;
  return { hi, lo, pos: (c[n] - lo) / (hi - lo || 1), dd: dd * 100, volRatio: a5 / a20 };
}

function riskBlock(a, st) {
  const crypto = ST.market === 'crypto', atr = a.atr;
  const lvl = crypto ? (atr < 2.5 ? ['умеренный', 'y'] : atr < 5 ? ['повышенный', 'y'] : ['высокий', 'r']) : (atr < 1.5 ? ['невысокий', 'g'] : atr < 3 ? ['умеренный', 'y'] : ['повышенный', 'r']);
  const cur = crypto
    ? 'Цена и результат сделки считаются в USDT: это токен, привязанный к доллару США. Чтобы получить рубли, нужен обмен USDT на рубли, а курс USDT/RUB тоже меняется. У USDT есть риск потери привязки к доллару или блокировки.'
    : 'Цена и результат сделки считаются в рублях (₽). Если вы мыслите в долларах, добавьте курс USD/RUB: ослабление рубля поднимает цену экспортёров, а крепкий рубль давит на их прибыль.';
  const extra = crypto
    ? 'Крипторынок работает круглосуточно, цены могут резко двигаться ночью и в выходные. С плечом позицию могут закрыть принудительно. Криптоактивы не застрахованы ни АСВ, ни брокером, а торги идут вне российской защиты инвесторов.'
    : 'Акции могут упасть после отчётности или дивидендной отсечки (цена снижается на размер дивиденда). Котировки MOEX бесплатно идут с задержкой около 15 минут, в новостных гэпах цена открывается далеко от вчерашнего закрытия.';
  return `<h3>Об активе: валюта и риск</h3><p><span class="aiR ${lvl[1]}">Риск ${lvl[0]}</span> Типичный дневной размах (ATR) около ${nf(atr)}% цены. За последний год от максимума цена падала до ${nf(Math.abs(st.dd), 1)}%. Сейчас она на ${nf(st.pos * 100, 0)}% диапазона между годовым минимумом и максимумом.</p><p>${esc(cur)}</p><p>${esc(extra)}</p><p class="hint">Уровень риска оценён по волатильности за год и не учитывает новости эмитента.</p>`;
}

function whyBlock(a, st) {
  const up = a.chg >= 0, items = [];
  items.push(`За выбранный срок цена ${up ? 'выросла' : 'снизилась'} на ${nf(Math.abs(a.chg))}%.`);
  items.push(a.trendUp ? 'Средняя цена за 20 дней выше средней за 50 дней: краткосрочный тренд направлен вверх.' : 'Средняя цена за 20 дней ниже средней за 50 дней: краткосрочный тренд направлен вниз.');
  items.push(a.macdUp ? 'MACD выше сигнальной линии: импульс направлен вверх.' : 'MACD ниже сигнальной линии: импульс направлен вниз.');
  if (a.rsi != null) items.push(a.rsi >= 70 ? `RSI ${nf(a.rsi, 0)}: рост перегрет, возможна пауза или откат.` : a.rsi <= 30 ? `RSI ${nf(a.rsi, 0)}: падение затянулось, возможен отскок.` : `RSI ${nf(a.rsi, 0)}: перегрева нет.`);
  items.push(st.volRatio >= 1.3 ? `Объём торгов за последние 5 дней в ${nf(st.volRatio, 1)} раза выше обычного: движение подтверждено активностью.` : st.volRatio <= 0.7 ? 'Объём торгов ниже обычного: движению не хватает участников, оно менее надёжно.' : 'Объём торгов близок к обычному.');
  items.push(Math.abs(a.z) >= 1.5 ? `Цена на ${nf(Math.abs(a.z), 1)} σ ${a.z > 0 ? 'выше' : 'ниже'} среднего за год: ${a.z > 0 ? 'после такого роста чаще бывают откаты' : 'после такого падения чаще бывают отскоки'}.` : 'Цена в пределах обычного годового разброса.');
  const ctx = ST.market === 'crypto' ? 'Внешние причины для крипты: движение BTC и общий аппетит к риску, потоки в биржевые фонды, ставки ФРС, новости регуляторов, разблокировки токенов (подробнее в блоке «На что смотреть»).' : 'Внешние причины для акций: ключевая ставка Банка России' + (ST.rates && ST.rates.keyRate && ST.rates.keyRate.nextMeeting ? ' (заседание ' + ST.rates.keyRate.nextMeeting.split('-').reverse().join('.') + ')' : '') + ', нефть и курс рубля, отчётность и дивиденды, санкции (подробнее в блоке «На что смотреть»).';
  return `<h3>Почему цена растёт или падает</h3><div class="seg" id="aiH">${HORIZONS.map((h) => `<button data-d="${h.d}" class="${h.d === ST.days ? 'on' : ''}">${h.n}</button>`).join('')}</div><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><p>${esc(ctx)}</p><p class="hint">Это объяснение по данным цены, а не причина событий. Новости и отчётность проверьте отдельно.</p>`;
}

function signalBlock() {
  const lights = $('shLights'); if (!lights) return '';
  const verdict = (lights.querySelector('.verdict') || {}).className || '';
  const v = /green/.test(verdict) ? 'green' : /red/.test(verdict) ? 'red' : 'yellow';
  const tf = (($('shTf') || document).querySelector('.on') || {}).dataset?.t || '', dir = (($('shDir') || document).querySelector('.on') || {}).dataset?.d || 'long';
  const row = [...lights.querySelectorAll('.mini-t tr')].find((r) => r.children[0] && r.children[0].textContent.trim() === tf) || lights.querySelector('.mini-t tr:nth-child(2)');
  const st = row ? [...row.querySelectorAll('i.dot')].map((d) => (d.classList.contains('green') ? 'g' : d.classList.contains('red') ? 'r' : 'y')) : [];
  const why = [...lights.querySelectorAll('.why li')].map((l) => l.textContent);
  const names = [['MACD', 'импульс цены направлен в вашу сторону', 'Показывает, набирает ли движение силу. Зелёный: импульс в сторону вашей сделки.'], ['EMA', 'тренд по скользящим средним в вашу сторону', 'Сглаженная цена. Зелёный: средние выстроены по направлению сделки.'], ['RSI', 'цена не перегрета для входа', 'Индекс силы движения от 0 до 100. Зелёный: рабочая зона, обычно 45–65.']];
  const ck = names.map(([n, t, tip], i) => `<div class="aiC"><i class="dot ${['green', 'yellow', 'red'][['g', 'y', 'r'].indexOf(st[i] || 'y')]}"></i><span><span class="gl" tabindex="0" data-tip-title="${n}" data-tip="${esc(tip)}">${n}</span>: ${t}${st[i] === 'g' ? ', условие выполнено' : st[i] === 'r' ? ', сейчас против сделки' : ', пока нет подтверждения'}.</span></div>`).join('');
  const rr = why.find((x) => /R:R/.test(x)), atr = why.find((x) => /ATR/.test(x));
  const ck2 = `<div class="aiC"><i class="dot ${rr ? 'yellow' : 'green'}"></i><span>Прибыль к риску после комиссий не меньше 1,5${rr ? ': сейчас ' + esc(rr.replace('R:R после затрат ', '').replace(' < 1.5', ', меньше нужного') ) : ', условие выполнено'}.</span></div><div class="aiC"><i class="dot ${atr ? 'yellow' : 'green'}"></i><span>Размах цены (ATR) в рабочем диапазоне${atr ? ': сейчас вне диапазона' : ', условие выполнено'}.</span></div>`;
  const head = { green: 'Условия для входа сейчас выполнены. Это значит, что индикаторы согласны, но не обещает рост: цена может развернуться, поэтому нужен стоп.', yellow: 'Часть условий не выполнена. Обычно в такой ситуации ждут, пока индикаторы подтвердят направление, а не входят заранее.', red: 'Сигнал против сделки: индикаторы показывают движение в другую сторону. Для входа в ' + (dir === 'long' ? 'Long' : 'Short') + ' условий нет.' }[v];
  return `<h3>Когда сигнал может указывать на вход</h3><p><span class="aiR ${{ green: 'g', yellow: 'y', red: 'r' }[v]}">${{ green: 'Зелёный', yellow: 'Жёлтый', red: 'Красный' }[v]}</span> ${esc(head)}</p>${ck}${ck2}<p class="hint">Вход обычно рассматривают, когда выполнены все пять условий выше на выбранном таймфрейме${tf ? ' (' + esc(tf) + ')' : ''}, а старший таймфрейм не против. Перед входом проверьте ближайшие события: отчётность, дивидендную отсечку, разблокировки токенов, заседание по ставке. Сигнал информационный, решение принимает инвестор.</p>`;
}

function draw() {
  const box = $('aiBox'); if (!box || !ST.cs) return;
  const a = analyze(ST.cs, ST.days);
  const sigHtml = `<div id="aiSig">${signalBlock()}</div>`;
  if (!a) { box.innerHTML = sigHtml + '<p class="hint">Для анализа причин нужна история не менее 60 дневных свечей.</p>'; return; }
  const st = stats(ST.cs);
  a.atr = a.atr ?? 0;
  box.innerHTML = riskBlock(a, st) + sigHtml + whyBlock(a, st);
  box.querySelectorAll('#aiH button').forEach((b) => { b.onclick = () => { ST.days = +b.dataset.d; draw(); }; });
}

let busy = false;
async function init() {
  if (busy) return;
  const sh = $('sheet');
  if (!sh || sh.hidden || !$('shLights') || $('aiBox')) return;
  const idn = ident(); if (!idn) return;
  busy = true;
  const box = document.createElement('div');
  box.id = 'aiBox'; box.innerHTML = '<p class="hint">Загружаю дневную историю для анализа…</p>';
  $('shLights').after(box);
  ST.id = idn.id; ST.market = idn.market; ST.cs = null;
  try {
    if (!ST.rates) ST.rates = await fetch('config/rates.json').then((r) => r.json()).catch(() => null);
    ST.cs = await (idn.market === 'crypto' ? okx.candles(idn.id, '1d') : moex.candles(idn.id, '1d'));
    if ($('aiBox') === box) draw();
  } catch (e) { if ($('aiBox') === box) box.innerHTML = '<p class="hint">Не удалось загрузить историю для анализа: ' + esc(e.message) + '</p>'; }
  busy = false;
}

new MutationObserver(() => {
  init();
  const sig = $('aiSig'), l = $('shLights');
  if (sig && l) { const html = signalBlock(); if (sig.dataset.h !== html) { sig.dataset.h = html; sig.innerHTML = html; } }
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
init();
