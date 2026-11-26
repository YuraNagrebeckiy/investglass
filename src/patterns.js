import { chartData, setBand } from './draw.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mir = (k) => k.map(([x, y]) => [x, 1 - y]);

const BASE = [
  { id: 'dtop', n: 'Двойная вершина', kind: 'Разворот', bias: 'bear', k: [[0, .15], [.18, .9], [.38, .4], [.58, .9], [.8, .35], [1, .12]],
    d: 'Цена дважды упирается в один и тот же уровень и не может его пройти. Покупатели выдыхаются, а после пробоя «шеи», минимума между вершинами, инициативу берут продавцы.',
    r: ['Фигура не подтверждена, пока свеча не закрылась ниже «шеи».', 'Вход в Short или выход из Long после пробоя шеи, надёжнее с ретестом снизу.', 'Стоп ставьте выше второй вершины.', 'Цель: высота фигуры от вершины до шеи, отложенная вниз от пробоя.', 'Объём на пробое должен расти, иначе пробой может быть ложным.'] },
  { id: 'hs', n: 'Голова и плечи', kind: 'Разворот', bias: 'bear', k: [[0, .1], [.12, .6], [.25, .35], [.5, 1], [.75, .35], [.88, .6], [1, .08]],
    d: 'Три вершины, средняя выше соседних. После роста правое плечо не обновляет максимум, сила покупателей иссякает. Линия по минимумам между вершинами называется «шеей».',
    r: ['Ждите закрытия ниже линии шеи, до этого это лишь предположение.', 'Вход в Short после пробоя или после возврата к шее снизу.', 'Стоп выше правого плеча, при агрессивном входе выше головы.', 'Цель: расстояние от головы до шеи, отложенное вниз от пробоя.', 'Падающий объём на правом плече усиливает сигнал.'] },
  { id: 'asc', n: 'Восходящий треугольник', kind: 'Продолжение', bias: 'bull', k: [[0, .1], [.15, .85], [.3, .3], [.45, .85], [.6, .5], [.75, .85], [.88, .68], [1, 1]],
    d: 'Сверху ровное сопротивление, снизу растущие минимумы: покупатели каждый раз выкупают дешевле, цена сжимается к границе. Чаще заканчивается пробоем вверх.',
    r: ['Входите на закрытии выше сопротивления, лучше при росте объёма.', 'Консервативный вход: ретест пробитого уровня сверху.', 'Стоп ставьте под последний растущий минимум.', 'Цель: высота основания треугольника, отложенная вверх от пробоя.', 'Пробой вниз отменяет фигуру: не держите позицию против стопа.'] },
  { id: 'sym', n: 'Симметричный треугольник', kind: 'Нейтральная', bias: 'neutral', k: [[0, .1], [.12, .95], [.3, .15], [.45, .8], [.6, .3], [.72, .65], [.85, .45], [1, .7]],
    d: 'Максимумы снижаются, минимумы растут: диапазон сжимается, как пружина. Направление выхода заранее неизвестно, обычно цена идёт по направлению предыдущего тренда.',
    r: ['Не угадывайте сторону: ждите закрытия за границей фигуры.', 'Вход по направлению пробоя, желательно на росте объёма.', 'Стоп за противоположной границей или за последним экстремумом внутри фигуры.', 'Цель: ширина треугольника в самом широком месте от точки пробоя.', 'Пробой в последней трети фигуры считается слабым, возможна ложь.'] },
  { id: 'bflag', n: 'Бычий флаг', kind: 'Продолжение', bias: 'bull', k: [[0, .05], [.4, .95], [.5, .8], [.58, .88], [.7, .7], [.78, .78], [.9, .62], [1, 1]],
    d: 'Резкий рост («флагшток»), затем короткая пауза в виде небольшого наклонного канала вниз. Рынок отдыхает перед новым рывком.',
    r: ['Вход после пробоя верхней границы флага вверх.', 'Идеальная пауза короткая и на падающем объёме.', 'Стоп под нижней границей флага.', 'Цель: длина флагштока, отложенная вверх от точки пробоя.', 'Если пауза затянулась надолго, сила импульса слабеет.'] },
  { id: 'rwedge', n: 'Растущий клин', kind: 'Разворот', bias: 'bear', k: [[0, .05], [.2, .5], [.3, .35], [.5, .7], [.6, .58], [.8, .85], [.88, .78], [1, .2]],
    d: 'Цена растёт, но каждое движение короче предыдущего, линии сходятся. Рост теряет силу, и пробой вниз часто бывает резким.',
    r: ['Вход в Short только после пробоя нижней границы клина вниз.', 'Не продавайте на росте внутри клина: он может тянуться долго.', 'Стоп выше последнего максимума клина.', 'Цель: возврат к началу клина, где он начал формироваться.', 'Расхождение с RSI на последних вершинах усиливает сигнал.'] },
  { id: 'cup', n: 'Чашка с ручкой', kind: 'Продолжение', bias: 'bull', k: [[0, .9], [.1, .6], [.25, .3], [.45, .15], [.65, .3], [.8, .65], [.9, .9], [.95, .75], [1, 1]],
    d: 'Плавное округлое дно («чашка») и небольшая коррекция у верхнего края («ручка»). Показывает, что продавцы поэтапно закончились, покупатели вернули цену к сопротивлению.',
    r: ['Вход после пробоя верхнего края чашки на объёме.', 'Ручка должна быть неглубокой, не больше трети высоты чашки.', 'Стоп под нижней точкой ручки.', 'Цель: глубина чашки, отложенная вверх от пробоя.', 'V-образная чашка без плавного дна менее надёжна.'] },
  { id: 'chup', n: 'Восходящий канал', kind: 'Продолжение', bias: 'bull', k: [[0, .05], [.15, .3], [.25, .2], [.4, .5], [.5, .4], [.65, .7], [.75, .6], [.9, .9], [1, .82]],
    d: 'Максимумы и минимумы растут между двумя примерно параллельными линиями. Тренд здоровый, пока цена не пробивает нижнюю границу.',
    r: ['Покупайте у нижней границы канала, а не у верхней.', 'Стоп под нижней границей и последним минимумом.', 'Частично фиксируйте прибыль у верхней границы.', 'Пробой нижней границы вниз сигнализирует о смене тренда.', 'Чем больше касаний границ, тем надёжнее канал.'] },
  { id: 'range', n: 'Боковик', kind: 'Нейтральная', bias: 'neutral', k: [[0, .5], [.1, .85], [.25, .2], [.4, .85], [.55, .2], [.7, .85], [.85, .2], [1, .55]],
    d: 'Цена гуляет между горизонтальной поддержкой и сопротивлением: рынок ищет направление. Можно торговать от границ или ждать выхода из диапазона.',
    r: ['Внутри диапазона покупайте у нижней границы, продавайте у верхней, стоп за границей.', 'Для пробойной торговли ждите закрытия за границей с ростом объёма.', 'Не входите в середине диапазона: прибыль к риску там плохая.', 'Цель при пробое: высота диапазона от точки выхода.', 'Чем дольше боковик, тем сильнее движение после выхода.'] },
  { id: 'vrev', n: 'V-образный разворот', kind: 'Разворот', bias: 'bull', k: [[0, .9], [.4, .3], [.5, 0], [.6, .35], [1, .95]],
    d: 'Резкое падение и столь же быстрый возврат. Обычно связан с новостями или выбиванием стопов. Формируется быстро и плохо поддаётся планированию заранее.',
    r: ['Не ловите дно на падении: ждите, пока цена вернётся выше последних максимумов.', 'Вход после подтверждения роста несколькими свечами подряд.', 'Стоп под нижней точкой V.', 'Цель: хотя бы половина падения, затем подтягивайте стоп.', 'Размер позиции уменьшайте: волатильность высокая.'] },
];
const PAIRS = [['dtop', 'dbot', 'Двойное дно', 'bull', 'Зеркало двойной вершины: цена дважды отскакивает от одной поддержки, продавцы выдохлись. Подтверждение даёт пробой «шеи» вверх.', ['Ждите закрытия выше «шеи», до этого фигура не подтверждена.', 'Вход в Long после пробоя или ретеста шеи сверху.', 'Стоп ставьте ниже второго дна.', 'Цель: высота фигуры от дна до шеи, отложенная вверх от пробоя.', 'Рост объёма на пробое подтверждает сигнал.']],
  ['hs', 'ihs', 'Перевёрнутые голова и плечи', 'bull', 'Три минимума, средний ниже соседних: продавцы теряют силу. Линия по максимумам между минимумами, «шея», определяет вход.', ['Ждите закрытия выше шеи.', 'Вход в Long после пробоя или возврата к шее сверху.', 'Стоп ниже правого плеча.', 'Цель: расстояние от головы до шеи, отложенное вверх.', 'Растущий объём на правом плече усиливает сигнал.']],
  ['asc', 'desc', 'Нисходящий треугольник', 'bear', 'Снизу ровная поддержка, сверху снижающиеся максимумы: продавцы давят всё сильнее. Чаще заканчивается пробоем вниз.', ['Входите в Short на закрытии ниже поддержки.', 'Консервативно: ретест пробитого уровня снизу.', 'Стоп выше последнего снижающегося максимума.', 'Цель: высота основания, отложенная вниз от пробоя.', 'Пробой вверх отменяет фигуру.']],
  ['bflag', 'rflag', 'Медвежий флаг', 'bear', 'Резкое падение и короткая пауза в виде небольшого канала вверх. Рынок отдыхает перед продолжением падения.', ['Вход в Short после пробоя нижней границы флага.', 'Пауза должна быть короткой, на падающем объёме.', 'Стоп выше верхней границы флага.', 'Цель: длина флагштока вниз от пробоя.', 'Затяжной флаг ослабляет сигнал.']],
  ['rwedge', 'fwedge', 'Падающий клин', 'bull', 'Цена снижается, но каждое движение короче предыдущего: продавцы выдыхаются. Часто ведёт к пробою вверх.', ['Вход в Long после пробоя верхней границы клина.', 'Не покупайте внутри клина: он может долго давить.', 'Стоп ниже последнего минимума клина.', 'Цель: возврат к началу клина.', 'Расхождение с RSI на последних минимумах усиливает сигнал.']],
  ['chup', 'chdn', 'Нисходящий канал', 'bear', 'Максимумы и минимумы снижаются между параллельными линиями. Тренд вниз, пока цена не пробьёт верхнюю границу.', ['Продавайте у верхней границы, а не у нижней.', 'Стоп выше верхней границы и последнего максимума.', 'Частично фиксируйте прибыль у нижней границы.', 'Пробой верхней границы сигнализирует о смене тренда.', 'Чем больше касаний границ, тем надёжнее канал.']],
  ['vrev', 'vtop', 'V-образная вершина', 'bear', 'Резкий рост и такой же быстрый возврат. Часто следует за новостным всплеском. Заранее планируется плохо.', ['Не шортите на росте: ждите, пока цена опустится ниже последних минимумов.', 'Вход в Short после подтверждения снижения несколькими свечами.', 'Стоп выше пика.', 'Цель: хотя бы половина роста, затем подтягивайте стоп.', 'Размер позиции уменьшайте: волатильность высокая.']]];
const LIB = [...BASE];
for (const [src, id, n, bias, d, r] of PAIRS) { const b = BASE.find((x) => x.id === src); LIB.push({ id, n, kind: b.kind, bias, k: mir(b.k), d, r }); }

const NS = 40;
const sample = (k) => Array.from({ length: NS }, (_, i) => { const x = i / (NS - 1); let j = 0; while (j < k.length - 2 && k[j + 1][0] < x) j++; const [x0, y0] = k[j], [x1, y1] = k[j + 1]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1); });
const resample = (a, n) => Array.from({ length: n }, (_, i) => { const x = (i * (a.length - 1)) / (n - 1), lo = Math.floor(x), hi = Math.min(a.length - 1, lo + 1); return a[lo] + (a[hi] - a[lo]) * (x - lo); });
const zn = (a) => { const m = a.reduce((s, x) => s + x, 0) / a.length, sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length) || 1; return a.map((x) => (x - m) / sd); };
const corr = (a, b) => { const x = zn(a), y = zn(b); return x.reduce((s, v, i) => s + v * y[i], 0) / x.length; };
const TPL = LIB.map((p) => ({ ...p, y: sample(p.k) }));

function rank(cs) {
  const c = cs.map((x) => x.c), res = [];
  const wins = [30, 45, 60, 80, 100, 130, 160, 200].filter((w) => w <= c.length);
  if (!wins.length) return [];
  for (const p of TPL) {
    let best = { r: -2, w: 0 };
    for (const w of wins) { const r = corr(resample(c.slice(-w), NS), p.y); if (r > best.r) best = { r, w }; }
    res.push({ p, r: best.r, w: best.w });
  }
  return res.sort((a, b) => b.r - a.r).slice(0, 6);
}

const css = document.createElement('style');
css.textContent = '#patBox{border-radius:18px;background:var(--kpi);padding:10px 12px;margin:10px 0;outline:0}.pat-top{display:flex;align-items:center;gap:8px}.pat-top .mini{flex:none;min-width:38px;min-height:38px}.pat-t{flex:1;text-align:center;min-width:0}.pat-t b{display:block;font:600 16px var(--head)}.pat-t small{color:var(--mut);font-size:12px}.pat-fig svg{display:block;width:100%;height:104px;margin:6px 0 2px;background:none}.pat-dots{display:flex;justify-content:center;gap:5px;margin:2px 0 6px}.pat-dots i{width:7px;height:7px;border-radius:50%;background:var(--l3);cursor:pointer}.pat-dots i.on{background:var(--acc);width:18px;border-radius:5px}.pat-d{font-size:13px;margin:4px 0}.pat-r{list-style:none;margin:6px 0;padding:0}.pat-r li{font-size:13px;padding:5px 9px;margin:3px 0;border-radius:10px;color:var(--mut);transition:background .3s,color .3s}.pat-r li.on{background:var(--field);color:var(--txt);font-weight:600}.pat-lg{font-size:11px;color:var(--mut)}.pat-lg i{display:inline-block;width:16px;height:0;border-top:2px solid;margin:0 4px 3px 10px;vertical-align:middle}.pat-act{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between}';
document.head.appendChild(css);

let S = null;
function colOf(b) { return b === 'bull' ? 'var(--ok)' : b === 'bear' ? 'var(--bad)' : 'var(--l4)'; }
function fig(s) {
  const m = s.list[s.i], W = 320, H = 100, pad = 6;
  const X = (i) => pad + ((W - 2 * pad) * i) / (NS - 1), Y = (v) => H - pad - (H - 2 * pad) * v;
  const line = (a) => a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const c = resample(s.closes.slice(-m.w), NS), lo = Math.min(...c), hi = Math.max(...c), cn = c.map((v) => (v - lo) / (hi - lo || 1));
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${line(m.p.y)}" fill="none" stroke="${colOf(m.p.bias)}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><path d="${line(cn)}" fill="none" stroke="var(--info)" stroke-width="2" stroke-dasharray="5 4"/></svg>`;
}
function show() {
  const s = S; if (!s || !s.box.isConnected) return;
  const m = s.list[s.i], pct = Math.max(0, Math.min(99, Math.round(m.r * 100)));
  const bias = { bull: 'бычий', bear: 'медвежий', neutral: 'нейтральный' }[m.p.bias];
  s.box.querySelector('.pat-t').innerHTML = `<b>${esc(m.p.n)}</b><small>${esc(m.p.kind)} · ${bias} · сходство ${pct}% · ${s.i + 1} из ${s.list.length}</small>`;
  s.box.querySelector('.pat-fig').innerHTML = fig(s) + `<div class="pat-lg"><i style="border-color:${colOf(m.p.bias)}"></i>эталон<i style="border-color:var(--info);border-top-style:dashed"></i>ваш график, ${m.w} свечей</div>`;
  s.box.querySelector('.pat-dots').innerHTML = s.list.map((_, k) => `<i data-k="${k}" class="${k === s.i ? 'on' : ''}"></i>`).join('');
  s.box.querySelector('.pat-d').textContent = m.p.d + (pct < 60 ? ' Явного совпадения сейчас нет, это лишь ближайшая по форме фигура.' : '');
  s.box.querySelector('.pat-r').innerHTML = m.p.r.map((t, k) => `<li class="${k === s.j ? 'on' : ''}">${esc(t)}</li>`).join('');
  const d = s.cs;
  if (d.length >= m.w) setBand(d[d.length - m.w].t, d[d.length - 1].t);
}
function step(dlt) { if (!S) return; S.i = (S.i + dlt + S.list.length) % S.list.length; S.j = 0; show(); }
function tickRec() {
  if (!S || !S.box.isConnected) { if (S) clearInterval(S.timer); return; }
  if (!S.auto || Date.now() < S.hold) return;
  S.j = (S.j + 1) % S.list[S.i].p.r.length;
  S.box.querySelectorAll('.pat-r li').forEach((li, k) => li.classList.toggle('on', k === S.j));
}

function build() {
  const sheet = $('sheet'), ch = $('shChart');
  if (!sheet || sheet.hidden || !ch) return;
  const cs = chartData();
  if (cs.length < 35) return;
  if (S) clearInterval(S.timer);
  document.querySelectorAll('#patBox').forEach((x) => x.remove());
  const list = rank(cs);
  const box = document.createElement('div');
  box.id = 'patBox'; box.tabIndex = 0; box.setAttribute('data-nogl', '');
  box.innerHTML = '<div class="pat-top"><button class="mini" data-s="-1" aria-label="Предыдущая">‹</button><div class="pat-t"></div><button class="mini" data-s="1" aria-label="Следующая">›</button></div><div class="pat-fig"></div><div class="pat-dots"></div><p class="pat-d"></p><ul class="pat-r"></ul><div class="pat-act"><label class="chk"><input type="checkbox" id="patAuto" checked> Подсказки меняются сами</label><button class="btn sm ghost" id="patRisk">К рискам</button></div><p class="hint">Колесо мыши или стрелки листают фигуры, на телефоне проведите по рисунку вбок. Сходство считается по форме последних свечей и не является прогнозом.</p>';
  const anchor = ch.nextElementSibling && ch.nextElementSibling.tagName === 'P' ? ch.nextElementSibling : ch;
  anchor.after(box);
  S = { box, list, cs, closes: cs.map((x) => x.c), i: 0, j: 0, auto: true, hold: 0, timer: setInterval(tickRec, 4200), wheel: 0 };
  const hold = () => { S.hold = Date.now() + 9000; };
  box.addEventListener('wheel', (e) => { e.preventDefault(); const n = Date.now(); if (n - S.wheel < 220) return; S.wheel = n; step(e.deltaY > 0 ? 1 : -1); hold(); }, { passive: false });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]'), d = e.target.closest('[data-k]');
    if (b) { step(+b.dataset.s); hold(); } else if (d) { S.i = +d.dataset.k; S.j = 0; show(); hold(); }
    const li = e.target.closest('.pat-r li');
    if (li) { S.j = [...li.parentNode.children].indexOf(li); show(); hold(); }
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); } if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); } });
  let sx = null;
  box.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; hold(); }, { passive: true });
  box.addEventListener('touchend', (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1); }, { passive: true });
  box.addEventListener('mouseenter', hold); box.addEventListener('mousemove', hold);
  $('patAuto').onchange = (e) => { S.auto = e.target.checked; };
  $('patRisk').onclick = () => { const t = $('pEq'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  show();
}

document.addEventListener('ig:chart', () => setTimeout(build, 60));
build();
