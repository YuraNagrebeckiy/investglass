import { getJson } from './data/net.js';
import { parseFrankfurter, DRIVERS } from './engine/pairs.js';
import { analyze, HORIZONS } from './engine/fxwhy.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CUR = { USD: 'доллар США', EUR: 'евро', GBP: 'фунт', JPY: 'иена', CHF: 'франк', AUD: 'австралийский доллар', CAD: 'канадский доллар', NZD: 'новозеландский доллар', CNY: 'юань', TRY: 'турецкая лира', INR: 'индийская рупия', HKD: 'гонконгский доллар', SGD: 'сингапурский доллар', MXN: 'мексиканское песо', BRL: 'бразильский реал', ZAR: 'южноафриканский рэнд' };
const CURD = { USD: 'доллару США', EUR: 'евро', GBP: 'фунту', JPY: 'иене', CHF: 'франку', AUD: 'австралийскому доллару', CAD: 'канадскому доллару', NZD: 'новозеландскому доллару', CNY: 'юаню', TRY: 'турецкой лире', INR: 'индийской рупии', HKD: 'гонконгскому доллару', SGD: 'сингапурскому доллару', MXN: 'мексиканскому песо', BRL: 'бразильскому реалу', ZAR: 'южноафриканскому рэнду' };
const MAJOR = ['EURUSD', 'USDJPY', 'GBPUSD', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD'];
const MORE = ['EURGBP', 'EURJPY', 'GBPJPY', 'EURCHF', 'USDCNY', 'USDTRY', 'USDINR', 'USDHKD', 'USDSGD', 'USDMXN', 'USDBRL', 'USDZAR'];
const ALL = [...MAJOR, ...MORE];
const SYMS = [...new Set(ALL.flatMap((p) => [p.slice(0, 3), p.slice(3)]))].filter((c) => c !== 'USD');
const title = (id) => `${id.slice(0, 3)}/${id.slice(3)}`;
const desc = (id) => `${CUR[id.slice(0, 3)]} к ${CURD[id.slice(3)]}`;
const dg = (id) => (id.endsWith('JPY') ? 3 : 5);
const S = { days: null, err: null };

const sec = $('fx');
if (sec) {
  const css = document.createElement('style');
  css.textContent = '.fwr{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;margin:6px 0;border-radius:16px;background:var(--kpi);cursor:pointer}.fwr small{color:var(--mut);display:block}.fwr .r{text-align:right;white-space:nowrap}';
  document.head.appendChild(css);
  const card = document.createElement('div');
  card.className = 'card glass'; card.id = 'fxWorld';
  card.innerHTML = '<h2>Мировые валютные пары</h2><p class="hint">Основные пары мирового рынка и популярные кроссы по дневным курсам Европейского центрального банка. Рубль в этих данных отсутствует. Нажмите на пару: причины движения, индикаторы и что влияет на курс.</p><h3>Основные пары</h3><div id="fwMajor"><p class="hint">Загружаю…</p></div><h3>Кроссы и другие популярные</h3><div id="fwMore"></div><div class="row"><button id="fwRef" class="btn sm ghost">Обновить</button><span id="fwInfo" class="hint"></span></div>';
  const anchor = $('fxTop') || $('fxCards');
  anchor.after(card);
  const sheet = document.createElement('div');
  sheet.className = 'sheet'; sheet.id = 'fxwSheet'; sheet.hidden = true;
  document.body.appendChild(sheet);

  const series = (id) => {
    const b = id.slice(0, 3), q = id.slice(3), r = (d, c) => (c === 'USD' ? 1 : d.rates[c]);
    return S.days.filter((d) => r(d, b) > 0 && r(d, q) > 0).map((d) => { const c = r(d, q) / r(d, b); return { t: Math.floor(Date.parse(d.date + 'T12:00:00Z') / 1000), o: c, h: c, l: c, c, v: 0 }; });
  };
  async function load() {
    $('fwInfo').textContent = 'Обновляю…';
    const from = new Date(Date.now() - 430 * 864e5).toISOString().slice(0, 10), syms = SYMS.join(',');
    const urls = [`https://api.frankfurter.dev/v1/${from}..?base=USD&symbols=${syms}`, `https://api.frankfurter.dev/v2/rates?from=${from}&base=USD&quotes=${syms}`];
    let err = null;
    for (const u of urls) {
      try {
        const days = parseFrankfurter(await getJson(u, { validate: (j) => j && typeof j === 'object' }));
        if (days.length < 60) throw new Error('мало данных');
        S.days = days; S.err = null; break;
      } catch (e) { err = e; }
    }
    if (!S.days) S.err = err ? err.message : 'нет данных';
    render();
  }
  function row(id) {
    const cs = series(id), n = cs.length;
    if (n < 2) return '';
    const last = cs[n - 1].c, prev = cs[n - 2].c, chg = (last / prev - 1) * 100, a = analyze(cs, 21), rsi = a && a.rsi;
    const tag = rsi >= 70 ? ' · перегрета вверх' : rsi <= 30 ? ' · перегрета вниз' : '';
    return `<div class="fwr" data-p="${id}"><div><b>${title(id)}</b><small>${esc(desc(id))}${tag}</small></div><div class="r"><b>${last.toFixed(dg(id))}</b><small class="${chg >= 0 ? 'good' : 'bad'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</small></div></div>`;
  }
  function render() {
    if (!S.days) { $('fwMajor').innerHTML = `<p class="hint">Пары не загрузились: ${esc(S.err || '…')}. Проверьте интернет и нажмите «Обновить».</p>`; $('fwMore').innerHTML = ''; $('fwInfo').textContent = ''; return; }
    $('fwMajor').innerHTML = MAJOR.map(row).join('');
    $('fwMore').innerHTML = MORE.map(row).join('');
    $('fwInfo').textContent = `Данные ЕЦБ на ${S.days[S.days.length - 1].date}, загружено ${new Date().toLocaleTimeString('ru-RU', { timeStyle: 'short' })}`;
  }

  function open(id, days = 21) {
    const cs = series(id), a = analyze(cs, days);
    sheet.hidden = false;
    if (!a) { sheet.innerHTML = '<div class="panel"><p class="bad">Слишком короткая история.</p><button class="mini" id="fxwX">Закрыть</button></div>'; $('fxwX').onclick = () => { sheet.hidden = true; }; return; }
    const c = cs.slice(-Math.max(days, 10)).map((x) => x.c), lo = Math.min(...c), hi = Math.max(...c), n = c.length - 1;
    const X = (i) => (600 * i) / n, Y = (p) => 112 - (104 * (p - lo)) / (hi - lo || 1);
    const svg = `<svg viewBox="0 0 600 120" preserveAspectRatio="none" style="width:100%;height:150px;background:var(--kpi);border-radius:16px"><path d="${c.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p).toFixed(1)}`).join('')}" fill="none" stroke="var(--line)" stroke-width="2.5"/></svg>`;
    const dr = DRIVERS[id], q = encodeURIComponent(`${title(id)} курс`);
    const drv = dr ? `<h3>Что двигает пару вверх</h3><ul>${dr.up.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><h3>Что двигает вниз</h3><ul>${dr.down.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<h3>Что влияет на пару</h3><ul><li>Ставки центральных банков обеих валют и ожидания по ним.</li><li>Данные по инфляции, занятости и росту экономики.</li><li>Аппетит к риску: в стресс-периоды растут защитные валюты, прежде всего доллар, франк и иена.</li><li>Цены на сырьё для сырьевых валют.</li></ul>';
    sheet.innerHTML = `<div class="panel" style="max-width:760px"><div class="sh-head"><div><h2>${title(id)} <small>${esc(desc(id))}</small></h2><b style="font:600 26px var(--head)">${a.px.toFixed(dg(id))}</b> <span class="${a.chg >= 0 ? 'good' : 'bad'}">${a.chg >= 0 ? '+' : ''}${a.chg.toFixed(2)}% за срок</span></div><button class="mini" id="fxwX">Закрыть</button></div>
    <div class="seg">${HORIZONS.map((h) => `<button data-d="${h.d}" class="${h.d === days ? 'on' : ''}">${h.n}</button>`).join('')}</div>${svg}
    <h3>Почему так</h3><ul>${(a.reasons || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    <h3>Признаки и индикаторы</h3><div class="kpis"><div class="k"><small>RSI (14)</small><b>${a.rsi == null ? '—' : a.rsi.toFixed(0)}</b></div><div class="k"><small>Тренд (EMA 20 и 50)</small><b class="${a.trendUp ? 'good' : 'bad'}">${a.trendUp ? 'вверх' : 'вниз'}</b></div><div class="k"><small>MACD</small><b class="${a.macdUp ? 'good' : 'bad'}">${a.macdUp ? 'вверх' : 'вниз'}</b></div><div class="k"><small>Откл. от среднего за год</small><b>${a.z.toFixed(1)} σ</b></div></div>
    <p class="hint">Индикаторы считаются по дневным курсам ЕЦБ, свечей и ATR для этих данных нет. Это статистика прошлого, а не прогноз.</p>${drv}
    <ul class="fxl"><li><a target="_blank" rel="noopener" href="https://news.google.com/search?q=${q}&hl=ru">Новости по паре ${title(id)}</a></li><li><a target="_blank" rel="noopener" href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html">Курсы ЕЦБ</a></li></ul>
    <div class="note">Это не инвестиционная рекомендация. Валютный рынок рискован, решения и убытки остаются на вас.</div></div>`;
    $('fxwX').onclick = () => { sheet.hidden = true; };
    sheet.querySelectorAll('.seg button').forEach((b) => { b.onclick = () => open(id, +b.dataset.d); });
  }
  card.addEventListener('click', (e) => { const r = e.target.closest('[data-p]'); if (r && S.days) open(r.dataset.p); });
  $('fwRef').onclick = load;
  load();
  setInterval(() => { if (sec.classList.contains('on')) load(); }, 30 * 60000);
}
