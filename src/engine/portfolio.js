import { simulateBond, round2, irrMonthly } from './bonds.js';

export const issuer = (b) => (b.name || '').split(/[\s\-]/)[0].replace(/[0-9]/g, '').toLowerCase();

export function simulatePortfolio(items, shared) {
  const tw = items.reduce((s, i) => s + i.weight, 0) || 1;
  const sims = items.map((it) => {
    const w = it.weight / tw;
    return { w, name: it.name, sim: simulateBond({ ...shared, ...it.params, initial: shared.initial * w, topup: shared.topup * w }) };
  });
  const rows = [];
  for (let m = 0; m <= shared.months; m++) {
    const r = { month: m, contributed: 0, cash: 0, market: 0, equity: 0, couponNet: 0 };
    for (const s of sims) { const x = s.sim.rows[m]; r.contributed += x.contributed; r.cash += x.cash; r.market += x.market; r.equity += x.equity; r.couponNet += x.couponNet; }
    for (const k of Object.keys(r)) if (k !== 'month') r[k] = round2(r[k]);
    rows.push(r);
  }
  const sum = (k) => round2(sims.reduce((a, s) => a + s.sim[k], 0));
  const equityNet = sum('equityNet'), contributed = sum('contributed');
  const flows = rows.map((r, i) => -(r.contributed - (i ? rows[i - 1].contributed : 0)));
  flows[flows.length - 1] += equityNet;
  const irr = irrMonthly(flows);
  return {
    rows, items: sims.map((s) => ({ name: s.name, weight: s.w, equityNet: s.sim.equityNet, couponNet: s.sim.couponNet })),
    contributed, equityNet, profit: round2(equityNet - contributed), fees: sum('fees'), exitFee: sum('exitFee'),
    taxes: sum('taxes'), taxDeferred: sum('taxDeferred'), couponNet: sum('couponNet'),
    annualReturn: Number.isNaN(irr) ? NaN : Math.pow(1 + irr, 12) - 1,
  };
}

export function diversify(chosen, universe, { minVol = 3e6, maxSpread = 1.5 } = {}) {
  const have = new Set(chosen.map((b) => b.secid)), names = new Set(chosen.map(issuer));
  const cats = chosen.map((b) => b.cat), notes = [];
  if (chosen.length && chosen.length < 5) notes.push(`В портфеле ${chosen.length} выпуск(а): для распределения риска обычно берут не менее 5 разных эмитентов.`);
  const risky = chosen.filter((b) => b.cat === 'hy' || b.cat === 'corp3');
  if (risky.length) notes.push(`ВДО и 3 эшелон: ${risky.length} из ${chosen.length}. Практическое правило: все такие бумаги вместе не более 10–15% портфеля, один эмитент не более 5%.`);
  if (chosen.length && !cats.some((c) => c === 'ofz' || c === 'corp1')) notes.push('Нет защитной части: добавьте ОФЗ или облигации 1 эшелона, они ведут себя иначе при дефолте частного эмитента.');
  const cnt = {};
  chosen.forEach((b) => { if (b.sector) cnt[b.sector] = (cnt[b.sector] || 0) + 1; });
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  if (top && chosen.length >= 3 && top[1] / chosen.length > 0.4 && top[0] !== 'Государство (ОФЗ)') notes.push(`Сектор «${top[0]}»: ${top[1]} из ${chosen.length} выпусков. Проблемы в одной отрасли ударят по всем этим бумагам сразу, добавьте выпуски из других секторов.`);
  if (chosen.length >= 4 && Object.keys(cnt).length < 3) notes.push(`Выпуски из ${Object.keys(cnt).length} сектора(ов): для баланса желательно не менее трёх разных отраслей.`);
  const secSet = new Set(Object.keys(cnt));
  const pool = universe.filter((b) => !have.has(b.secid) && !names.has(issuer(b)) && b.volToday >= minVol && (b.spreadPct == null || b.spreadPct <= maxSpread));
  return {
    notes,
    protective: pool.filter((b) => b.cat === 'ofz' || b.cat === 'corp1').sort((a, b) => (secSet.has(a.sector) - secSet.has(b.sector)) || b.volToday - a.volToday).slice(0, 4),
    balance: pool.filter((b) => b.cat === 'corp2').sort((a, b) => (secSet.has(a.sector) - secSet.has(b.sector)) || b.netYield - a.netYield).slice(0, 3),
  };
}
