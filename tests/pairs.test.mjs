import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrankfurter, pairSeries, indicatorList, WORLD } from '../src/engine/pairs.js';

test('both Frankfurter response shapes are parsed', () => {
  const v1 = { rates: { '2026-11-20': { EUR: 0.91, JPY: 150 }, '2026-11-19': { EUR: 0.9, JPY: 149 } } };
  const v2 = [{ date: '2026-11-19', base: 'USD', quote: 'EUR', rate: 0.9 }, { date: '2026-11-20', base: 'USD', quote: 'EUR', rate: 0.91 }];
  assert.deepEqual(parseFrankfurter(v1).map((d) => d.date), ['2026-11-19', '2026-11-20']);
  assert.equal(parseFrankfurter(v2)[1].rates.EUR, 0.91);
});

test('EUR/USD is inverted from USD base rates', () => {
  const s = pairSeries([{ date: '2026-11-20', rates: { EUR: 0.8 } }], WORLD[0]);
  assert.ok(Math.abs(s[0].c - 1.25) < 1e-12);
});

test('indicator lights react to an overheated rally', () => {
  const cs = Array.from({ length: 260 }, (_, i) => { const c = i < 220 ? 80 + Math.sin(i / 5) : 80 + (i - 220) * 0.6; return { o: c, h: c + 0.2, l: c - 0.2, c }; });
  const c = cs.map((x) => x.c);
  const v = { pctile: 99, z: 2.4, rsi: 88, bullConfirm: false, bearConfirm: false };
  const list = indicatorList(cs, v);
  assert.equal(list.length, 7);
  assert.equal(list.find((x) => x.key === 'rsi').light, 'red');
  assert.equal(list.find((x) => x.key === 'trend').value, 'вверх');
  assert.equal(c.length, 260);
});
