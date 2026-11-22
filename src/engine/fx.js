import { ema, rsi, last } from './indicators.js';
import { detectAll, candleLight } from './candles.js';

export const NAMES = { USD: 'Доллар', EUR: 'Евро', CNY: 'Юань' };

const stats = (v) => {
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  return { m, sd: Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) || 1e-9 };
};

export function valuation(cs, { window = 250 } = {}) {
  if (!cs || cs.length < 60) return { state: 'nodata' };
  const c = cs.map((x) => x.c), w = c.slice(-window), px = last(c);
  const { m, sd } = stats(w);
  const z = (px - m) / sd, pctile = (w.filter((x) => x <= px).length / w.length) * 100;
  const R = last(rsi(c)), e50 = last(ema(c, 50)), e200 = last(ema(c, 200));
  const lo = Math.min(...w), hi = Math.max(...w), pos = hi > lo ? (px - lo) / (hi - lo) : 0.5;
  const over = [z >= 1.5, pctile >= 90, R >= 70, px >= e50 * 1.03];
  const under = [z <= -1.5, pctile <= 10, R <= 30, px <= e50 * 0.97];
  const nO = over.filter(Boolean).length, nU = under.filter(Boolean).length;
  const pats = detectAll(cs, 40);
  const bullConfirm = candleLight(pats, cs.length, 'long') === 'green', bearConfirm = candleLight(pats, cs.length, 'short') === 'green';
  let state = 'fair';
  if (nO >= 3) state = 'over'; else if (nU >= 3) state = 'under'; else if (nO === 2) state = 'over_soft'; else if (nU === 2) state = 'under_soft';
  return { state, px, z, pctile, rsi: R, e50, e200, lo, hi, pos, nO, nU, bullConfirm, bearConfirm, patterns: pats.slice(-3).map((p) => p.name) };
}

export function message(code, v) {
  const n = NAMES[code] || code;
  const facts = v.state === 'nodata' ? '' : `Цена ${v.px.toFixed(2)} ₽, в годовом диапазоне ${v.lo.toFixed(2)}–${v.hi.toFixed(2)} ₽ она выше ${v.pctile.toFixed(0)}% значений, отклонение от среднего ${v.z.toFixed(1)} σ, RSI ${v.rsi.toFixed(0)}.`;
  switch (v.state) {
    case 'over': return { level: 'red', title: `${n} переоценён на сегодняшний момент`, text: `${facts} Покупать валюту после такого роста рискованно: вероятен откат. Тем, кто хочет купить, разумнее ждать снижения и брать частями. Тем, у кого есть валюта на продажу, момент выгоднее обычного.${v.bearConfirm ? ' На графике есть медвежий свечной сигнал.' : ''}` };
    case 'under': return { level: 'green', title: `${n} недооценён`, text: `${facts} Цена упёрлась в нижнюю часть годового диапазона. Покупку можно рассматривать частями.${v.bullConfirm ? ' Свечной сигнал разворота уже есть.' : ' Свечного подтверждения разворота пока нет, надёжнее дождаться его.'}` };
    case 'over_soft': return { level: 'yellow', title: `${n} тяготеет к переоценке`, text: `${facts} Сигналов пока недостаточно для вывода, новые покупки лучше не наращивать.` };
    case 'under_soft': return { level: 'yellow', title: `${n} тяготеет к недооценке`, text: `${facts} Сигналов пока недостаточно для вывода, следите за разворотом.` };
    case 'fair': return { level: 'gray', title: `${n} в пределах нормы`, text: `${facts} Явного перекоса нет.` };
    default: return { level: 'gray', title: `${n}: нет данных`, text: 'Не удалось получить котировки.' };
  }
}
