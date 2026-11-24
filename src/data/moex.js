import { getJson, net } from './net.js';

const ISS = 'https://iss.moex.com/iss';
const IV = { '10m': 10, '1h': 60, '1d': 24, '1w': 7, '1M': 31 };
const DAYS = { '10m': 5, '1h': 30, '1d': 420, '1w': 1900, '1M': 3650 };

const table = (js, t) => (js[t] ? js[t].data.map((r) => Object.fromEntries(js[t].columns.map((c, i) => [c, r[i]]))) : []);
const get = (u) => getJson(u, { validate: (j) => j && typeof j === 'object' });
const ts = (s) => Math.floor(Date.parse(s.replace(' ', 'T') + '+03:00') / 1000);

const snaps = {};
const snapshot = async (name) => {
  if (snaps[name] === undefined) snaps[name] = await fetch(`data/${name}.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return snaps[name];
};
const unpack = (a) => a.map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
export const usedSnapshot = { on: false };
export { net };

export async function stocks(levels = [1, 2]) {
  try {
    const js = await get(`${ISS}/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=securities,marketdata`);
    const md = Object.fromEntries(table(js, 'marketdata').map((x) => [x.SECID, x]));
    const out = table(js, 'securities').filter((s) => s.LISTLEVEL != null && levels.includes(s.LISTLEVEL))
      .map((s) => { const m = md[s.SECID] || {}; return { id: s.SECID, name: s.SHORTNAME || s.SECID, board: 'TQBR', level: s.LISTLEVEL, price: m.LAST || s.PREVPRICE, vol: m.VALTODAY || 0, chg24: m.LASTCHANGEPRC ?? 0 }; })
      .sort((a, b) => b.vol - a.vol);
    if (out.length) return out;
  } catch { /* snapshot below */ }
  const sn = await snapshot('stocks');
  if (sn && sn.list && sn.list.length) { usedSnapshot.on = true; return sn.list.filter((s) => s.level == null || levels.includes(s.level)); }
  throw new Error('Мосбиржа недоступна с вашего подключения, а сохранённой копии нет. Попробуйте другой интернет (Wi-Fi или мобильный) или VPN.');
}

export async function funds() {
  const out = [], seen = new Set();
  for (const board of ['TQTF', 'TQIF']) {
    try {
      for (let start = 0; start < 3000;) {
        const js = await get(`${ISS}/engines/stock/markets/shares/boards/${board}/securities.json?iss.meta=off&iss.only=securities,marketdata&start=${start}`);
        const sec = table(js, 'securities');
        if (!sec.length) break;
        const md = Object.fromEntries(table(js, 'marketdata').map((x) => [x.SECID, x]));
        let fresh = 0;
        for (const s of sec) {
          if (seen.has(s.SECID)) continue;
          seen.add(s.SECID); fresh++;
          const m = md[s.SECID] || {};
          out.push({ id: s.SECID, name: s.SHORTNAME || s.SECID, board, level: null, price: m.LAST || s.PREVPRICE, vol: m.VALTODAY || 0, chg24: m.LASTCHANGEPRC ?? 0 });
        }
        if (!fresh) break;
        start += sec.length;
      }
    } catch { /* board unavailable */ }
  }
  return out.filter((x) => x.price > 0).sort((a, b) => b.vol - a.vol);
}

async function rows(base, id, tf) {
  const from = new Date(Date.now() - DAYS[tf] * 864e5).toISOString().slice(0, 10);
  const js = await get(`${ISS}/engines/${base}/securities/${id}/candles.json?iss.meta=off&interval=${IV[tf]}&from=${from}`);
  return table(js, 'candles').map((r) => ({ t: ts(r.begin), o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume }));
}

export async function candles(id, tf, kind = 'shares/boards/TQBR') {
  const base = kind === 'index' ? 'index/boards/SNDX' : kind;
  try {
    return await rows('stock/markets/' + base, id, tf);
  } catch (e) {
    if (tf === '1d') {
      const sn = await snapshot('stocks');
      const a = sn && sn.candles && sn.candles[id];
      if (a && a.length) { usedSnapshot.on = true; return unpack(a); }
    }
    throw e;
  }
}

export const benchmark = (tf = '1d') => candles('IMOEX', tf, 'index');

const FX = {
  USD: [['USDRUBF', 'futures/markets/forts'], ['USDRUB_TOM', 'currency/markets/selt/boards/CETS']],
  EUR: [['EURRUBF', 'futures/markets/forts'], ['EURRUB_TOM', 'currency/markets/selt/boards/CETS']],
  CNY: [['CNYRUBF', 'futures/markets/forts'], ['CNYRUB_TOM', 'currency/markets/selt/boards/CETS']],
};

const CBR = 'https://www.cbr-xml-daily.ru';
async function cbrSeries() {
  try {
    const c = JSON.parse(localStorage.getItem('cbr_fx_v1'));
    if (c && Date.now() - c.t < 6 * 3600e3) return c;
  } catch { /* no cache */ }
  const urls = [`${CBR}/daily_json.js`];
  const d = new Date();
  for (let i = 0; i < 160; i++) {
    const x = new Date(d.getTime() - i * 864e5);
    if (x.getUTCDay() === 0 || x.getUTCDay() === 6) continue;
    urls.push(`${CBR}/archive/${x.getUTCFullYear()}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${String(x.getUTCDate()).padStart(2, '0')}/daily_json.js`);
  }
  const out = { USD: new Map(), EUR: new Map(), CNY: new Map() };
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const u = urls[i++];
      try {
        const r = await fetch(u); if (!r.ok) continue;
        const j = await r.json(), t = Math.floor(Date.parse(j.Date) / 1000);
        for (const k of Object.keys(out)) { const v = j.Valute && j.Valute[k]; if (v) out[k].set(t, v.Value / v.Nominal); }
      } catch { /* skip day */ }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  const res = { t: Date.now() };
  for (const k of Object.keys(out)) res[k] = [...out[k].entries()].sort((a, b) => a[0] - b[0]);
  if (res.USD.length < 30) throw new Error('курсы ЦБ недоступны');
  try { localStorage.setItem('cbr_fx_v1', JSON.stringify(res)); } catch { /* quota */ }
  return res;
}

export async function fx(code, tf = '1d') {
  let err = null;
  for (const [id, base] of FX[code]) {
    try {
      const c = await rows(base, id, tf);
      if (c.length > 30) return { candles: c, source: id + (net.via !== 'напрямую' ? ', ' + net.via : '') };
    } catch (e) { err = e; }
  }
  const sn = tf === '1d' ? await snapshot('fx') : null;
  if (sn && sn[code] && sn[code].candles.length > 30) {
    usedSnapshot.on = true;
    return { candles: unpack(sn[code].candles), source: sn[code].source + ', снимок от ' + new Date(sn.updated).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) };
  }
  if (tf === '1d') {
    try {
      const s = await cbrSeries();
      const a = s[code];
      if (a && a.length > 30) { usedSnapshot.on = true; return { candles: a.map(([t, v]) => ({ t, o: v, h: v, l: v, c: v, v: 0 })), source: 'официальный курс ЦБ РФ, только закрытие за ' + a.length + ' дн. (Мосбиржа недоступна с вашего подключения)' }; }
    } catch (e) { err = err || e; }
  }
  throw err || new Error('нет данных ' + code);
}
