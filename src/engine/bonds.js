export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function feeFor(amount, o) {
  if (amount <= 0) return 0;
  return Math.max(o.minFee || 0, amount * ((o.feeRate || 0) + (o.exchangeRate || 0)));
}

export function maxAffordable(cash, unitCost, o) {
  if (cash <= 0 || unitCost <= 0) return 0;
  let q = Math.floor(cash / (unitCost * (1 + (o.feeRate || 0) + (o.exchangeRate || 0))));
  while (q > 0 && q * unitCost + feeFor(q * unitCost, o) > cash + 1e-9) q--;
  return Math.max(0, q);
}

export function irrMonthly(flows) {
  const npv = (r) => flows.reduce((s, f, i) => s + f / Math.pow(1 + r, i), 0);
  let lo = -0.99, hi = 1;
  if (npv(lo) * npv(hi) > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export function simulateBond(p) {
  const o = {
    initial: 0, topup: 0, months: 24, taxRate: 0.13, taxMode: 'each', liquidate: false, feeRate: 0.003, exchangeRate: 0,
    monthlyFee: 0, monthlyFeeOnlyIfTrades: true, minFee: 0, liquidityRate: 0,
    face: 1000, pricePct: 100, coupon: 0, accrued: 0, payPerYear: 12,
    maturityMonth: null, reinvest: true, ...p,
  };
  const clean = (o.face * o.pricePct) / 100;
  const unit = clean + o.accrued;
  const step = 12 / o.payPerYear;
  const defer = o.taxMode === 'end';
  let cash = 0, qty = 0, costBasis = 0, nkdCredit = 0;
  let contributed = 0, fees = 0, taxes = 0, deferred = 0, couponNet = 0, liqInterest = 0;
  const rows = [], flows = [];
  const pay = (tax) => { if (defer) deferred += tax; else { cash -= tax; taxes += tax; } };

  for (let m = 0; m <= o.months; m++) {
    let couponM = 0;
    const add = m === 0 ? o.initial : o.topup;
    cash += add; contributed += add; flows.push(-add);

    if (m > 0) {
      const li = (cash * o.liquidityRate) / 12;
      if (li > 0) { cash += li; pay(li * o.taxRate); liqInterest += li; }
      const active = qty > 0 && (o.maturityMonth == null || m <= o.maturityMonth);
      if (active && m % step === 0) {
        const gross = qty * o.coupon;
        const base = Math.max(0, gross - nkdCredit);
        nkdCredit = Math.max(0, nkdCredit - gross);
        const tax = base * o.taxRate;
        cash += gross; pay(tax); couponM = gross - tax; couponNet += couponM;
      }
      if (o.maturityMonth != null && m === o.maturityMonth && qty > 0) {
        const redeem = qty * o.face;
        const tax = Math.max(0, redeem - costBasis) * o.taxRate;
        cash += redeem; pay(tax); qty = 0; costBasis = 0; nkdCredit = 0;
      }
    }

    const canBuy = o.maturityMonth == null || m < o.maturityMonth;
    const reserve = o.monthlyFee > 0 ? o.monthlyFee : 0;
    let bought = 0;
    if (o.reinvest && canBuy) {
      const q = maxAffordable(cash - reserve, unit, o);
      if (q > 0) {
        const cost = q * unit, fee = feeFor(cost, o);
        cash -= cost + fee; fees += fee; qty += q; costBasis += q * clean;
        nkdCredit += q * o.accrued; bought = q;
      }
    }
    if (reserve > 0 && (!o.monthlyFeeOnlyIfTrades || bought > 0)) { cash -= reserve; fees += reserve; }
    const market = qty * clean;
    rows.push({ month: m, contributed: round2(contributed), cash: round2(cash), qty, market: round2(market), equity: round2(cash + market), couponNet: round2(couponM) });
  }
  const last = rows[rows.length - 1];
  const exitFee = o.liquidate ? last.market * ((o.feeRate || 0) + (o.exchangeRate || 0)) : 0;
  const equityNet = last.equity - deferred - exitFee;
  flows[flows.length - 1] += equityNet;
  const irr = irrMonthly(flows);
  return {
    rows, contributed: round2(contributed), equity: last.equity, equityNet: round2(equityNet), profit: round2(equityNet - contributed),
    fees: round2(fees), exitFee: round2(exitFee), taxes: round2(taxes), taxDeferred: round2(deferred), couponNet: round2(couponNet),
    annualReturn: Number.isNaN(irr) ? NaN : Math.pow(1 + irr, 12) - 1,
    unitCost: round2(unit),
  };
}

export function currentYieldNet(o) {
  const clean = (o.face * o.pricePct) / 100;
  const price = clean + (o.accrued || 0);
  return (o.coupon * (o.payPerYear || 12) * (1 - (o.taxRate ?? 0.13))) / price;
}
