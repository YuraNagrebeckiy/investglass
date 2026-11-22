const API = 'https://www.okx.com/api/v5';
const BAR = { '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W', '1M': '1M' };
const STABLE = /^(USDC|DAI|TUSD|FDUSD|USDE|USD1|PYUSD|USDG|EURC|USDT)-/;

const get = async (p) => {
  const r = await fetch(API + p);
  if (!r.ok) throw new Error('OKX ' + r.status);
  const j = await r.json();
  if (j.code !== '0') throw new Error('OKX ' + j.msg);
  return j.data;
};

const row = (r) => ({ t: Math.floor(+r[0] / 1000), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] });

export async function topUsdt(n = 100) {
  const rows = await get('/market/tickers?instType=SPOT');
  return rows.filter((x) => x.instId.endsWith('-USDT') && !STABLE.test(x.instId))
    .map((x) => ({ id: x.instId, name: x.instId.replace('-USDT', ''), price: +x.last, vol: +x.volCcy24h, chg24: (+x.last / +x.open24h - 1) * 100 }))
    .sort((a, b) => b.vol - a.vol).slice(0, n);
}

export async function candles(id, tf, limit = 300) {
  const rows = await get(`/market/candles?instId=${id}&bar=${BAR[tf]}&limit=${limit}`);
  return rows.reverse().map(row);
}

export function liveMulti(id, tfs, onCandle) {
  const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/business');
  const byChannel = Object.fromEntries(tfs.map((tf) => ['candle' + BAR[tf], tf]));
  ws.onopen = () => ws.send(JSON.stringify({ op: 'subscribe', args: tfs.map((tf) => ({ channel: 'candle' + BAR[tf], instId: id })) }));
  ws.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data);
      if (m.data && m.data[0] && m.arg) onCandle(byChannel[m.arg.channel], row(m.data[0]));
    } catch { /* ignore */ }
  };
  return () => ws.close();
}

export const live = (id, tf, cb) => liveMulti(id, [tf], (_, c) => cb(c));
