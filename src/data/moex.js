const ISS = 'https://iss.moex.com/iss';
const FALLBACK = ['SBER', 'GAZP', 'LKOH', 'ROSN', 'GMKN', 'NVTK', 'YDEX', 'T', 'MOEX', 'PLZL', 'TATN', 'SNGS', 'CHMF', 'NLMK', 'MTSS', 'ALRS', 'MGNT', 'VTBR', 'AFLT', 'PHOR'];
const IV = { '1h': 60, '1d': 24, '1w': 7 };
const DAYS = { '1h': 45, '1d': 420, '1w': 1900 };

const table = (js, t) => js[t].data.map((r) => Object.fromEntries(js[t].columns.map((c, i) => [c, r[i]])));
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error('MOEX ' + r.status); return r.json(); };
const ts = (s) => Math.floor(Date.parse(s.replace(' ', 'T') + '+03:00') / 1000);

export async function stocks() {
  try {
    const js = await get(`${ISS}/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=securities,marketdata`);
    const md = Object.fromEntries(table(js, 'marketdata').map((x) => [x.SECID, x]));
    const out = table(js, 'securities').filter((s) => s.LISTLEVEL != null && s.LISTLEVEL <= 2)
      .map((s) => { const m = md[s.SECID] || {}; return { id: s.SECID, name: s.SHORTNAME || s.SECID, price: m.LAST || s.PREVPRICE, vol: m.VALTODAY || 0, chg24: m.LASTCHANGEPRC ?? 0 }; })
      .sort((a, b) => b.vol - a.vol);
    if (out.length) return out;
  } catch { /* fallback below */ }
  return FALLBACK.map((id) => ({ id, name: id, price: 0, vol: 0, chg24: 0 }));
}

export async function candles(id, tf, kind = 'shares/boards/TQBR') {
  const from = new Date(Date.now() - DAYS[tf] * 864e5).toISOString().slice(0, 10);
  const base = kind === 'index' ? 'index/boards/SNDX' : kind;
  const js = await get(`${ISS}/engines/stock/markets/${base}/securities/${id}/candles.json?iss.meta=off&interval=${IV[tf]}&from=${from}`);
  return table(js, 'candles').map((r) => ({ t: ts(r.begin), o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume }));
}

export const benchmark = (tf = '1d') => candles('IMOEX', tf, 'index');
