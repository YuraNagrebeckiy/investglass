import test from 'node:test';
import assert from 'node:assert/strict';
import { corr, returnsByDay } from '../src/engine/corr.js';

const mk = (f, n = 80) => Array.from({ length: n }, (_, i) => ({ t: 1700000000 + i * 86400, c: f(i) }));
const a = mk((i) => 100 + Math.sin(i / 3) * 5 + i * 0.1);

test('identical series correlate at 1, mirrored at -1', () => {
  const ra = returnsByDay(a);
  assert.ok(Math.abs(corr(ra, returnsByDay(a)) - 1) < 1e-9);
  const inv = mk((i) => 1 / (100 + Math.sin(i / 3) * 5 + i * 0.1));
  assert.ok(corr(ra, returnsByDay(inv)) < -0.99);
});

test('too few common days gives null', () => {
  assert.equal(corr(returnsByDay(mk((i) => 100 + i, 10)), returnsByDay(mk((i) => 100 + i, 10))), null);
});
