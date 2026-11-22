import { ema, rsi, macd, atr, last } from './indicators.js';

export const PRESETS = {
  stocks: { rsiMode: 'trend', emaSet: [20, 50, 200], rsiOver: 70, rsiUnder: 30 },
  crypto: { rsiMode: 'trend', emaSet: [20, 50, 200], rsiOver: 75, rsiUnder: 25 },
};

export const HORIZONS = {
  short: [['5m', 1], ['10m', 1], ['15m', 1], ['30m', 1]],
  mid: [['1h', 1], ['4h', 1.5], ['1d', 2]],
  long: [['1d', 1], ['1w', 1.5], ['1M', 1]],
};

const LIGHT = { green: 1, yellow: 0, red: -1 };
const toLight = (s) => (s >= 0.5 ? 'green' : s <= -0.25 ? 'red' : 'yellow');

export function lights(candles, dir, preset = PRESETS.stocks) {
  const c = candles.map((x) => x.c), h = candles.map((x) => x.h), l = candles.map((x) => x.l);
  const d = dir === 'short' ? -1 : 1;
  const m = macd(c), r = rsi(c), a = atr(h, l, c);
  const [e1, e2, e3] = preset.emaSet.map((n) => ema(c, n));
  const px = last(c), hist = last(m.hist), prev = m.hist[m.hist.length - 2], A = last(a);
  const E1 = last(e1), E2 = last(e2), E3 = Number.isFinite(last(e3)) ? last(e3) : E2;
  const R = last(r), rv = d === 1 ? R : 100 - R;
  let macdL = 'yellow', emaL = 'red', rsiL;
  if (preset.rsiMode === 'reversion') {
    const dm = (hist - prev) * d;
    macdL = dm > 0 ? 'green' : dm < 0 ? 'red' : 'yellow';
    const z = ((px - E2) / A) * -d;
    emaL = z >= 1.5 ? 'green' : z >= 0.5 ? 'yellow' : 'red';
    rsiL = rv <= 35 ? 'green' : rv <= 45 ? 'yellow' : 'red';
  } else {
    if (hist * d < 0) macdL = 'red'; else if (hist * d > 0 && (hist - prev) * d > 0) macdL = 'green';
    if (px * d > E1 * d && E1 * d > E2 * d && E2 * d >= E3 * d) emaL = 'green';
    else if (px * d > E2 * d) emaL = 'yellow';
    rsiL = rv >= 45 && rv <= 65 ? 'green' : (rv > 65 && rv <= preset.rsiOver) || (rv >= 40 && rv < 45) ? 'yellow' : 'red';
  }
  return { macd: macdL, ema: emaL, rsi: rsiL, price: px, atr: A, rsiValue: R };
}

export function evaluate(byTf, dir, horizon = 'mid', preset = PRESETS.stocks) {
  const agg = { macd: 0, ema: 0, rsi: 0 };
  let wsum = 0, atrRef = NaN, price = NaN;
  const detail = {};
  for (const [tf, wt] of HORIZONS[horizon]) {
    if (!byTf[tf] || byTf[tf].length < 30) continue;
    const L = lights(byTf[tf], dir, preset);
    detail[tf] = L; wsum += wt;
    for (const k of ['macd', 'ema', 'rsi']) agg[k] += LIGHT[L[k]] * wt;
    atrRef = L.atr; price = L.price;
  }
  if (!wsum) return { overall: 'red', indicators: {}, detail, reason: 'нет данных' };
  const indicators = {};
  for (const k of Object.keys(agg)) indicators[k] = toLight(agg[k] / wsum);
  const vals = Object.values(indicators);
  const overall = vals.every((x) => x === 'green') ? 'green' : vals.some((x) => x === 'red') ? 'red' : 'yellow';
  const score = Object.values(agg).reduce((s, x) => s + x, 0) / (3 * wsum);
  return { overall, indicators, detail, consensus: score, atr: atrRef, price };
}
