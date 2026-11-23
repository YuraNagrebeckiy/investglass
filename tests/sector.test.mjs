import test from 'node:test';
import assert from 'node:assert/strict';
import { sectorOf } from '../src/engine/sector.js';
import { prepare, funnel, DEFAULTS } from '../src/engine/funnel.js';

test('sectors are guessed from issuer names', () => {
  assert.equal(sectorOf({ secid: 'X', name: 'sГТЛК2Р-11' }), 'Лизинг');
  assert.equal(sectorOf({ secid: 'X', name: 'АФБАНК1Р20' }), 'Банки и финансы');
  assert.equal(sectorOf({ secid: 'X', name: 'iСелктл1Р7' }), 'IT и связь');
  assert.equal(sectorOf({ secid: 'X', name: 'Новотр 2Р1' }), 'Транспорт и логистика');
  assert.equal(sectorOf({ secid: 'SU26254RMFS3', name: 'ОФЗ 26254' }), 'Государство (ОФЗ)');
  assert.equal(sectorOf({ secid: 'X', name: 'Zzz 1Р' }), 'Прочее');
});

const mk = (o) => ({ secid: 'X', name: 'N', group: 'corp1', unit: 'SUR', pricePct: 99, face: 1000, accrued: 10, coupon: 20, monthly: true, ytm: 15, grossYield: 0.15, volToday: 5e6, trades: 50, spreadPct: 0.3, maturity: '2028-01-01', offer: null, amort: false, qual: null, ...o });

test('real price in rubles and sector filter step', () => {
  const p = prepare([mk({ secid: 'A', name: 'АФБАНК1Р20' }), mk({ secid: 'B', name: 'sГТЛК2Р-11' })], 14, new Date('2026-11-22'));
  assert.equal(p[0].cost, 1000 * 0.99 + 10);
  const f = funnel(p, { ...DEFAULTS, sector: 'Лизинг' });
  assert.deepEqual(f.result.map((b) => b.secid), ['B']);
  assert.equal(funnel(p, DEFAULTS).result.length, 2);
});
