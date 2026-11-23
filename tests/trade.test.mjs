import test from 'node:test';
import assert from 'node:assert/strict';
import { scanOutcome, tradePnl, dailySeries } from '../src/engine/trade.js';

const rec = { ts: '2026-11-20T10:00:00Z', dir: 'long', price: 100, stop: 95, tp: 110, qty: 10, market: 'crypto' };

test('spot long pnl with fees', () => {
  const p = tradePnl({ ...rec, lev: 1 }, 110, Date.parse('2026-11-21T10:00:00Z'), { feeRate: 0.001 });
  assert.ok(Math.abs(p.gross - 100) < 1e-9);
  assert.ok(Math.abs(p.fees - 2.1) < 1e-9);
  assert.ok(Math.abs(p.net - 97.9) < 1e-9);
  assert.ok(Math.abs(p.pctMargin - 9.79) < 1e-9);
});

test('margin adds daily financing on the borrowed part', () => {
  const p = tradePnl({ ...rec, lev: 5 }, 100, Date.parse('2026-11-22T10:00:00Z'), { feeRate: 0, borrowDaily: 0.0001 });
  assert.ok(Math.abs(p.financing - 800 * 0.0001 * 2) < 1e-9);
  assert.equal(p.margin, 200);
});

test('outcome detects which level was hit first and excursions', () => {
  const t = Date.parse(rec.ts) / 1000;
  const cs = [0, 1, 2, 3].map((i) => ({ t: t + i * 3600, o: 100, h: 100 + i * 4, l: 99 - i, c: 100 + i }));
  const r = scanOutcome(rec, cs);
  assert.equal(r.status, 'tp');
  assert.ok(r.mfe > 0.1 && r.mae < 0);
  assert.equal(scanOutcome(rec, [{ t, o: 100, h: 101, l: 94, c: 95 }]).status, 'stop');
});

test('daily series produces one row per day', () => {
  const t = Date.parse('2026-11-20T00:00:00Z') / 1000;
  const daily = [0, 1, 2].map((i) => ({ t: t + i * 86400, o: 100, h: 105, l: 99, c: 101 + i }));
  const rows = dailySeries({ ...rec, lev: 1 }, daily, Date.parse('2026-11-22T12:00:00Z'), { feeRate: 0 });
  assert.equal(rows.length, 3);
  assert.ok(rows[2].net > rows[0].net);
});
