import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDynamic, parseDaily, mergeSeries } from '../scripts/cbr.mjs';

const dyn = '<?xml version="1.0" encoding="windows-1251"?><ValCurs ID="R01375" DateRange1="20/11/2026" DateRange2="28/11/2026" name="Foreign Currency Market Dynamic"><Record Date="27.11.2026" Id="R01375"><Nominal>1</Nominal><Value>12,3270</Value><VunitRate>12,3270</VunitRate></Record><Record Date="26.11.2026" Id="R01375"><Nominal>10</Nominal><Value>122,5000</Value><VunitRate>12,25</VunitRate></Record></ValCurs>';
const daily = '<ValCurs Date="28.11.2026" name="Foreign Currency Market"><Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Доллар США</Name><Value>82,2732</Value><VunitRate>82,2732</VunitRate></Valute><Valute ID="R01239"><NumCode>978</NumCode><CharCode>EUR</CharCode><Nominal>1</Nominal><Name>Евро</Name><Value>90,2948</Value></Valute><Valute ID="R01375"><NumCode>156</NumCode><CharCode>CNY</CharCode><Nominal>1</Nominal><Name>Юань</Name><Value>12,3270</Value></Valute></ValCurs>';

test('история ЦБ разбирается, номинал учитывается, ряд по возрастанию', () => {
  const r = parseDynamic(dyn);
  assert.equal(r.length, 2);
  assert.ok(r[0][0] < r[1][0]);
  assert.equal(r[0][4], 12.25);
  assert.equal(r[1][4], 12.327);
});

test('курсы на дату разбираются, дата берётся из ответа', () => {
  const r = parseDaily(daily);
  assert.equal(r.rates.USD, 82.2732);
  assert.equal(r.rates.EUR, 90.2948);
  assert.equal(r.rates.CNY, 12.327);
  assert.equal(new Date(r.t * 1000).toISOString(), '2026-11-27T21:00:00.000Z');
  assert.equal(parseDaily('<html>ошибка</html>'), null);
});

test('слияние рядов: новые значения заменяют старые по дате', () => {
  const m = mergeSeries([[1, 1, 1, 1, 1, 0], [2, 2, 2, 2, 2, 0]], [[2, 9, 9, 9, 9, 0], [3, 3, 3, 3, 3, 0]]);
  assert.deepEqual(m.map((x) => x[4]), [1, 9, 3]);
});
