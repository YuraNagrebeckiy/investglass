import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, funnel, DEFAULTS } from '../src/engine/funnel.js';

const mk = (o) => ({ secid: 'X', name: 'N', group: 'corp1', unit: 'SUR', pricePct: 100, coupon: 20, monthly: true, ytm: 15, grossYield: 0.15, volToday: 5e6, trades: 50, spreadPct: 0.3, maturity: '2028-01-01', offer: null, amort: false, qual: null, ...o });
const now = new Date('2026-11-22');

test('funnel counts never grow and results respect filters', () => {
  const raw = [mk({ secid: 'A' }), mk({ secid: 'B', ytm: 5 }), mk({ secid: 'C', monthly: false }), mk({ secid: 'D', qual: true }), mk({ secid: 'E', volToday: 0 }), mk({ secid: 'F', offer: '2027-05-01' }), mk({ secid: 'G', unit: 'USD' }), mk({ secid: 'H', maturity: '2026-12-10' })];
  const f = funnel(prepare(raw, 14, now), DEFAULTS);
  const counts = f.steps.map((s) => s.count);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] <= counts[i - 1]);
  assert.deepEqual(f.result.map((b) => b.secid), ['A']);
});

test('qualified checkbox opens qualified-only bonds', () => {
  const raw = [mk({ secid: 'D', qual: true }), mk({ secid: 'A' })];
  const f = funnel(prepare(raw, 14, now), { ...DEFAULTS, qual: true });
  assert.equal(f.result.length, 2);
});

test('high-yield category is assigned by spread to key rate', () => {
  const p = prepare([mk({ secid: 'H1', group: 'corp3', ytm: 25 }), mk({ secid: 'O', group: 'ofz', ytm: 25 })], 14, now);
  assert.equal(p[0].cat, 'hy');
  assert.equal(p[1].cat, 'ofz');
});

test('missing maturity or yield is excluded, sort by yield works', () => {
  const raw = [mk({ secid: 'A', ytm: 12 }), mk({ secid: 'B', ytm: 17 }), mk({ secid: 'C', maturity: null }), mk({ secid: 'D', ytm: 0, grossYield: 0 })];
  const f = funnel(prepare(raw, 14, now), DEFAULTS);
  assert.deepEqual(f.result.map((b) => b.secid), ['B', 'A']);
});
