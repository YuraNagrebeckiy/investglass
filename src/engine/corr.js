const day = (t) => new Date((t + 10800) * 1000).toISOString().slice(0, 10);

export function returnsByDay(cs) {
  const m = new Map();
  for (let i = 1; i < cs.length; i++) if (cs[i - 1].c > 0) m.set(day(cs[i].t), cs[i].c / cs[i - 1].c - 1);
  return m;
}

export function corr(a, b, min = 30) {
  const xs = [], ys = [];
  for (const [k, x] of a) if (b.has(k)) { xs.push(x); ys.push(b.get(k)); }
  const n = xs.length;
  if (n < min) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, x) => s + x, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
