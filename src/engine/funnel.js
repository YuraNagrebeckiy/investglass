import { sectorOf } from './sector.js';

export const CAT_LABEL = { ofz: 'ОФЗ', corp1: 'Корп. 1 эш.', corp2: 'Корп. 2 эш.', corp3: 'Корп. 3 эш.', hy: 'ВДО' };
export const RISK = ['', 'низкий', 'умеренный', 'средний', 'повышенный', 'высокий'];

export const DEFAULTS = {
  onlyTraded: true, rubOnly: true, cats: { ofz: true, corp1: true, corp2: true, corp3: false, hy: false }, qual: false, sector: '',
  coupon: 'monthly', minYield: 10, maxYield: 0, minVol: 1e6, minTrades: 5, maxSpread: 1.5, minM: 3, maxM: 60,
  noOffer: true, noAmort: false, maxRisk: 5, sort: 'yield',
};

export function monthsTo(d, now = new Date()) {
  if (!d || d === '0000-00-00') return null;
  const t = new Date(d);
  if (Number.isNaN(+t)) return null;
  return Math.max(0, (t.getFullYear() - now.getFullYear()) * 12 + t.getMonth() - now.getMonth());
}

export function prepare(items, keyRate, now = new Date()) {
  return items.map((b) => {
    const y = b.ytm > 0 ? b.ytm : b.grossYield > 0 ? b.grossYield * 100 : null;
    const cat = b.group !== 'ofz' && y != null && y - keyRate >= 4 ? 'hy' : b.group;
    let risk = { ofz: 1, corp1: 2, corp2: 3, corp3: 4, hy: 5 }[cat] || 4;
    if ((b.spreadPct ?? 0) > 1 || b.volToday < 1e6) risk = Math.min(5, risk + 1);
    const cost = ((b.face || 0) * (b.pricePct || 0)) / 100 + (b.accrued || 0);
    return { ...b, cat, yld: y, netYield: y == null ? 0 : (y / 100) * 0.87, mon: monthsTo(b.maturity, now), risk, sector: sectorOf(b), cost };
  });
}

const STEPS = [
  ['traded', 'Есть торги и цена', (b, c) => !c.onlyTraded || (b.volToday > 0 && b.pricePct > 0)],
  ['rub', 'Только рубли', (b, c) => !c.rubOnly || !b.unit || b.unit === 'SUR' || b.unit === 'RUB'],
  ['cat', 'Категория', (b, c) => !!c.cats[b.cat]],
  ['sector', 'Сектор', (b, c) => !c.sector || b.sector === c.sector],
  ['qual', 'Доступность для неквалов', (b, c) => c.qual || b.qual !== true],
  ['coupon', 'Купон', (b, c) => c.coupon === 'any' || (c.coupon === 'monthly' ? b.monthly : b.coupon > 0)],
  ['yield', 'Доходность', (b, c) => b.yld != null && b.yld >= c.minYield && (!c.maxYield || b.yld <= c.maxYield)],
  ['liq', 'Ликвидность', (b, c) => b.volToday >= c.minVol && b.trades >= c.minTrades && (b.spreadPct == null || b.spreadPct <= c.maxSpread)],
  ['term', 'Срок до погашения', (b, c) => b.mon != null && b.mon >= c.minM && b.mon <= c.maxM],
  ['flags', 'Оферта и амортизация', (b, c) => !(c.noOffer && b.offer) && !(c.noAmort && b.amort === true)],
  ['risk', 'Уровень риска', (b, c) => b.risk <= c.maxRisk],
];

const SORT = {
  yield: (a, b) => b.yld - a.yld,
  vol: (a, b) => b.volToday - a.volToday,
  risk: (a, b) => a.risk - b.risk || b.yld - a.yld,
};

export function funnel(items, c) {
  let cur = items;
  const steps = [{ id: 'all', label: 'Вся база', count: items.length, removed: 0 }];
  for (const [id, label, fn] of STEPS) {
    const next = cur.filter((b) => fn(b, c));
    steps.push({ id, label, count: next.length, removed: cur.length - next.length });
    cur = next;
  }
  return { steps, result: [...cur].sort(SORT[c.sort] || SORT.yield) };
}
