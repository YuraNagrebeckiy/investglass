import { getJson, net } from './net.js';
import { sheetFx, sheetStocks } from './cloudfx.js';

const ISS = 'https://iss.moex.com/iss';
const IV = { '10m': 10, '1h': 60, '1d': 24, '1w': 7, '1M': 31 };
const DAYS = { '10m': 5, '1h': 30, '1d': 420, '1w': 1900, '1M': 3650 };

const table = (js, t) => (js[t] ? js[t].data.map((r) => Object.fromEntries(js[t].columns.map((c, i) => [c, r[i]]))) : []);
const get = (u, o) => getJson(u, { validate: (j) => j && typeof j === 'object', ...o });
const ts = (s) => Math.floor(Date.parse(s.replace(' ', 'T') + '+03:00') / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const snaps = {};
const snapshot = async (name) => {
  if (snaps[name] === undefined) snaps[name] = await fetch(`data/${name}.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return snaps[name];
};
const unpack = (a) => a.map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
export const usedSnapshot = { on: false, sheet: false };
export { net };

// Недельные свечи из дневных (неделя с понедельника по московскому времени).
export function weekly(d) {
  const out = [];
  let key = null, cur = null;
  for (const r of d) {
    const k = Math.floor((Math.floor((r[0] + 10800) / 86400) + 3) / 7);
    if (k !== key) { cur = [r[0], r[1], r[2], r[3], r[4], r[5]]; out.push(cur); key = k; } else { cur[2] = Math.max(cur[2], r[2]); cur[3] = Math.min(cur[3], r[3]); cur[4] = r[4]; cur[5] += r[5]; }
  }
  return out;
}

export async function stocks(levels = [1, 2], opt = {}) {
  try {
    const js = await get(`${ISS}/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=securities,marketdata`);
    const md = Object.fromEntries(table(js, 'marketdata').map((x) => [x.SECID, x]));
    const out = table(js, 'securities').filter((s) => s.LISTLEVEL != null && levels.includes(s.LISTLEVEL))
      .map((s) => { const m = md[s.SECID] || {}; return { id: s.SECID, name: s.SHORTNAME || s.SECID, board: 'TQBR', level: s.LISTLEVEL, price: m.LAST || s.PREVPRICE, vol: m.VALTODAY || 0, chg24: m.LASTCHANGEPRC ?? 0 }; })
      .sort((a, b) => b.vol - a.vol);
    if (out.length) return out;
  } catch { /* fallbacks below */ }
  if (opt.live) throw new Error('Мосбиржа недоступна с этого устройства');
  const sn = await snapshot('stocks');
  if (sn && sn.list && sn.list.length) { usedSnapshot.on = true; return sn.list.filter((s) => s.level == null || levels.includes(s.level)); }
  let shErr = null;
  try {
    const sh = await sheetStocks();
    usedSnapshot.on = true; usedSnapshot.sheet = true; usedSnapshot.updated = sh.updated;
    return sh.list.filter((s) => s.level == null || levels.includes(s.level));
  } catch (e) { shErr = e; }
  throw new Error('Мосбиржа недоступна с вашего подключения, а сохранённой копии нет. Копия в Google Таблице: ' + (shErr ? shErr.message : 'пуста') + '. Попробуйте другой интернет (Wi-Fi или мобильный) или VPN.');
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

async function rows(base, id, tf, o) {
  const from = new Date(Date.now() - DAYS[tf] * 864e5).toISOString().slice(0, 10);
  const js = await get(`${ISS}/engines/${base}/securities/${id}/candles.json?iss.meta=off&interval=${IV[tf]}&from=${from}`, o);
  return table(js, 'candles').map((r) => ({ t: ts(r.begin), o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume }));
}

export async function candles(id, tf, kind = 'shares/boards/TQBR', opt = {}) {
  const base = kind === 'index' ? 'index/boards/SNDX' : kind;
  try {
    return await rows('stock/markets/' + base, id, tf);
  } catch (e) {
    if (opt.live) throw e;
    if (tf === '1d') {
      const sn = await snapshot('stocks');
      const a = sn && sn.candles && sn.candles[id];
      if (a && a.length) { usedSnapshot.on = true; return unpack(a); }
    }
    try {
      const sh = await sheetStocks();
      let a = sh.candles[id + '|' + tf];
      if (!a && tf === '1w') { const d = sh.candles[id + '|1d']; if (d) a = weekly(d); }
      if (a && a.length) { usedSnapshot.on = true; usedSnapshot.sheet = true; usedSnapshot.updated = sh.updated; return unpack(a); }
    } catch { /* no sheet copy */ }
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
const ROUTES = [
  (u) => u,
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
];
async function tfetch(u, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(u, { signal: c.signal }); } finally { clearTimeout(t); }
}
const readCbrCache = () => { try { const c = JSON.parse(localStorage.getItem('cbr_fx_v1')); if (c && Date.now() - c.t < 6 * 3600e3 && c.USD && c.USD.length >= 60) return c; } catch { /* none */ } return null; };

async function cbrLoad() {
  let route = null, first = null;
  for (const rt of ROUTES) {
    try { const r = await tfetch(rt(`${CBR}/daily_json.js`), 4000); if (r.ok) { first = await r.json(); route = rt; break; } } catch { /* next route */ }
  }
  if (!route) throw new Error('курсы ЦБ недоступны с вашего подключения');
  const out = { USD: new Map(), EUR: new Map(), CNY: new Map() };
  const add = (j) => { const t = Math.floor(Date.parse(j.Date) / 1000); for (const k of Object.keys(out)) { const v = j.Valute && j.Valute[k]; if (v) out[k].set(t, v.Value / v.Nominal); } };
  add(first);
  const urls = [], d = new Date();
  for (let i = 0; i < 230 && urls.length < 160; i++) {
    const x = new Date(d.getTime() - i * 864e5);
    if (x.getUTCDay() === 0 || x.getUTCDay() === 6) continue;
    urls.push(`${CBR}/archive/${x.getUTCFullYear()}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${String(x.getUTCDate()).padStart(2, '0')}/daily_json.js`);
  }
  const snap = () => { const res = { t: Date.now() }; for (const k of Object.keys(out)) res[k] = [...out[k].entries()].sort((a, b) => a[0] - b[0]); return res; };
  return new Promise((resolve, reject) => {
    let i = 0, resolved = false;
    const early = () => { if (!resolved && out.USD.size >= 70) { resolved = true; resolve(snap()); } };
    const worker = async () => {
      while (i < urls.length) {
        const u = urls[i++];
        try { const r = await tfetch(route(u), 4500); if (r.ok) add(await r.json()); } catch { /* skip day */ }
        early();
      }
    };
    Promise.all(Array.from({ length: route === ROUTES[0] ? 12 : 5 }, worker)).then(() => {
      const res = snap();
      if (res.USD.length >= 60) { try { localStorage.setItem('cbr_fx_v1', JSON.stringify(res)); } catch { /* quota */ } }
      if (!resolved) { resolved = true; if (res.USD.length >= 60) resolve(res); else reject(new Error('курсы ЦБ недоступны')); }
    });
  });
}
let cbrP = null;
function cbrSeries() {
  const c = readCbrCache();
  if (c) return Promise.resolve(c);
  if (!cbrP) cbrP = cbrLoad().finally(() => setTimeout(() => { cbrP = null; }, 20000));
  return cbrP;
}

const fxCache = {};
const saveLast = (code, r) => { try { localStorage.setItem('fxlast_' + code, JSON.stringify({ t: Date.now(), source: r.source, c: r.candles.slice(-300).map((x) => [x.t, x.o, x.h, x.l, x.c, x.v]) })); } catch { /* quota */ } };
const loadLast = (code) => {
  try {
    const o = JSON.parse(localStorage.getItem('fxlast_' + code));
    if (o && o.c && o.c.length > 60) return { candles: unpack(o.c), source: 'последние данные, сохранённые на этом устройстве ' + new Date(o.t).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) + ' (' + o.source + ')' };
  } catch { /* none */ }
  return null;
};

export async function fx(code, tf = '1d') {
  const day = tf === '1d', hit = fxCache[code];
  if (day && hit && Date.now() - hit.t < 45000) return hit.r;
  const moexP = (async () => {
    let err = null;
    for (const [id, base] of FX[code]) {
      try {
        const c = await rows(base, id, tf, day ? { timeout: 4500, proxyMs: 6000 } : undefined);
        if (c.length > 30) { const r = { candles: c, source: id + (net.via !== 'напрямую' ? ', ' + net.via : '') }; if (day) { fxCache[code] = { t: Date.now(), r }; saveLast(code, r); } return r; }
      } catch (e) { err = e; }
    }
    throw err || new Error('нет данных ' + code);
  })();
  if (!day) return moexP;
  moexP.catch(() => {});
  const settle = moexP.then((r) => ({ r }), (e) => ({ e }));
  const first = await Promise.race([settle, sleep(3000).then(() => ({ late: true }))]);
  if (first.r) return first.r;
  const sn = await snapshot('fx');
  if (sn && sn[code] && sn[code].candles.length > 30) {
    usedSnapshot.on = true;
    return { candles: unpack(sn[code].candles), source: sn[code].source + ', снимок от ' + new Date(sn.updated).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) };
  }
  const viaCbr = (async () => {
    const s = await cbrSeries(), a = s[code];
    if (a && a.length > 60) return { candles: a.map(([t, v]) => ({ t, o: v, h: v, l: v, c: v, v: 0 })), source: 'официальный курс ЦБ РФ, только закрытие за ' + a.length + ' дн. (Мосбиржа не ответила)' };
    throw new Error('мало данных');
  })();
  const viaSheet = sheetFx(code);
  viaCbr.catch(() => {}); viaSheet.catch(() => {});
  let res = await Promise.race([viaCbr.catch(() => null), sleep(2500).then(() => null)]), cbrErr = null, shErr = null;
  if (!res) { try { res = await viaSheet; } catch (e) { shErr = e; } }
  if (!res) { const l0 = loadLast(code); if (l0) { usedSnapshot.on = true; return l0; } }
  if (!res) { try { res = await viaCbr; } catch (e) { cbrErr = e; } }
  if (res) { usedSnapshot.on = true; saveLast(code, res); return res; }
  const cm = `ЦБ: ${cbrErr ? cbrErr.message : 'нет ответа'}. Google Таблица: ${shErr ? shErr.message : 'нет ответа'}`;
  if (first.late) {
    const w = await Promise.race([settle, sleep(8000).then(() => ({ e: new Error('не ответила за 8 с дополнительно') }))]);
    if (w.r) return w.r;
  }
  const last = loadLast(code);
  if (last) { usedSnapshot.on = true; return last; }
  throw new Error(`Мосбиржа: ${first.e ? first.e.message : 'не ответила'}. ${cm}`);
}
