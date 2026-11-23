import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvents, monthTotals, toIcs, dayTotals } from '../src/engine/calendar.js';

const sched = {
  coupons: [{ date: '2026-12-10', value: 10 }, { date: '2027-01-10', value: null }, { date: '2027-02-10', value: 12 }, { date: '2025-01-10', value: 9 }],
  amort: [{ date: '2027-02-10', value: 1000 }],
};
const ev = buildEvents(sched, 5, { from: '2026-11-22', to: '2027-02-28', taxRate: 0.13, name: 'Test', secid: 'X1' });

test('past payments are dropped, unknown coupon reuses last known and is flagged', () => {
  assert.equal(ev.filter((e) => e.type === 'coupon').length, 3);
  const jan = ev.find((e) => e.date === '2027-01-10');
  assert.equal(jan.perUnit, 10);
  assert.equal(jan.estimated, true);
});

test('coupon is taxed, amortization is not, totals by month', () => {
  const dec = ev.find((e) => e.date === '2026-12-10');
  assert.ok(Math.abs(dec.net - 43.5) < 1e-9);
  const feb = monthTotals(ev).find((m) => m.month === '2027-02');
  assert.equal(feb.amort, 5000);
  assert.ok(Math.abs(feb.couponNet - 52.2) < 1e-9);
});

test('quantity can grow over time (plan mode) and days are grouped', () => {
  const grow = buildEvents(sched, (d) => (d < '2027-01-01' ? 2 : 10), { from: '2026-11-22', to: '2027-02-28', taxRate: 0, name: 'T', secid: 'X' });
  assert.equal(grow.find((e) => e.date === '2026-12-10').gross, 20);
  assert.equal(grow.find((e) => e.date === '2027-02-10' && e.type === 'coupon').gross, 120);
  assert.equal(dayTotals(grow).get('2027-02-10').items.length, 2);
});

test('ics has one event per payment', () => {
  const ics = toIcs(ev);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, ev.length);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261210'));
});
