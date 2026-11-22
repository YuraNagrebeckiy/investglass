import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateBond, maxAffordable, currentYieldNet } from '../src/engine/bonds.js';
import { simulateDeposit, depositRate } from '../src/engine/deposit.js';
import { ema, rsi, macd, atr } from '../src/engine/indicators.js';
import { riskPlan } from '../src/engine/risk.js';
import { evaluate } from '../src/engine/signal.js';
import fs from 'node:fs';
const rates = JSON.parse(fs.readFileSync(new URL('../config/rates.json', import.meta.url)));

test('net coupon after 13% tax matches the spreadsheet (21.78 -> 18.9486)', () => {
  const r = simulateBond({ initial: 1000, months: 1, pricePct: 99.587, coupon: 21.78, feeRate: 0.0005 });
  assert.equal(r.rows[1].couponNet, 18.95);
});

test('invariant: equity = contributed + net coupons - fees (par price, no accrued)', () => {
  const r = simulateBond({ initial: 200000, topup: 15000, months: 24, pricePct: 100, coupon: 10, feeRate: 0.003 });
  assert.ok(Math.abs(r.equity - (r.contributed + r.couponNet - r.fees)) < 1);
});

test('cash never negative and units are whole', () => {
  const r = simulateBond({ initial: 5000, topup: 700, months: 36, pricePct: 96.3, coupon: 12, accrued: 4.1, feeRate: 0.0025, monthlyFee: 390 });
  for (const x of r.rows) { assert.ok(x.cash > -0.01); assert.ok(Number.isInteger(x.qty)); }
});

test('cash accumulates until a bond is affordable', () => {
  const r = simulateBond({ initial: 500, topup: 300, months: 3, pricePct: 100, coupon: 0, feeRate: 0 });
  assert.equal(r.rows[0].qty, 0);
  assert.equal(r.rows[1].qty, 0);
  assert.equal(r.rows[2].qty, 1);
});

test('min fee respected in affordability', () => {
  assert.equal(maxAffordable(1000, 999, { feeRate: 0, minFee: 5 }), 0);
});

test('maturity redeems at face with tax on gain', () => {
  const r = simulateBond({ initial: 9600, months: 6, pricePct: 96, coupon: 0, feeRate: 0, maturityMonth: 6 });
  assert.equal(r.rows[6].qty, 0);
  assert.ok(Math.abs(r.rows[6].cash - (10000 - 400 * 0.13)) < 0.5);
});

test('deposit modes use key rate and spread', () => {
  const spread = rates.depositAvgMax.all - rates.keyRate.value;
  assert.ok(Math.abs(depositRate({ mode: 'key_spread', rates }) - (rates.keyRate.value + spread)) < 1e-9);
  assert.equal(depositRate({ mode: 'manual', manual: 9.5, rates }), 9.5);
});

test('deposit tax applies only above the tax-free limit', () => {
  const a = simulateDeposit({ initial: 1000000, months: 12, effAnnual: 13, taxFreeLimit: 160000 });
  const b = simulateDeposit({ initial: 1000000, months: 12, effAnnual: 13, taxFreeLimit: 0 });
  assert.ok(a.taxes === 0 && b.taxes > 0);
});

test('RSI is 100 for monotonic growth and ATR/EMA/MACD are finite', () => {
  const c = Array.from({ length: 60 }, (_, i) => 100 + i);
  assert.equal(rsi(c, 14).at(-1), 100);
  const h = c.map((x) => x + 1), l = c.map((x) => x - 1);
  assert.ok(Math.abs(atr(h, l, c, 14).at(-1) - 2) < 1e-9);
  assert.ok(Number.isFinite(ema(c, 20).at(-1)) && Number.isFinite(macd(c).hist.at(-1)));
});

test('long and short risk plans are mirror images', () => {
  const base = { entry: 100, atr: 2, equity: 10000, feeRate: 0.001, instrument: 'swap', fundingRate8h: 0 };
  const L = riskPlan({ ...base, direction: 'long' }), S = riskPlan({ ...base, direction: 'short' });
  assert.ok(Math.abs((100 - L.stop) - (S.stop - 100)) < 1e-9);
  assert.ok(Math.abs((L.tp - 100) - (100 - S.tp)) < 1e-9);
  assert.ok(Math.abs(L.qty - S.qty) / L.qty < 0.01);
});

test('funding hurts the side that pays it', () => {
  const base = { entry: 100, atr: 2, equity: 10000, feeRate: 0.0005, instrument: 'swap', fundingRate8h: 0.0005, holdHours: 48 };
  assert.ok(riskPlan({ ...base, direction: 'long' }).carry > 0);
  assert.ok(riskPlan({ ...base, direction: 'short' }).carry < 0);
});

test('uptrend: EMA light is green for long and red for short', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const mk = (n) => { let c = 100; return Array.from({ length: n }, () => { c += 0.4 + rnd() * 3; return { o: c, h: c + 1, l: c - 1, c }; }); };
  const data = { '1h': mk(260), '4h': mk(260), '1d': mk(260) };
  const L = evaluate(data, 'long', 'mid'), S = evaluate(data, 'short', 'mid');
  assert.equal(L.indicators.ema, 'green');
  assert.equal(S.indicators.ema, 'red');
  assert.equal(S.overall, 'red');
});

test('current net yield', () => {
  assert.ok(Math.abs(currentYieldNet({ face: 1000, pricePct: 100, coupon: 10, payPerYear: 12 }) - 0.1044) < 1e-4);
});
