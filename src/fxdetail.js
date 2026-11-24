import { fx as loadFx } from './data/moex.js';
import { NAMES } from './engine/fx.js';
import { analyze, HORIZONS } from './engine/fxwhy.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ISS = 'https://iss.moex.com/iss';
const CUR = { USD: 'Доллар', EUR: 'Евро', CNY: 'Юань', HKD: 'Гонконгский доллар', TRY: 'Турецкая лира', KZT: 'Тенге', BYN: 'Белорусский рубль', AMD: 'Драм', GLD: 'Золото', SLV: 'Серебро', RUB: 'рубль' };
const title = (id) => { const m = /^([A-Z]{3})([A-Z]{3})/.exec(id); return m ? `${CUR[m[1]] || m[1]} / ${CUR[m[2]] || m[2]}` : id; };
const isRub = (id) => /^(USD|EUR|CNY)(RUB|$)/.test(id) || ['USD', 'EUR', 'CNY'].includes(id);
const sec = $('fx');
const cards = $('fxCards');

if (sec && cards) {
  const css = document.createElement('style');
  css.textContent = '.fxd .row2{display:flex;justify-content:space-between;gap:10px;align-items:baseline}.fxd li{margin:6px 0}.fxc{cursor:pointer}.tp{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;margin:6px 0;border-radius:16px;background:var(--kpi);cursor:pointer}.tp small{color:var(--mut);display:block}.tp .r{text-align:right;white-space:nowrap}';
  document.head.appendChild(css);

  const top = document.createElement('div');
  top.className = 'card glass'; top.id = 'fxTop';
  top.innerHTML = '<h2>Топ валютных пар на Мосбирже</h2><p class="hint">Самые торгуемые инструменты валютного рынка за сегодня. Нажмите на пару, чтобы увидеть причины движения, индикаторы и новости.</p><div id="fxTopList"><p class="hint">Загружаю…</p></div><button id="fxTopRef" class="btn sm ghost">Обновить список</button>';
  cards.after(top);

  const sheet = document.createElement('div');
  sheet.className = 'sheet'; sheet.id = 'fxSheet'; sheet.hidden = true;
  document.body.appendChild(sheet);

  const loadTop = async () => {
    const box = $('fxTopList');
    try {
      const r = await fetch(`${ISS}/engines/currency/markets/selt/boards/CETS/securities.json?iss.meta=off&iss.only=marketdata&marketdata.columns=SECID,LAST,LASTCHANGEPRC,VALTODAY`);
      if (!r.ok) throw new Error('MOEX ' + r.status);
      const js = await r.json(), cols = js.marketdata.columns, ix = (n) => cols.indexOf(n);
      const rows = js.marketdata.data.map((d) => ({ id: d[ix('SECID')], last: d[ix('LAST')], chg: d[ix('LASTCHANGEPRC')], vol: d[ix('VALTODAY')] }))
        .filter((x) => /_TOM$/.test(x.id) && x.vol > 0 && x.last).sort((a, b) => b.vol - a.vol).slice(0, 10);
      if (!rows.length) throw new Error('торги по парам сейчас не идут');
      box.innerHTML = rows.map((x) => `<div class="tp" data-pair="${esc(x.id)}"><div><b>${esc(title(x.id))}</b><small>${esc(x.id)} · оборот ${new Intl.NumberFormat('ru-RU', { notation: 'compact' }).format(x.vol)} ₽</small></div><div class="r"><b>${x.last}</b><small class="${x.chg >= 0 ? 'good' : 'bad'}">${x.chg >= 0 ? '+' : ''}${(+x.chg).toFixed(2)}%</small></div></div>`).join('');
    } catch (e) { box.innerHTML = `<p class="hint">Список пар не загрузился: ${esc(e.message)}. Валюты USD, EUR и CNY выше работают отдельно.</p>`; }
  };

  const candlesFor = async (code) => {
    if (['USD', 'EUR', 'CNY'].includes(code)) return (await loadFx(code, '1d')).candles;
    const from = new Date(Date.now() - 420 * 864e5).toISOString().slice(0, 10);
    for (const base of ['currency/markets/selt/boards/CETS', 'futures/markets/forts']) {
      try {
        const r = await fetch(`${ISS}/engines/${base}/securities/${encodeURIComponent(code)}/candles.json?iss.meta=off&interval=24&from=${from}`);
        const js = await r.json(), col = js.candles.columns, ix = (n) => col.indexOf(n);
        const cs = js.candles.data.map((d) => ({ t: Math.floor(Date.parse(d[ix('begin')].replace(' ', 'T') + '+03:00') / 1000), o: d[ix('open')], h: d[ix('high')], l: d[ix('low')], c: d[ix('close')], v: d[ix('volume')] }));
        if (cs.length > 60) return cs;
      } catch { /* next */ }
    }
    throw new Error('нет данных по ' + code);
  };

  const spark = (cs, days) => {
    const c = cs.slice(-Math.max(days, 10)).map((x) => x.c), lo = Math.min(...c), hi = Math.max(...c), n = c.length - 1;
    const X = (i) => (600 * i) / n, Y = (p) => 112 - (104 * (p - lo)) / (hi - lo || 1);
    return `<svg viewBox="0 0 600 120" preserveAspectRatio="none" style="width:100%;height:150px;background:var(--kpi);border-radius:16px"><path d="${c.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p).toFixed(1)}`).join('')}" fill="none" stroke="var(--line)" stroke-width="2.5"/></svg>`;
  };

  const MACRO = ['Ключевая ставка Банка России 14%: высокая ставка поддерживает спрос на рублёвые активы.', 'Нефть Brent около 90 долларов за баррель: экспортная выручка поддерживает рубль.', 'Минфин покупает валюту по бюджетному правилу, это сдерживает укрепление рубля.', 'До 30 ноября экспортёры продают валюту для налогов, потом растёт спрос импортёров.'];

  const open = async (code, name) => {
    sheet.hidden = false;
    sheet.innerHTML = `<div class="panel fxd" style="max-width:760px"><div class="sh-head"><h2>${esc(name)}</h2><button class="mini" id="fxdX">Закрыть</button></div><p class="hint">Загружаю историю…</p></div>`;
    $('fxdX').onclick = () => { sheet.hidden = true; };
    let cs;
    try { cs = await candlesFor(code); } catch (e) { sheet.querySelector('.hint').textContent = 'Нет данных: ' + e.message; return; }
    const draw = (days) => {
      const a = analyze(cs, days);
      if (!a) { sheet.querySelector('.panel').innerHTML += '<p class="bad">Слишком короткая история для анализа.</p>'; return; }
      const q = encodeURIComponent('курс ' + name.toLowerCase());
      sheet.innerHTML = `<div class="panel fxd" style="max-width:760px"><div class="sh-head"><div><h2>${esc(name)} <small>${esc(code)}</small></h2><div class="row2"><b style="font:600 26px var(--head)">${a.px.toFixed(a.px > 20 ? 2 : 4)}</b><span class="${a.chg >= 0 ? 'good' : 'bad'}">${a.chg >= 0 ? '+' : ''}${a.chg.toFixed(2)}% за срок</span></div></div><button class="mini" id="fxdX">Закрыть</button></div>
      <div class="seg">${HORIZONS.map((h) => `<button data-d="${h.d}" class="${h.d === days ? 'on' : ''}">${h.n}</button>`).join('')}</div>
      ${spark(cs, days)}
      <h3>Почему так</h3><ul>${a.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <h3>Признаки и индикаторы</h3><div class="kpis"><div class="k"><small>RSI (14)</small><b>${a.rsi == null ? '—' : a.rsi.toFixed(0)}</b></div><div class="k"><small>Тренд (EMA 20 и 50)</small><b class="${a.trendUp ? 'good' : 'bad'}">${a.trendUp ? 'вверх' : 'вниз'}</b></div><div class="k"><small>MACD</small><b class="${a.macdUp ? 'good' : 'bad'}">${a.macdUp ? 'вверх' : 'вниз'}</b></div><div class="k"><small>Откл. от среднего за год</small><b>${a.z.toFixed(1)} σ</b></div><div class="k"><small>Дневной размах (ATR)</small><b>${a.atr == null ? '—' : a.atr.toFixed(2) + '%'}</b></div></div>
      <p class="hint">Индикаторы считаются по дневным ценам закрытия. Это статистика прошлого, а не прогноз.</p>
      ${isRub(code) ? `<h3>Что влияет на рубль</h3><ul>${MACRO.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><p class="hint">По публикациям на 22.11.2026, обновляется вручную.</p>` : ''}
      <h3>Последние новости</h3><ul class="fxl"><li><a target="_blank" rel="noopener" href="https://news.google.com/search?q=${q}&hl=ru">Новости по запросу «курс ${esc(name.toLowerCase())}»</a></li><li><a target="_blank" rel="noopener" href="https://www.cbr.ru/currency_base/daily/">Официальные курсы Банка России</a></li><li><a target="_blank" rel="noopener" href="https://www.finmarket.ru/currency/analytics/">Аналитика, Финмаркет</a></li></ul>
      <p class="hint">Автоматическая лента новостей из браузера невозможна: источники блокируют запросы. Ссылки открывают актуальную подборку.</p>
      <div class="note">Это не инвестиционная рекомендация. Валютный рынок рискован, решения и убытки остаются на вас.</div></div>`;
      $('fxdX').onclick = () => { sheet.hidden = true; };
      sheet.querySelectorAll('.seg button').forEach((b) => { b.onclick = () => draw(+b.dataset.d); });
    };
    draw(21);
  };

  const byName = Object.fromEntries(Object.entries(NAMES).map(([k, v]) => [v, k]));
  cards.addEventListener('click', (e) => {
    if (e.target.closest('a,button')) return;
    const card = e.target.closest('.fxc');
    if (!card) return;
    const label = card.querySelector('h2')?.textContent.trim();
    const code = byName[label] || label;
    if (code) open(code, label);
  });
  top.addEventListener('click', (e) => {
    const t = e.target.closest('[data-pair]');
    if (t) open(t.dataset.pair, title(t.dataset.pair));
  });
  $('fxTopRef').onclick = loadTop;
  loadTop();
  setInterval(() => { if (sec.classList.contains('on')) loadTop(); }, 60000);
}
