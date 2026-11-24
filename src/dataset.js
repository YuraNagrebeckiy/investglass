const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = (d) => (d ? new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const day = (d) => (d ? new Date(d).toLocaleDateString('ru-RU') : '—');
const j = (u) => fetch(u, { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
let cache = null;

async function load() {
  if (cache && Date.now() - cache.t < 60000) return cache.v;
  const [st, rates, fees, dep, funds, bonds] = await Promise.all(['data/status.json', 'config/rates.json', 'config/fees.json', 'config/deposits.json', 'config/funds.json', 'data/bonds.json'].map(j));
  cache = { t: Date.now(), v: { st, rates, fees, dep, funds, bonds } };
  return cache.v;
}

function stepState(st, name) {
  const l = ((st && st.log) || []).find((x) => x.includes(name));
  if (!l) return { ok: null, text: 'нет данных' };
  return l.startsWith('ok') ? { ok: true, text: 'обновлено' } : { ok: false, text: 'не удалось: ' + l.split(': ').slice(1).join(': ') };
}

async function fill(box) {
  const { st, rates, fees, dep, funds, bonds } = await load();
  const s = (n) => stepState(st, n);
  const rows = [
    ['Ключевая ставка ЦБ', 'автоматически, GitHub', rates ? `${rates.keyRate.value}% на ${day(rates.keyRate.asOf)}` : '—', s('cbr-key-rate')],
    ['Ставки OKX: займ USDT и funding', 'автоматически, GitHub', fees ? day(fees.updated) : '—', s('okx')],
    ['Копия базы облигаций', 'автоматически, GitHub', bonds ? when(bonds.updated) : '—', s('moex-bonds')],
    ['Копия валютных рядов', 'автоматически, GitHub', s('moex-fx').ok ? when(st.updated) : 'дата неизвестна', s('moex-fx')],
    ['Копия акций MOEX', 'автоматически, GitHub', s('moex-stocks').ok ? when(st.updated) : 'дата неизвестна', s('moex-stocks')],
    ['Вклады банков', 'вручную по сайтам банков', dep ? day(dep.asOf) : '—', { ok: null, text: 'нужна ручная проверка' }],
    ['Средняя макс. ставка вкладов ЦБ', 'вручную', rates && rates.depositAvgMax ? day(rates.depositAvgMax.asOf) : '—', { ok: null, text: 'нужна ручная проверка' }],
    ['Фонды денежного рынка и РУСФАР', 'вручную по обзорам', funds ? day(funds.asOf) : '—', { ok: null, text: 'нужна ручная проверка' }],
    ['Тарифы брокеров и бирж', 'вручную, со страниц тарифов', 'без даты', { ok: null, text: 'сверяйте с договором' }],
  ];
  const dot = (o) => `<i class="dot ${o === true ? 'green' : o === false ? 'red' : 'yellow'}"></i>`;
  const blocked = st && st.log && st.log.some((x) => /FAIL moex/.test(x));
  box.innerHTML = `<table><tr><th>Данные</th><th>Как обновляются</th><th>Последние</th><th>Состояние</th></tr>${rows.map(([n, how, last, o]) => `<tr><td>${esc(n)}</td><td>${esc(how)}</td><td>${esc(last)}</td><td>${dot(o.ok)} ${esc(o.text)}</td></tr>`).join('')}</table>
  <p class="hint">Последний запуск автообновления на GitHub: ${esc(when(st && st.updated))}. Он стартует примерно каждые 3 часа, но GitHub запускает расписание неточно, интервалы бывают длиннее.${blocked ? ' С серверов GitHub Мосбиржа сейчас не открывается, поэтому копии бумаг, валют и акций не обновились. Приложение при загрузке берёт цены напрямую с Мосбиржи из вашего браузера, а копия служит запасным вариантом.' : ''}</p>
  <div class="row"><button class="btn sm ghost" id="cfgReload">Перезагрузить данные</button></div>
  <details><summary>Подробнее о ставках и тарифах</summary><div id="cfgInfoCopy"></div></details>`;
  const src = $('infoBox');
  if (src) $('cfgInfoCopy').innerHTML = src.innerHTML;
  $('cfgReload').onclick = () => { cache = null; location.reload(); };
}

function mount() {
  const sh = $('cfgSheet');
  if (!sh || sh.hidden || $('cfgData')) return;
  const note = sh.querySelector('.note');
  if (!note) return;
  const wrap = document.createElement('div');
  wrap.id = 'cfgData';
  wrap.innerHTML = '<h3>Данные и источники</h3><div id="cfgDataBox"><p class="hint">Проверяю…</p></div>';
  note.before(wrap);
  fill($('cfgDataBox')).catch(() => { $('cfgDataBox').innerHTML = '<p class="hint">Не удалось получить сведения об обновлении.</p>'; });
}
new MutationObserver(mount).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
