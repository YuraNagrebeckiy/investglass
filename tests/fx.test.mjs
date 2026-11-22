import test from 'node:test';
import assert from 'node:assert/strict';
import { valuation, message } from '../src/engine/fx.js';

const series = (f, n = 260) => Array.from({ length: n }, (_, i) => { const c = f(i); return { o: c, h: c + 0.2, l: c - 0.2, c }; });

test('sharp rally to the top of the range is overvalued', () => {
  const v = valuation(series((i) => (i < 220 ? 80 + Math.sin(i / 5) : 80 + (i - 220) * 0.6)));
  assert.equal(v.state, 'over');
  assert.match(message('EUR', v).title, /Евро переоценён/);
});

test('sharp drop to the bottom is undervalued', () => {
  const v = valuation(series((i) => (i < 220 ? 90 + Math.sin(i / 5) : 90 - (i - 220) * 0.6)));
  assert.equal(v.state, 'under');
  assert.match(message('USD', v).title, /Доллар недооценён/);
});

test('flat noisy series is fair, short history has no data', () => {
  assert.equal(valuation(series((i) => 80 + Math.sin(i / 3))).state, 'fair');
  assert.equal(valuation(series(() => 80, 30)).state, 'nodata');
});
