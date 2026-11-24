export function ema(v, n) {
  const k = 2 / (n + 1), out = [];
  let e = v[0];
  for (let i = 0; i < v.length; i++) { e = i === 0 ? v[0] : v[i] * k + e * (1 - k); out.push(e); }
  return out;
}

export function rsi(v, n = 14) {
  if (v.length <= n) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

export function atrPct(cs, n = 14) {
  if (cs.length <= n) return null;
  const tr = [];
  for (let i = 1; i < cs.length; i++) tr.push(Math.max(cs[i].h - cs[i].l, Math.abs(cs[i].h - cs[i - 1].c), Math.abs(cs[i].l - cs[i - 1].c)));
  const a = tr.slice(-n).reduce((s, x) => s + x, 0) / n;
  return (a / cs[cs.length - 1].c) * 100;
}

export const HORIZONS = [{ d: 5, n: 'Неделя' }, { d: 21, n: 'Месяц' }, { d: 63, n: '3 месяца' }, { d: 250, n: 'Год' }];

export function analyze(cs, days = 21) {
  const c = cs.map((x) => x.c), n = c.length - 1;
  if (n < 60) return null;
  const px = c[n], base = c[Math.max(0, n - days)];
  const chg = (px / base - 1) * 100;
  const e20 = ema(c, 20), e50 = ema(c, 50), e12 = ema(c, 12), e26 = ema(c, 26);
  const macd = e12.map((x, i) => x - e26[i]), sig = ema(macd, 9);
  const hist = macd[n] - sig[n], histPrev = macd[n - 3] - sig[n - 3];
  const yr = c.slice(-250), m = yr.reduce((s, x) => s + x, 0) / yr.length;
  const sd = Math.sqrt(yr.reduce((s, x) => s + (x - m) ** 2, 0) / yr.length) || 1;
  const z = (px - m) / sd, r = rsi(c), a = atrPct(cs);
  const trendUp = e20[n] > e50[n];
  const reasons = [];
  reasons.push(`За выбранный срок курс ${chg >= 0 ? 'вырос' : 'снизился'} на ${Math.abs(chg).toFixed(2)}%.`);
  reasons.push(trendUp ? 'Средняя за 20 дней выше средней за 50 дней: краткосрочный тренд направлен вверх.' : 'Средняя за 20 дней ниже средней за 50 дней: краткосрочный тренд направлен вниз.');
  reasons.push(hist > 0 ? `Индикатор MACD выше сигнальной линии${hist > histPrev ? ' и усиливается' : ', но слабеет'}: импульс вверх.` : `Индикатор MACD ниже сигнальной линии${hist < histPrev ? ' и усиливается вниз' : ', но слабеет'}: импульс вниз.`);
  if (r != null) reasons.push(r >= 70 ? `RSI ${r.toFixed(0)}: курс резко вырос, возможна пауза или откат.` : r <= 30 ? `RSI ${r.toFixed(0)}: курс резко снизился, возможен отскок.` : `RSI ${r.toFixed(0)}: перегрева нет, движение в рабочем диапазоне.`);
  reasons.push(Math.abs(z) >= 1.5 ? `Курс на ${Math.abs(z).toFixed(1)} σ ${z > 0 ? 'выше' : 'ниже'} среднего за год: это необычно ${z > 0 ? 'дорого' : 'дёшево'} относительно собственной истории.` : `Курс в пределах обычного разброса за год (${z.toFixed(1)} σ).`);
  return { px, chg, rsi: r, atr: a, z, trendUp, macdUp: hist > 0, hist, e20: e20[n], e50: e50[n], reasons };
}
