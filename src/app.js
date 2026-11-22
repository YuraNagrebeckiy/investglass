import { simulateBond, currentYieldNet } from './engine/bonds.js';
import { simulateDeposit, depositRate } from './engine/deposit.js';
import { riskPlan } from './engine/risk.js';

const $ = (id) => document.getElementById(id);
const rub = (x) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(x) + ' ₽';
const usd = (x) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(x);
const pct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(2) + ' %' : '—');
const load = (u) => fetch(u, { cache: 'no-store' }).then((r) => r.json());
let fees, rates;

document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#tabs button,.tab').forEach((e) => e.classList.remove('on'));
  b.classList.add('on'); $(b.dataset.tab).classList.add('on');
}));

function applyBroker() {
  const b = fees.brokers.find((x) => x.id === $('broker').value);
  $('feeRate').value = +(b.brokerRate * 100).toFixed(4);
  $('exRate').value = +(b.exchangeBond * 100).toFixed(4);
  $('monthlyFee').value = b.monthlyFee;
  $('monthlyFee').dataset.onlyTrades = b.monthlyFeeOnlyIfTrades ? '1' : '';
}

function calcBonds() {
  const num = (id) => parseFloat($(id).value) || 0;
  const months = Math.max(1, Math.round(num('months')));
  const tax = num('taxRate') / 100;
  const b = simulateBond({
    initial: num('initial'), topup: num('topup'), months, taxRate: tax,
    feeRate: num('feeRate') / 100, exchangeRate: num('exRate') / 100,
    monthlyFee: num('monthlyFee'), monthlyFeeOnlyIfTrades: !!$('monthlyFee').dataset.onlyTrades,
    liquidityRate: num('liq') / 100, face: num('face'), pricePct: num('pricePct'),
    coupon: num('coupon'), accrued: num('accrued'), maturityMonth: $('mat').value ? num('mat') : null,
  });
  const rate = depositRate({ mode: $('depMode').value, manual: num('depManual'), rates, termMonths: months, spread: $('spread').value === '' ? undefined : num('spread') });
  const d = simulateDeposit({ initial: num('initial'), topup: num('topup'), months, effAnnual: rate, taxRate: tax, taxFreeLimit: rates.depositTax.taxFreeLimit });
  const yNet = currentYieldNet({ face: num('face'), pricePct: num('pricePct'), coupon: num('coupon'), accrued: num('accrued'), taxRate: tax });
  const warns = [];
  if (yNet > rates.keyRate.value / 100 * 1.6) warns.push('Доходность заметно выше ключевой ставки: это плата за кредитный риск. Проверьте рейтинг, отчётность, ковенанты и амортизацию выпуска.');
  if (b.rows.at(-1).cash > num('face')) warns.push('Часть денег осталась в кэше: не хватает на целую бумагу.');
  $('warn').innerHTML = warns.map((w) => `<p>${w}</p>`).join('');
  const diff = b.equity - d.equity;
  $('kpis').innerHTML = [
    ['Итог по облигации', rub(b.equity), ''], ['Итог по вкладу', rub(d.equity), ''],
    ['Разница', rub(diff), diff >= 0 ? 'good' : 'bad'], ['Внесено', rub(b.contributed), ''],
    ['Чистая доходность бумаги, год', pct(yNet), ''], ['Годовая доходность плана (IRR)', pct(b.annualReturn), ''],
    ['Ставка вклада (эфф.)', rate.toFixed(2) + ' %', ''], ['Комиссии за период', rub(b.fees), ''], ['Налоги за период', rub(b.taxes), ''],
  ].map(([t, v, c]) => `<div class="k"><small>${t}</small><b class="${c}">${v}</b></div>`).join('');
  chart(b.rows, d.rows);
  $('tbl').innerHTML = '<tr><th>Мес.</th><th>Внесено</th><th>Бумаг</th><th>Кэш</th><th>Купоны (чист.)</th><th>Капитал</th></tr>' +
    b.rows.map((r) => `<tr><td>${r.month}</td><td>${rub(r.contributed)}</td><td>${r.qty}</td><td>${rub(r.cash)}</td><td>${rub(r.couponNet)}</td><td>${rub(r.equity)}</td></tr>`).join('');
}

function chart(a, d) {
  const all = [...a, ...d].map((r) => r.equity).concat(a.map((r) => r.contributed));
  const lo = Math.min(...all), hi = Math.max(...all), n = a.length - 1;
  const X = (i) => 10 + (580 * i) / n, Y = (v) => 245 - (230 * (v - lo)) / (hi - lo || 1);
  const path = (arr, k) => arr.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(r[k]).toFixed(1)}`).join('');
  $('chart').innerHTML = `<path d="${path(a, 'contributed')}" stroke="#9fb0d9" fill="none" stroke-dasharray="4 4"/><path d="${path(d, 'equity')}" stroke="#fbbf24" fill="none" stroke-width="2.5"/><path d="${path(a, 'equity')}" stroke="#7aa2ff" fill="none" stroke-width="3"/>`;
}

function calcRisk() {
  const num = (id) => parseFloat($(id).value) || 0;
  const inst = $('inst').value, ok = fees.crypto.okx;
  const f = ok[inst === 'swap' ? 'swap' : 'spot'][$('ordType').value];
  const r = riskPlan({ direction: $('dir').value, entry: num('entry'), atr: num('atr'), equity: num('equity'), riskPct: num('riskPct'), stopK: num('stopK'), tpK: num('tpK'), leverage: num('lev') || 1, feeRate: f, instrument: inst, fundingRate8h: ok.fundingRate8h, borrowDaily: ok.borrowDailyUSDT, holdHours: num('hold') });
  const items = [['Стоп', usd(r.stop)], ['Тейк', usd(r.tp)], ['Объём, шт.', usd(r.qty)], ['Позиция, $', usd(r.notional)], ['Маржа, $', usd(r.margin)],
    ['Убыток по стопу, $', usd(r.lossNet)], ['Прибыль по тейку, $', usd(r.rewardNet)], ['R:R после затрат', r.rrNet.toFixed(2)], ['Безубыток', usd(r.breakeven)],
    ['Комиссия за круг, %', (f * 200).toFixed(3)], ['Удержание, $', usd(r.carry)]];
  $('riskOut').innerHTML = items.map(([t, v]) => `<div class="k"><small>${t}</small><b>${v}</b></div>`).join('') +
    (r.capped ? '<p class="warn">Размер ограничен капиталом и плечом: риск меньше заданного.</p>' : '') +
    (r.stopTooCloseToLiq ? '<p class="bad">Стоп слишком близко к ликвидации при таком плече.</p>' : '');
}

function info() {
  const v = (x) => (x ? ' <span class="warn">(проверить)</span>' : '');
  $('infoBox').innerHTML = `<ul><li>Ключевая ставка ЦБ: <b>${rates.keyRate.value}%</b> на ${rates.keyRate.asOf}, следующее заседание ${rates.keyRate.nextMeeting}.</li>
  <li>Средняя макс. ставка по вкладам топ-10 банков: <b>${rates.depositAvgMax.all}%</b> (${rates.depositAvgMax.asOf}); спред к ключевой: <b>${(rates.depositAvgMax.all - rates.keyRate.value).toFixed(2)} п.п.</b></li>
  <li>OKX спот: maker ${fees.crypto.okx.spot.maker * 100}%, taker ${fees.crypto.okx.spot.taker * 100}%; своп: maker ${fees.crypto.okx.swap.maker * 100}%, taker ${fees.crypto.okx.swap.taker * 100}%${v(fees.crypto.okx.swap.verify)}.</li>
  <li>Заём USDT на OKX: ${(fees.crypto.okx.borrowDailyUSDT * 100).toFixed(4)}% в сутки.</li>
  <li>Брокеры: ${fees.brokers.map((b) => b.name + v(b.verify)).join('; ')}.</li>
  <li>Обновлено: тарифы ${fees.updated}, ставки ${rates.updated}.</li></ul><p class="hint">Графики: TradingView Lightweight Charts (Apache 2.0), потребуется указание TradingView как автора на странице при подключении.</p>`;
}

(async () => {
  [fees, rates] = await Promise.all([load('config/fees.json'), load('config/rates.json')]);
  $('broker').innerHTML = fees.brokers.map((b) => `<option value="${b.id}">${b.name}</option>`).join('');
  $('broker').onchange = applyBroker; applyBroker();
  $('spread').placeholder = (rates.depositAvgMax.all - rates.keyRate.value).toFixed(2);
  $('calc').onclick = calcBonds; $('calc2').onclick = calcRisk;
  calcBonds(); calcRisk(); info();
})();
