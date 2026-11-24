import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, rsi, ema } from '../src/engine/fxwhy.js';

const mk = (f) => Array.from({ length: 300 }, (_, i) => { const c = f(i); return { t: i * 86400, o: c, h: c + 0.5, l: c - 0.5, c, v: 1 }; });

test('rising series gives up trend and positive change', () => {
  const a = analyze(mk((i) => 70 + i * 0.05), 21);
  assert.ok(a.chg > 0 && a.trendUp && a.macdUp !== undefined);
  assert.ok(a.rsi > 70);
  assert.ok(a.reasons.length === 5);
});

test('falling series gives down trend', () => {
  const a = analyze(mk((i) => 100 - i * 0.05), 21);
  assert.ok(a.chg < 0 && !a.trendUp && a.rsi < 30);
});

test('helpers', () => {
  assert.equal(rsi([1, 2, 3]), null);
  assert.equal(ema([5, 5, 5], 3)[2], 5);
  assert.equal(analyze(mk(() => 1).slice(0, 20)), null);
});
