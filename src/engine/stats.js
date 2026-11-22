export function dailyReturns(series) {
  const m = new Map();
  for (let i = 1; i < series.length; i++) if (series[i - 1].c > 0) m.set(series[i].t, series[i].c / series[i - 1].c - 1);
  return m;
}

export function corrByTime(a, b, minN = 30) {
  const A = dailyReturns(a), B = dailyReturns(b), x = [], y = [];
  for (const [t, v] of A) if (B.has(t)) { x.push(v); y.push(B.get(t)); }
  const n = x.length;
  if (n < minN) return NaN;
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}
