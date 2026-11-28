const unpack = (a) => a.map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
let cfgP = null, pubP = null, pubT = 0, stP = null, stT = 0;
const cfg = () => (cfgP ||= fetch('config/sheets.json', { cache: 'no-store' }).then((r) => r.json()).then((c) => (c && c.url ? c : null)).catch(() => null));

async function tf(url, o, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...o, signal: c.signal }); } finally { clearTimeout(t); }
}
const readLocal = () => { try { return JSON.parse(localStorage.getItem('fxcloud_v1')); } catch { return null; } };
async function getPub(url) {
  const r = await tf(`${url}?a=pub`, { redirect: 'follow' }, 7000);
  const j = await r.json();
  if (!j || !j.ok) throw new Error('таблица ответила ошибкой');
  try { localStorage.setItem('fxcloud_v1', JSON.stringify({ t: Date.now(), j })); } catch { /* quota */ }
  return j;
}

function pub() {
  if (pubP && Date.now() - pubT < 20000) return pubP;
  pubT = Date.now();
  pubP = (async () => {
    const c = await cfg();
    if (!c) throw new Error('Google Таблица не подключена');
    let j = null, err = null;
    try { j = await getPub(c.url); } catch (e) { err = e; const l = readLocal(); if (l && l.j) j = l.j; }
    const stale = !j || !j.updated || Date.now() - Date.parse(j.updated) > 30 * 3600e3;
    if (stale && !err) {
      try { await tf(c.url, { method: 'POST', body: JSON.stringify({ a: 'pubrefresh' }), redirect: 'follow' }, 30000); j = await getPub(c.url); } catch (e) { err = err || e; }
    }
    if (!j) throw err || new Error('нет ответа таблицы');
    return j;
  })();
  pubP.catch(() => { pubP = null; });
  return pubP;
}

export async function sheetFx(code) {
  const j = await pub(), x = j.data && j.data[code];
  if (!x || !x.candles || x.candles.length < 60) throw new Error('в таблице пока нет курсов ' + code);
  const when = new Date(x.updated || j.updated).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  return { candles: unpack(x.candles), source: `Google Таблица (${x.source}), данные от ${when}` };
}

// Копия акций MOEX в таблице: список и свечи ('SBER|1d', 'SBER|1h', 'IMOEX|1d').
export function sheetStocks() {
  if (stP && Date.now() - stT < 120000) return stP;
  stT = Date.now();
  stP = (async () => {
    const c = await cfg();
    if (!c) throw new Error('Google Таблица не подключена');
    const r = await tf(`${c.url}?a=pub&k=stocks`, { redirect: 'follow' }, 20000);
    let j;
    try { j = await r.json(); } catch { throw new Error('таблица отвечает старой версией скрипта'); }
    if (!j || !j.ok || !j.list || j.list.length < 5) throw new Error('в таблице пока нет копии акций: её отправит устройство, где открывается Мосбиржа');
    return j;
  })();
  stP.catch(() => { stP = null; });
  return stP;
}

export async function putStocks(body) {
  const c = await cfg();
  if (!c) throw new Error('Google Таблица не подключена');
  const r = await tf(c.url, { method: 'POST', body: JSON.stringify({ a: 'stocksput', ...body }), redirect: 'follow' }, 90000);
  const j = await r.json();
  if (!j.ok) throw new Error({ auth: 'неверное имя или пароль облака', sanity: 'цены не прошли проверку', bad: 'неверные данные' }[j.err] || j.err || 'ошибка таблицы');
  stP = null;
  return j;
}
