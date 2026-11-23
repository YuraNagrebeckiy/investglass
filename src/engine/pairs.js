import { ema, last } from './indicators.js';

export const WORLD = [
  { id: 'EURUSD', name: 'EUR/USD', sym: 'EUR', inv: true, desc: 'Евро к доллару' },
  { id: 'USDJPY', name: 'USD/JPY', sym: 'JPY', inv: false, desc: 'Доллар к иене' },
  { id: 'GBPUSD', name: 'GBP/USD', sym: 'GBP', inv: true, desc: 'Фунт к доллару' },
  { id: 'USDCNY', name: 'USD/CNY', sym: 'CNY', inv: false, desc: 'Доллар к юаню' },
  { id: 'USDCHF', name: 'USD/CHF', sym: 'CHF', inv: false, desc: 'Доллар к франку' },
  { id: 'AUDUSD', name: 'AUD/USD', sym: 'AUD', inv: true, desc: 'Австралийский доллар к доллару' },
  { id: 'USDCAD', name: 'USD/CAD', sym: 'CAD', inv: false, desc: 'Доллар к канадскому' },
];
export const SYMBOLS = WORLD.map((p) => p.sym);

export function parseFrankfurter(js) {
  const days = new Map();
  const put = (date, sym, rate) => { if (!date || !sym || !(rate > 0)) return; const d = days.get(date) || {}; d[sym] = rate; days.set(date, d); };
  const rates = js && js.rates;
  if (rates && !Array.isArray(rates)) for (const [date, r] of Object.entries(rates)) for (const [s, v] of Object.entries(r)) put(date, s, v);
  const rows = Array.isArray(js) ? js : Array.isArray(rates) ? rates : [];
  for (const r of rows) put(r.date, r.quote || r.currency, r.rate);
  return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, r]) => ({ date, rates: r }));
}

export function pairSeries(days, pair) {
  return days.filter((d) => d.rates[pair.sym] > 0).map((d) => {
    const r = d.rates[pair.sym], c = pair.inv ? 1 / r : r;
    return { t: Math.floor(Date.parse(d.date + 'T12:00:00Z') / 1000), o: c, h: c, l: c, c, v: 0 };
  });
}

const L = (v, hi, lo) => (hi ? 'red' : lo ? 'green' : 'gray');

export function indicatorList(cs, v) {
  const c = cs.map((x) => x.c), px = last(c);
  const e20 = last(ema(c, 20)), e50 = last(ema(c, 50)), e200 = last(ema(c, 200));
  const rets = [];
  for (let i = 1; i < c.length; i++) rets.push(Math.log(c[i] / c[i - 1]));
  const m = rets.reduce((s, x) => s + x, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length || 1)) || 1e-9;
  const n = 22, ch = c.length > n ? px / c[c.length - 1 - n] - 1 : 0, z30 = ch / (sd * Math.sqrt(n));
  const up = px > e20 && e20 > e50 && e50 > e200, down = px < e20 && e20 < e50 && e50 < e200;
  const flat = cs.every((x) => x.h === x.l);
  return [
    { key: 'range', name: 'Положение в годовом диапазоне', value: `выше ${v.pctile.toFixed(0)} % значений`, light: L(0, v.pctile >= 90, v.pctile <= 10), hint: 'Красный: цена у верхней границы года. Зелёный: у нижней.' },
    { key: 'z', name: 'Отклонение от среднего за год', value: `${v.z.toFixed(1)} σ`, light: L(0, v.z >= 1.5, v.z <= -1.5), hint: 'Больше +1,5σ считается сильным перекосом вверх, меньше −1,5σ вниз.' },
    { key: 'rsi', name: 'RSI (14 дней)', value: v.rsi.toFixed(0), light: L(0, v.rsi >= 70, v.rsi <= 30), hint: 'Выше 70 рост перегрет, ниже 30 падение перегрето.' },
    { key: 'e50', name: 'Цена к средней EMA 50', value: `${((px / e50 - 1) * 100).toFixed(1)} %`, light: L(0, px >= e50 * 1.03, px <= e50 * 0.97), hint: 'Отрыв от средней более чем на 3 % обычно сменяется возвратом.' },
    { key: 'trend', name: 'Тренд (EMA 20, 50, 200)', value: up ? 'вверх' : down ? 'вниз' : 'без тренда', light: up || down ? 'blue' : 'gray', hint: 'Синий: средние выстроены в одну сторону, тренд подтверждён.' },
    { key: 'mom', name: 'Изменение за месяц', value: `${(ch * 100).toFixed(1)} % (${z30.toFixed(1)} σ)`, light: L(0, z30 >= 1.5, z30 <= -1.5), hint: 'Сравнивается с обычной волатильностью пары: сильный месячный рывок отмечается цветом.' },
    { key: 'candle', name: 'Свечной сигнал', value: flat ? 'нет данных' : v.bullConfirm ? 'бычий разворот' : v.bearConfirm ? 'медвежий разворот' : 'нет', light: flat ? 'gray' : v.bullConfirm ? 'green' : v.bearConfirm ? 'red' : 'gray', hint: 'Для пар с дневными курсами ЕЦБ свечи недоступны, нужны цены открытия, максимума и минимума.' },
  ];
}

export const DRIVERS = {
  USD: { up: ['Падение цен на нефть и экспортной выручки', 'Покупки валюты Минфином по бюджетному правилу', 'Снижение ключевой ставки Банка России', 'Рост спроса импортёров, особенно в конце года', 'Усиление санкций и геополитической напряжённости', 'Укрепление доллара на мировом рынке'], down: ['Рост цен на нефть и газ', 'Продажи экспортной выручки, в том числе перед налоговыми платежами', 'Высокая ключевая ставка и интерес к рублёвым активам', 'Смягчение геополитики', 'Ослабление доллара на мировом рынке'] },
  EUR: { up: ['Рост EUR/USD: слабый доллар, ставки ЕЦБ выше ожиданий, сильные данные еврозоны', 'Ослабление рубля к доллару', 'Падение нефти и рост спроса на валюту'], down: ['Укрепление доллара на мировом рынке, жёсткая позиция ФРС', 'Укрепление рубля', 'Слабые данные и риски рецессии в еврозоне'] },
  CNY: { up: ['Ослабление рубля к доллару', 'Укрепление юаня к доллару: политика Народного банка Китая, торговый профицит', 'Рост спроса на юань для расчётов с Китаем и покупок Банка России по поручению Минфина'], down: ['Укрепление рубля', 'Ослабление юаня: слабые данные Китая, торговые ограничения', 'Рост продаж юаней экспортёрами'] },
  EURUSD: { up: ['Ожидание смягчения ФРС и падение доходности казначейских облигаций США', 'Ставки ЕЦБ выше ожиданий рынка', 'Слабые данные США и аппетит к риску'], down: ['Ожидание повышения ставки ФРС и рост индекса доллара', 'Слабый рост и энергетические риски в еврозоне', 'Бегство в безопасные активы'] },
  USDJPY: { up: ['Рост доходности казначейских облигаций США', 'Большой разрыв ставок США и Японии, керри-трейд', 'Мягкая позиция Банка Японии'], down: ['Бегство в безопасные активы: иена укрепляется в периоды стресса', 'Повышение ставки Банка Японии', 'Интервенции Минфина Японии и их ожидание'] },
  GBPUSD: { up: ['Инфляция в Великобритании выше ожиданий и жёсткий Банк Англии', 'Слабый доллар', 'Сильные данные по занятости и росту'], down: ['Сильный доллар и рост ставок США', 'Фискальная и политическая неопределённость в Великобритании', 'Слабая экономика и снижение ставок Банка Англии'] },
  USDCNY: { up: ['Ослабление юаня: слабые данные Китая, торговые пошлины', 'Укрепление доллара', 'Отток капитала из Китая'], down: ['Поддержка юаня Народным банком Китая через фиксинг', 'Торговый профицит Китая', 'Ослабление доллара'] },
  USDCHF: { up: ['Рост доллара и ставок США', 'Снижение спроса на безопасные активы'], down: ['Бегство в безопасные активы: франк укрепляется в кризисы', 'Ожидание снижения ставок ФРС', 'Слабые данные США'] },
  AUDUSD: { up: ['Рост цен на сырьё и железную руду', 'Аппетит к риску и восстановление Китая', 'Слабый доллар'], down: ['Бегство от риска', 'Слабые данные Китая и падение сырья', 'Сильный доллар'] },
  USDCAD: { up: ['Падение цен на нефть', 'Сильный доллар', 'Смягчение Банка Канады'], down: ['Рост цен на нефть', 'Жёсткий Банк Канады', 'Слабый доллар'] },
};

export const NEWS_Q = {
  USD: '(доллар OR "курс доллара") рубль sourcelang:russian', EUR: '(евро OR "курс евро") рубль sourcelang:russian', CNY: '(юань OR "курс юаня") рубль sourcelang:russian',
  EURUSD: '("EUR/USD" OR "euro dollar") sourcelang:english', USDJPY: '("USD/JPY" OR "Japanese yen") sourcelang:english', GBPUSD: '("GBP/USD" OR "pound sterling") sourcelang:english',
  USDCNY: '("USD/CNY" OR yuan OR renminbi) sourcelang:english', USDCHF: '("USD/CHF" OR "Swiss franc") sourcelang:english', AUDUSD: '("AUD/USD" OR "Australian dollar") sourcelang:english', USDCAD: '("USD/CAD" OR "Canadian dollar") sourcelang:english',
};
