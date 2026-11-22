import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, PRESETS } from '../src/engine/signal.js';
import { corrByTime } from '../src/engine/stats.js';

const walk = (n, drift, seed = 7) => {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  let c = 100;
  return Array.from({ length: n }, (_, i) => { c += drift + rnd() * 3; return { t: i * 86400, o: c, h: c + 1, l: c - 1, c }; });
};

test('reversion mode: stretched uptrend favours short, not long', () => {
  const data = { '1h': walk(260, 0.4), '4h': walk(260, 0.4), '1d': walk(260, 0.4) };
  const p = { ...PRESETS.crypto, rsiMode: 'reversion' };
  assert.equal(evaluate(data, 'short', 'mid', p).indicators.ema, 'green');
  assert.equal(evaluate(data, 'long', 'mid', p).indicators.ema, 'red');
});

test('short history (no EMA200) does not break the light', () => {
  const r = evaluate({ '1d': walk(120, 0.4) }, 'long', 'mid', PRESETS.stocks);
  assert.ok(['green', 'yellow', 'red'].includes(r.overall));
  assert.notEqual(r.indicators.ema, undefined);
});

test('correlation: identical series = 1, mirrored = -1', () => {
  const a = walk(120, 0.1, 3);
  const b = a.map((x) => ({ ...x }));
  const m = a.map((x, i) => ({ ...x, c: i ? a[0].c * a[0].c / (a[i].c) : x.c }));
  assert.ok(Math.abs(corrByTime(a, b) - 1) < 1e-9);
  assert.ok(corrByTime(a, m) < -0.9);
});
