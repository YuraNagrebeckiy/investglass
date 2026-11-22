export function ema(v, n) {
  const out = new Array(v.length).fill(NaN);
  if (v.length < n) return out;
  let s = 0; for (let i = 0; i < n; i++) s += v[i];
  out[n - 1] = s / n;
  const k = 2 / (n + 1);
  for (let i = n; i < v.length; i++) out[i] = v[i] * k + out[i - 1] * (1 - k);
  return out;
}

export function rsi(c, n = 14) {
  const out = new Array(c.length).fill(NaN);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export function macd(c, fast = 12, slow = 26, sig = 9) {
  const ef = ema(c, fast), es = ema(c, slow);
  const line = c.map((_, i) => (Number.isNaN(ef[i]) || Number.isNaN(es[i]) ? NaN : ef[i] - es[i]));
  const first = line.findIndex((x) => !Number.isNaN(x));
  const sigArr = new Array(c.length).fill(NaN);
  if (first >= 0) {
    const e = ema(line.slice(first), sig);
    for (let i = 0; i < e.length; i++) sigArr[first + i] = e[i];
  }
  const hist = line.map((x, i) => x - sigArr[i]);
  return { line, signal: sigArr, hist };
}

export function atr(h, l, c, n = 14) {
  const out = new Array(c.length).fill(NaN);
  if (c.length <= n) return out;
  const tr = c.map((_, i) => (i === 0 ? h[0] - l[0] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))));
  let a = 0; for (let i = 1; i <= n; i++) a += tr[i];
  a /= n; out[n] = a;
  for (let i = n + 1; i < c.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
  return out;
}

export const last = (a) => a[a.length - 1];
