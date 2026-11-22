const body = (c) => Math.abs(c.c - c.o), rng = (c) => c.h - c.l;
const top = (c) => Math.max(c.o, c.c), bot = (c) => Math.min(c.o, c.c);
const bull = (c) => c.c > c.o, bear = (c) => c.c < c.o;
const upS = (c) => c.h - top(c), loS = (c) => bot(c) - c.l;

function avgBody(cs, i, n = 14) {
  let s = 0, k = 0;
  for (let j = Math.max(0, i - n); j < i; j++) { s += body(cs[j]); k++; }
  return k ? s / k : body(cs[i]);
}

function trendAt(cs, i, n = 6) {
  if (i < n) return 0;
  const a = avgBody(cs, i), d = cs[i - 1].c - cs[i - n].c;
  return d > a ? 1 : d < -a ? -1 : 0;
}

const mk = (i, key, name, dir, idea, level) => ({ i, key, name, dir, idea, level });

export function detectAt(cs, i) {
  const out = [], c = cs[i];
  if (!c || !(rng(c) > 0)) return out;
  const r = rng(c), b = body(c), ab = avgBody(cs, i) || b, t1 = trendAt(cs, i);
  const add = (...a) => out.push(mk(i, ...a));
  const doji = b <= 0.1 * r;
  if (doji) add('doji', 'Дожи', 'neutral', 'Равновесие быков и медведей. Сам по себе нейтрален, ждите подтверждающую свечу.', null);
  else if (b <= 0.3 * r && upS(c) >= b && loS(c) >= b) add('spinning', 'Волчок', 'neutral', 'Малое тело и тени с обеих сторон: рынок в неопределённости, возможна пауза.', null);
  if (!doji && loS(c) >= 2 * b && upS(c) <= 0.1 * r) {
    if (t1 < 0) add('hammer', 'Молот', 'bull', 'После падения продавцы выдохлись, цена вернулась от минимума. Подтверждение: следующая свеча закрывается выше максимума молота.', c.h);
    else if (t1 > 0) add('hanging', 'Повешенный', 'bear', 'После роста длинная нижняя тень: покупатели слабеют. Подтверждение: следующая свеча закрывается ниже минимума.', c.l);
  }
  if (!doji && upS(c) >= 2 * b && loS(c) <= 0.1 * r) {
    if (t1 < 0) add('invhammer', 'Перевёрнутый молот', 'bull', 'Возможный разворот вверх. Нужно подтверждение: открытие выше тела и зелёная свеча следом.', c.h);
    else if (t1 > 0) add('shooting', 'Падающая звезда', 'bear', 'После роста длинная верхняя тень: рост выкупают продавцы. Подтверждение: закрытие ниже минимума свечи.', c.l);
  }
  if (b >= 1.5 * ab) {
    if (bull(c) && loS(c) <= 0.05 * r && t1 < 0) add('belt_bull', 'Бычий захват за пояс', 'bull', 'Открытие на минимуме и уверенный рост: покупатели перехватили инициативу. Чем длиннее свеча, тем сильнее сигнал.', c.h);
    if (bear(c) && upS(c) <= 0.05 * r && t1 > 0) add('belt_bear', 'Медвежий захват за пояс', 'bear', 'Открытие на максимуме и уверенное падение: инициатива у продавцов.', c.l);
  }
  if (i >= 1) {
    const p = cs[i - 1], t2 = trendAt(cs, i - 1), pb = body(p), mid = (p.o + p.c) / 2;
    if (bear(p) && bull(c) && c.o <= p.c && c.c >= p.o && b > pb && t2 < 0) add('engulf_bull', 'Бычье поглощение', 'bull', 'Зелёное тело поглотило красное после падения: разворот вверх. Сильнее, если вторая свеча на большом объёме.', Math.max(c.h, p.h));
    if (bull(p) && bear(c) && c.o >= p.c && c.c <= p.o && b > pb && t2 > 0) add('engulf_bear', 'Медвежье поглощение', 'bear', 'Красное тело поглотило зелёное после роста: разворот вниз.', Math.min(c.l, p.l));
    if (bear(p) && pb >= ab && bull(c) && c.o < p.c && c.c > mid && c.c < p.o && t2 < 0) add('piercing', 'Просвет в облаках', 'bull', 'Зелёная свеча перекрыла больше половины красной: бычий разворот. Идеально, если закрытие выше середины красного тела.', p.o);
    if (bull(p) && pb >= ab && bear(c) && c.o > p.c && c.c < mid && c.c > p.o && t2 > 0) add('dark_cloud', 'Завеса из тёмных облаков', 'bear', 'Красная свеча открылась выше и закрылась ниже середины зелёной: сигнал вершины.', p.o);
    if (pb >= 1.5 * ab && top(c) <= top(p) && bot(c) >= bot(p) && b <= 0.5 * pb && (doji || bull(p) !== bull(c))) {
      if (bear(p) && t2 < 0) add(doji ? 'harami_cross_bull' : 'harami_bull', doji ? 'Крест харами (бычий)' : 'Харами (бычье)', 'bull', 'Малая свеча внутри длинной красной: падение остановилось, рынок на паузе. Крест харами значимее.', p.h);
      if (bull(p) && t2 > 0) add(doji ? 'harami_cross_bear' : 'harami_bear', doji ? 'Крест харами (медвежий)' : 'Харами (медвежье)', 'bear', 'Малая свеча внутри длинной зелёной: рост остановился, возможен разворот.', p.l);
    }
  }
  if (i >= 2) {
    const a = cs[i - 2], m = cs[i - 1], t3 = trendAt(cs, i - 2), ab3 = avgBody(cs, i - 2) || body(a), mb = body(m), midA = (a.o + a.c) / 2;
    const star = body(a) >= ab3 && mb <= 0.3 * body(a), dj = mb <= 0.1 * rng(m) || rng(m) === 0;
    if (star && bear(a) && t3 < 0 && top(m) < a.c && bull(c) && c.c > midA) {
      const baby = dj && m.h < a.l && c.l > m.h;
      add(baby ? 'baby_bull' : dj ? 'morning_doji' : 'morning', baby ? 'Брошенный младенец (основание)' : dj ? 'Утренняя звезда дожи' : 'Утренняя звезда', 'bull', 'Красная свеча, пауза и зелёная свеча, перекрывшая её тело: быки перехватили инициативу. Сильнее при разрывах между телами.', Math.max(a.h, c.h));
    }
    if (star && bull(a) && t3 > 0 && bot(m) > a.c && bear(c) && c.c < midA) {
      const baby = dj && m.l > a.h && c.h < m.l;
      add(baby ? 'baby_bear' : dj ? 'evening_doji' : 'evening', baby ? 'Брошенный младенец (вершина)' : dj ? 'Вечерняя звезда дожи' : 'Вечерняя звезда', 'bear', 'Зелёная свеча, пауза и красная свеча, перекрывшая её тело: сигнал разворота на вершине.', Math.min(a.l, c.l));
    }
    if (bear(a) && bear(m) && bear(c) && m.c < a.c && c.c < m.c && m.o < a.o && m.o > a.c && c.o < m.o && c.o > m.c && loS(c) <= 0.25 * body(c) && t3 > 0) add('three_crows', 'Три чёрные вороны', 'bear', 'Три красные свечи подряд с закрытием у минимумов после роста: предвестник падения.', c.h);
    if (bull(a) && bull(m) && bull(c) && m.c > a.c && c.c > m.c && m.o > a.o && m.o < a.c && c.o > m.o && c.o < m.c && upS(c) <= 0.25 * body(c) && t3 < 0) add('three_soldiers', 'Три белых солдата', 'bull', 'Три зелёные свечи подряд с закрытием у максимумов после падения: зеркальный к воронам сигнал роста.', c.l);
    if (bull(a) && body(a) >= ab3 && bear(m) && bot(m) > top(a) && bear(c) && c.o > m.o && c.c < m.c && c.c > a.c && t3 > 0) add('two_crows', 'Две взлетевшие вороны', 'bear', 'После роста две красные свечи, вторая поглощает первую: медвежий сигнал.', c.h);
  }
  return out;
}

export function detectAll(cs, last = 80) {
  const out = [];
  for (let i = Math.max(0, cs.length - last); i < cs.length; i++) out.push(...detectAt(cs, i));
  return out;
}

export function candleLight(patterns, n, dir) {
  const recent = patterns.filter((p) => p.i >= n - 3 && p.dir !== 'neutral');
  const want = dir === 'short' ? 'bear' : 'bull';
  const ok = recent.some((p) => p.dir === want), bad = recent.some((p) => p.dir !== want);
  return ok && !bad ? 'green' : bad && !ok ? 'red' : 'yellow';
}
