import './fxref.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ISS = 'https://iss.moex.com/iss/index.json?iss.meta=off';
const fmt = (d) => (d ? new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');

async function ping(url, ms = 7000, json = true) {
  const c = new AbortController(), t0 = performance.now(), tm = setTimeout(() => c.abort(), ms);
  const el = () => Math.round(performance.now() - t0);
  try {
    const r = await fetch(url, { signal: c.signal, cache: 'no-store' });
    if (!r.ok) return { ok: false, status: r.status, ms: el(), err: r.status === 401 || r.status === 403 ? `доступ закрыт (ошибка ${r.status})` : `сервер ответил ошибкой ${r.status}` };
    let body;
    try { body = json ? await r.json() : await r.text(); } catch { return { ok: false, ms: el(), err: 'ответил, но не данными нужного вида', format: true }; }
    return { ok: true, status: r.status, ms: el(), body };
  } catch (e) {
    return { ok: false, ms: el(), err: e.name === 'AbortError' ? `нет ответа за ${ms / 1000} с` : 'соединение не удалось (блокировка, VPN или нет сети)' };
  } finally { clearTimeout(tm); }
}

const TESTS = [
  ['Мосбиржа напрямую (акции, облигации, фьючерсы)', () => ping(ISS), () => 'открывается'],
  ['Мосбиржа через бесплатный прокси (запасной путь)', () => ping('https://api.allorigins.win/raw?url=' + encodeURIComponent(ISS), 9000), () => 'открывается'],
  ['Курсы ЦБ: зеркало cbr-xml-daily.ru', () => ping('https://www.cbr-xml-daily.ru/daily_json.js'), (b) => { const age = (Date.now() - Date.parse(b.Date)) / 864e5; return `курс от ${fmt(b.Date)}${age > 4 ? ' (устарел, зеркало не обновляется)' : ''}`; }],
  ['Копия валют в приложении (data/fx.json)', () => ping('data/fx.json'), (b) => { const k = Object.keys(b).filter((x) => b[x] && b[x].candles); const u = b.USD && b.USD.candles; const last = u && u[u.length - 1]; return `обновлено ${fmt(b.updated)}; ${k.join(', ')}${last ? `; USD ${last[4].toFixed(2)} от ${new Date((last[0] + 10800) * 1000).toLocaleDateString('ru-RU')}` : ''}`; }],
  ['Google Таблица (резерв курсов)', async () => {
    const c = await fetch('config/sheets.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
    if (!c || !c.url) return { ok: false, ms: 0, err: 'адрес таблицы не указан в config/sheets.json' };
    const r = await ping(c.url + '?a=pub', 12000);
    if (r.format) r.err = 'таблица отвечает старой версией скрипта: в Apps Script сделайте «Развернуть → Управление → Новая версия»';
    return r;
  }, (b) => (b.updated ? `курсы обновлены ${fmt(b.updated)}` : 'таблица отвечает, но лист «Курсы» пуст: запустите installDaily')],
  ['Мировые пары (ЕЦБ)', () => ping('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD'), (b) => `EUR/USD ${b.rates && b.rates.USD} от ${b.date}`],
  ['Криптобиржа OKX', () => ping('https://www.okx.com/api/v5/public/time'), () => 'открывается'],
];

async function run(box) {
  box.innerHTML = '<p class="hint">Проверяю источники с вашего устройства…</p>';
  const rows = await Promise.all(TESTS.map(async ([name, fn, ok]) => {
    const r = await fn();
    let text;
    if (r.ok) { try { text = ok(r.body); } catch { text = 'ответ получен'; } } else text = r.err || `ошибка ${r.status}`;
    return { name, ok: r.ok, ms: r.ms, text };
  }));
  const net = navigator.connection ? `${navigator.connection.effectiveType || ''} ${navigator.onLine ? '' : 'офлайн'}`.trim() : '';
  const report = `Проверка источников ${fmt(Date.now())}${net ? ', сеть ' + net : ''}\n` + rows.map((r) => `${r.ok ? 'OK ' : 'НЕТ'} ${r.name}: ${r.text} (${r.ms} мс)`).join('\n');
  box.innerHTML = `<table>${rows.map((r) => `<tr><td><i class="dot ${r.ok ? 'green' : 'red'}"></i> ${esc(r.name)}</td><td>${esc(r.text)}</td><td>${r.ms} мс</td></tr>`).join('')}</table>
  <p class="hint">Красная строка значит, что с вашего подключения этот источник сейчас недоступен. Если красные Мосбиржа напрямую и через прокси, акции и облигации с вашего устройства не загрузятся: отключите VPN или смените сеть (Wi-Fi или мобильный интернет).</p>
  <div class="row"><button class="btn sm ghost" id="diagCopy">Скопировать отчёт</button><button class="btn sm ghost" id="diagAgain">Проверить ещё раз</button></div>`;
  $('diagCopy').onclick = async () => { try { await navigator.clipboard.writeText(report); $('diagCopy').textContent = 'Скопировано'; } catch { $('diagCopy').textContent = 'Не удалось скопировать'; } };
  $('diagAgain').onclick = () => run(box);
}

function mount() {
  const w = $('cfgData');
  if (!w || $('diagBox')) return;
  const b = document.createElement('div');
  b.id = 'diagBox';
  b.innerHTML = '<h3>Проверка источников</h3><p class="hint">Показывает, какие источники данных открываются с вашего телефона или компьютера прямо сейчас.</p><button class="btn sm" id="diagGo">Проверить источники</button><div id="diagRes"></div>';
  w.appendChild(b);
  $('diagGo').onclick = () => run($('diagRes'));
}
new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
mount();
