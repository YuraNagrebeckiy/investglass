import { fx as loadFx, candles as stockCandles } from './data/moex.js';
import { valuation, message, NAMES } from './engine/fx.js';
import { corr, returnsByDay } from './engine/corr.js';
import { beep } from './ui.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const CODES = ['USD', 'EUR', 'CNY'];
const COLOR = { red: '#dc2626', green: '#16a34a', yellow: '#d97706', gray: '#64748b' };
const STOCKS = ['SBER', 'GAZP', 'LKOH', 'ROSN', 'NVTK', 'TATN', 'GMKN', 'PLZL', 'CHMF', 'NLMK', 'PHOR', 'MGNT', 'AFLT', 'MTSS', 'T', 'MOEX', 'YDEX'];
const S = { custom: store('ig_fxcustom', []), res: {}, t0: {}, prev: store('ig_fxstate', {}), busy: false, busyAt: 0, timer: null, retry: null };
const all = () => [...CODES, ...S.custom];
const label = (c) => NAMES[c] || c;
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

const css = document.createElement('style');
css.textContent = `.fxb{margin:10px 12px 0;padding:12px 14px;border-radius:16px;color:#fff;font-size:14px;cursor:pointer}.fxb b{display:block;font-size:16px}
.fxc{margin:12px 0}.fxc .top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.fxc .px{font-size:26px;font-weight:700}
.fxt{display:inline-block;padding:3px 10px;border-radius:12px;color:#fff;font-size:13px;margin:6px 0}.fxc svg{width:100%;height:120px;margin:6px 0}
.fxs{width:100%;font-size:13px;border-collapse:collapse}.fxs td,.fxs th{padding:5px 6px;text-align:right}.fxs td:first-child,.fxs th:first-child{text-align:left}
.pos{color:#16a34a}.neg{color:#dc2626}.fxl li{margin:6px 0}.fxld{display:flex;align-items:center;gap:10px}.fxld i{width:16px;height:16px;border-radius:50%;border:2px solid var(--l3);border-top-color:var(--acc);animation:fxspin .9s linear infinite;flex:none}@keyframes fxspin{to{transform:rotate(360deg)}}`;
document.head.appendChild(css);

const nav = $('tabs'), main = document.querySelector('main');
const btn = document.createElement('button');
btn.dataset.tab = 'fx'; btn.textContent = 'Валюты';
nav.insertBefore(btn, nav.children[1] || null);
const sec = document.createElement('section');
sec.id = 'fx'; sec.className = 'tab';
sec.innerHTML = `<div class="card glass"><h2>Валюты</h2>
<p class="hint">Доллар, евро и юань анализируются автоматически. Вывод «переоценён» или «недооценён» показывает, где цена находится относительно собственной истории за год. Это статистика, а не расчёт справедливого курса.</p>
<div class="row"><button id="fxRefresh" class="btn sm">Обновить сейчас</button><label class="chk"><input id="fxAuto" type="checkbox" checked> Обновлять каждые 30 с</label></div>
<p id="fxInfo" class="hint"></p></div>
<div id="fxCards"></div>
<div class="card glass"><h2>Добавить пару</h2><p class="hint">Введите тикер с Московской биржи, например валютный вечный фьючерс или спот-пару. Приложение проверит срочный рынок и валютный рынок MOEX.</p>
<div class="row"><input id="fxCode" placeholder="Например CNYRUB_TOM" style="max-width:220px"><button id="fxAdd" class="btn sm">Добавить</button></div></div>
<div class="card glass"><h2>От чего зависит курс</h2>
<div class="note">Контекст на 22.11.2026 по публикациям РБК, Финам, Интерфакса и Газпромбанка. Это не прогноз и не рекомендация.</div>
<ul class="fxl">
<li>Ключевая ставка Банка России 14%. Высокая рублёвая ставка поддерживает спрос на рублёвые активы.</li>
<li>Нефть Brent держится около 90 долларов за баррель. Экспортная выручка по высоким ценам сентября и октября ещё поступает на рынок.</li>
<li>Минфин покупает валюту и золото по бюджетному правилу, в ноябре около 15,6 млрд рублей в день. Это сдерживает укрепление рубля.</li>
<li>До 30 ноября экспортёры продают валюту для налогового платежа, это поддерживает рубль. В ноябре и декабре растёт спрос импортёров на валюту.</li>
<li>Аналитики Газпромбанка называли ориентиры: юань у нижней границы 12–12,5 рубля, доллар в районе 80 рублей. Эти оценки могут измениться.</li>
</ul>
<h3>Кто выигрывает при слабом рубле</h3>
<p class="hint">Общее правило. Рост доллара и юаня обычно выгоден компаниям с валютной выручкой и рублёвыми расходами: нефтегазу (ЛУКОЙЛ, Роснефть, НОВАТЭК, Татнефть), металлургам и золотодобытчикам (Норникель, Северсталь, НЛМК, Полюс), производителям удобрений (ФосАгро). Укрепление рубля давит на их рублёвую прибыль. Импортёрам, авиакомпаниям и компаниям с валютным долгом слабый рубль вредит.</p>
<h3>Как связаны валюты</h3>
<p class="hint">Евро следует за курсом EUR/USD на мировом рынке, ставками ЕЦБ и ФРС. Юань связан с торговлей с Китаем и политикой Народного банка Китая. В последние месяцы Банк России покупает юани по поручению Минфина.</p>
<button id="fxDepBtn" class="btn sm">Рассчитать связь с акциями (около 20 с)</button>
<div id="fxDeps" class="scroll"></div></div>
<div class="card glass"><h2>Новости по валютам</h2><ul class="fxl">
<li><a target="_blank" rel="noopener" href="https://news.google.com/search?q=%D0%BA%D1%83%D1%80%D1%81%20%D0%B4%D0%BE%D0%BB%D0%BB%D0%B0%D1%80%D0%B0&hl=ru">Новости: курс доллара</a></li>
<li><a target="_blank" rel="noopener" href="https://news.google.com/search?q=%D0%BA%D1%83%D1%80%D1%81%20%D0%B5%D0%B2%D1%80%D0%BE&hl=ru">Новости: курс евро</a></li>
<li><a target="_blank" rel="noopener" href="https://news.google.com/search?q=%D0%BA%D1%83%D1%80%D1%81%20%D1%8E%D0%B0%D0%BD%D1%8F&hl=ru">Новости: курс юаня</a></li>
<li><a target="_blank" rel="noopener" href="https://www.cbr.ru/currency_base/daily/">Официальные курсы Банка России</a></li>
<li><a target="_blank" rel="noopener" href="https://www.finmarket.ru/currency/analytics/">Аналитика по валютам, Финмаркет</a></li>
<li><a target="_blank" rel="noopener" href="https://investfuture.ru/currency">Валюта: новости и прогнозы, InvestFuture</a></li></ul>
<p class="hint">Автоматическая лента новостей появится на следующем этапе.</p></div>`;
main.appendChild(sec);
const ban = document.createElement('div');
ban.id = 'fxBanner'; ban.hidden = true;
main.parentNode.insertBefore(ban, main);

function openTab() {
  document.querySelectorAll('#tabs button,.tab').forEach((e) => e.classList.remove('on'));
  btn.classList.add('on'); sec.classList.add('on'); window.scrollTo({ top: 0, behavior: 'smooth' });
}
btn.onclick = openTab; ban.onclick = openTab;

async function loadCustom(code) {
  const from = new Date(Date.now() - 420 * 864e5).toISOString().slice(0, 10);
  for (const base of ['futures/markets/forts', 'currency/markets/selt/boards/CETS']) {
    try {
      const c = new AbortController(), t = setTimeout(() => c.abort(), 8000);
      const r = await fetch(`https://iss.moex.com/iss/engines/${base}/securities/${encodeURIComponent(code)}/candles.json?iss.meta=off&interval=24&from=${from}`, { signal: c.signal }).finally(() => clearTimeout(t));
      const js = await r.json(), col = js.candles.columns, ix = (n) => col.indexOf(n);
      const cs = js.candles.data.map((d) => ({ t: Math.floor(Date.parse(d[ix('begin')].replace(' ', 'T') + '+03:00') / 1000), o: d[ix('open')], h: d[ix('high')], l: d[ix('low')], c: d[ix('close')], v: d[ix('volume')] }));
      if (cs.length > 30) return { candles: cs, source: code };
    } catch { /* next */ }
  }
  throw new Error('нет данных по ' + code);
}

function chart(cs, v) {
  const c = cs.slice(-250).map((x) => x.c), lo = Math.min(...c), hi = Math.max(...c), n = c.length - 1;
  const X = (i) => (600 * i) / n, Y = (p) => 112 - (104 * (p - lo)) / (hi - lo || 1);
  const m = c.reduce((s, x) => s + x, 0) / c.length, sd = Math.sqrt(c.reduce((s, x) => s + (x - m) ** 2, 0) / c.length);
  const line = (p, col) => `<line x1="0" x2="600" y1="${Y(p).toFixed(1)}" y2="${Y(p).toFixed(1)}" stroke="${col}" stroke-dasharray="4 4" stroke-width="1"/>`;
  const path = c.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 600 120" preserveAspectRatio="none">${line(m + 1.5 * sd, '#dc2626')}${line(m, '#8a99bd')}${line(m - 1.5 * sd, '#16a34a')}<path d="${path}" fill="none" stroke="#4f74f5" stroke-width="2.5"/><circle cx="600" cy="${Y(c[n]).toFixed(1)}" r="4" fill="#4f74f5"/></svg>`;
}

function waitText(code) {
  const sec1 = Math.round((Date.now() - (S.t0[code] || Date.now())) / 1000);
  const n = window.__igNet, pend = n ? [...n.pend.values()].filter((v) => /Мосбиржи|ЦБ|прокси/.test(v.l)).map((v) => v.l) : [];
  const now = pend.length ? `Сейчас: ${[...new Set(pend)].slice(0, 2).join(', ')}.` : '';
  const hint = sec1 > 8 ? ' Мосбиржа отвечает не у всех операторов, поэтому приложение параллельно берёт официальные курсы ЦБ.' : '';
  return `Загружаю… ${sec1} с. ${now}${hint}`;
}

function render() {
  const alerts = [];
  $('fxCards').innerHTML = all().map((code) => {
    const r = S.res[code];
    if (!r) return `<div class="card glass fxc"><div class="fxld"><i></i><h2 style="margin:0">${esc(label(code))}</h2></div><p class="hint" data-ld="${esc(code)}">${esc(waitText(code))}</p></div>`;
    if (r.err) return `<div class="card glass fxc"><h2>${esc(label(code))}</h2><p class="bad">Не удалось загрузить.</p><p class="hint">${esc(r.err)}</p><p class="hint">Так бывает, когда оператор или сеть блокируют Мосбиржу. Попробуйте другой интернет (Wi-Fi или мобильный) или VPN. Приложение будет повторять попытку само.</p><div class="row"><button class="mini" data-retry="1">Повторить сейчас</button>${S.custom.includes(code) ? `<button class="mini" data-rm="${esc(code)}">Убрать</button>` : ''}</div></div>`;
    const { v, m } = r, prev = r.cs[r.cs.length - 2]?.c, chg = prev ? ((v.px / prev - 1) * 100).toFixed(2) : '—';
    if (v.state === 'over' || v.state === 'under') alerts.push(m);
    return `<div class="card glass fxc"><div class="top"><h2>${esc(label(code))}</h2><span class="px">${v.px.toFixed(2)} ₽</span></div>
    <small class="hint">за день ${chg}% · источник ${esc(r.src)}${S.custom.includes(code) ? ` · <a href="#" data-rm="${esc(code)}">убрать</a>` : ''}</small><br>
    <span class="fxt" style="background:${COLOR[m.level]}">${esc(m.title)}</span><p>${esc(m.text)}</p>${chart(r.cs, v)}
    <small class="hint">Пунктир: среднее за год и границы ±1,5σ. Сработало признаков: переоценка ${v.nO} из 4, недооценка ${v.nU} из 4.</small></div>`;
  }).join('');
  ban.hidden = !alerts.length;
  ban.innerHTML = alerts.map((m) => `<div class="fxb" style="background:${COLOR[m.level]}"><b>${esc(m.title)}</b>Подробнее на вкладке «Валюты»</div>`).join('');
}

async function loadOne(code) {
  S.t0[code] = Date.now();
  try {
    const r = await withTimeout(CODES.includes(code) ? loadFx(code, '1d') : loadCustom(code), 45000, 'Источники не ответили за 45 с.');
    const v = valuation(r.candles);
    S.res[code] = v.state === 'nodata' ? { err: `Получено слишком мало данных: ${r.candles.length} дн., нужно не меньше 60.` } : { v, src: r.source, cs: r.candles, m: message(code, v) };
  } catch (e) { S.res[code] = { err: (e && e.message) || 'нет связи' }; }
  render();
}

async function refresh() {
  if (S.busy && Date.now() - S.busyAt < 50000) return;
  S.busy = true; S.busyAt = Date.now(); clearTimeout(S.retry);
  $('fxInfo').textContent = 'Обновляю…';
  for (const c of all()) { if (!S.res[c] || S.res[c].err) { delete S.res[c]; S.t0[c] = Date.now(); } }
  render();
  await Promise.all(all().map(loadOne));
  let up = false, down = false, bad = 0;
  for (const code of all()) {
    const r = S.res[code];
    if (!r || r.err) { bad++; continue; }
    const old = S.prev[code];
    if (old !== undefined && old !== r.v.state) { if (r.v.state === 'over') down = true; if (r.v.state === 'under') up = true; }
    S.prev[code] = r.v.state;
  }
  localStorage.setItem('ig_fxstate', JSON.stringify(S.prev));
  render();
  if (down) { beep(520, 220); setTimeout(() => beep(380, 300), 260); }
  if (up) { beep(380, 220); setTimeout(() => beep(520, 300), 260); }
  $('fxInfo').textContent = (bad ? `Загружено ${all().length - bad} из ${all().length}, повторю через 20 с. ` : '') + 'Обновлено ' + new Date().toLocaleTimeString('ru-RU');
  S.busy = false;
  if (bad) S.retry = setTimeout(refresh, 20000);
}

function schedule() {
  clearInterval(S.timer);
  if ($('fxAuto').checked) S.timer = setInterval(refresh, 30000);
}

setInterval(() => { document.querySelectorAll('[data-ld]').forEach((p) => { p.textContent = waitText(p.dataset.ld); }); }, 1000);

async function deps() {
  const out = $('fxDeps');
  const cur = {};
  for (const k of CODES) if (S.res[k]?.cs) cur[k] = returnsByDay(S.res[k].cs.slice(-130));
  if (!Object.keys(cur).length) { out.textContent = 'Сначала дождитесь загрузки курсов.'; return; }
  const rows = [];
  let i = 0;
  const work = async () => {
    while (i < STOCKS.length) {
      const id = STOCKS[i++];
      try {
        const rt = returnsByDay((await stockCandles(id, '1d')).slice(-130));
        rows.push({ id, c: Object.fromEntries(CODES.map((k) => [k, cur[k] ? corr(cur[k], rt) : null])) });
      } catch { /* skip */ }
      out.textContent = `Загружено ${rows.length} из ${STOCKS.length}`;
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  if (!rows.length) { out.innerHTML = '<p class="bad">Не удалось получить котировки акций.</p>'; return; }
  rows.sort((a, b) => (b.c.USD ?? -9) - (a.c.USD ?? -9));
  const f = (x) => (x == null ? '—' : `<span class="${x >= 0.2 ? 'pos' : x <= -0.2 ? 'neg' : ''}">${x.toFixed(2)}</span>`);
  out.innerHTML = `<table class="fxs"><tr><th>Акция</th>${CODES.map((k) => `<th>${esc(label(k))}</th>`).join('')}</tr>${rows.map((r) => `<tr><td>${esc(r.id)}</td>${CODES.map((k) => `<td>${f(r.c[k])}</td>`).join('')}</tr>`).join('')}</table>
  <p class="hint">Корреляция дневных изменений за последние ≈130 торговых дней: от −1 до +1. Положительное значение означает, что акция в рублях обычно растёт вместе с валютой, отрицательное означает движение в разные стороны. Связь не доказывает причину и меняется со временем.</p>`;
}

$('fxRefresh').onclick = () => { S.busy = false; refresh(); };
$('fxAuto').onchange = schedule;
$('fxDepBtn').onclick = deps;
$('fxAdd').onclick = () => {
  const c = $('fxCode').value.trim().toUpperCase();
  if (c && !all().includes(c)) { S.custom.push(c); localStorage.setItem('ig_fxcustom', JSON.stringify(S.custom)); $('fxCode').value = ''; refresh(); }
};
sec.addEventListener('click', (e) => {
  if (e.target.dataset.retry) { S.busy = false; refresh(); return; }
  const c = e.target.dataset.rm;
  if (c) { e.preventDefault(); S.custom = S.custom.filter((x) => x !== c); delete S.res[c]; delete S.prev[c]; localStorage.setItem('ig_fxcustom', JSON.stringify(S.custom)); render(); }
});
render(); refresh(); schedule();
