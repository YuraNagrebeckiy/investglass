import { round2 } from './bonds.js';

export function depositRate(o) {
  const { mode, manual = 0, rates, termMonths = 12, spread } = o;
  if (mode === 'manual') return manual;
  const d = rates.depositAvgMax;
  const byTerm = termMonths <= 3 ? d.upTo90d : termMonths <= 6 ? d.d91to180 : termMonths <= 12 ? d.d181to365 : d.over1y;
  if (mode === 'cbr_avg') return byTerm;
  const key = rates.keyRate.value;
  const sp = spread ?? d.all - key;
  return key + sp;
}

export function simulateDeposit(p) {
  const o = { initial: 0, topup: 0, months: 24, effAnnual: 13, taxRate: 0.13, taxFreeLimit: 0, ...p };
  const mr = Math.pow(1 + o.effAnnual / 100, 1 / 12) - 1;
  let bal = 0, contributed = 0, yearInterest = 0, interestTotal = 0, taxes = 0;
  const rows = [];
  for (let m = 0; m <= o.months; m++) {
    const add = m === 0 ? o.initial : o.topup;
    if (m > 0) { const i = bal * mr; bal += i; yearInterest += i; interestTotal += i; }
    bal += add; contributed += add;
    if (m > 0 && m % 12 === 0) {
      const t = Math.max(0, yearInterest - o.taxFreeLimit) * o.taxRate;
      bal -= t; taxes += t; yearInterest = 0;
    }
    rows.push({ month: m, contributed: round2(contributed), equity: round2(bal) });
  }
  return { rows, contributed: round2(contributed), equity: round2(bal), profit: round2(bal - contributed), taxes: round2(taxes), interest: round2(interestTotal) };
}
