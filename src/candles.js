import { chartData, setBand } from './draw.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const body = (c) => Math.abs(c.c - c.o), rng = (c) => (c.h - c.l) || 1e-9, isUp = (c) => c.c > c.o, isDn = (c) => c.c < c.o;
const upS = (c) => c.h - Math.max(c.o, c.c), loS = (c) => Math.min(c.o, c.c) - c.l;
const avgR = (cs, i) => { const a = cs.slice(Math.max(0, i - 13), i + 1); return a.reduce((s, c) => s + rng(c), 0) / a.length; };
const trend = (cs, i, k = 6) => { if (i < k) return 0; const m = (cs[i - 1].c - cs[i - k].c) / avgR(cs, i); return m > 2 ? 1 : m < -2 ? -1 : 0; };
const CONF_UP = 'Подтверждение: следующая свеча закрывается выше максимума сигнальной. Стоп за минимум фигуры.';
const CONF_DN = 'Подтверждение: следующая свеча закрывается ниже минимума сигнальной. Стоп за максимум фигуры.';

function detect(cs, i) {
  const out = [], c = cs[i], p = cs[i - 1], q = cs[i - 2], ar = avgR(cs, i);
  const add = (name, bias, len, why, rec) => out.push({ i, len, name, bias, why, rec });
  const t1 = trend(cs, i);
  if (body(c) <= 0.1 * rng(c) && rng(c) > 0.3 * ar) add('Доджи', 'neutral', 1, 'Открытие и закрытие почти совпали: рынок в нерешительности. После сильного движения это может предвещать разворот.', 'Не торопитесь. Закрытие следующей свечи выше максимума доджи говорит о росте, ниже минимума о снижении.');
  const sm = body(c) >= 0.05 * rng(c);
  if (sm && loS(c) >= 2 * body(c) && upS(c) <= 0.35 * body(c) + 0.05 * rng(c) && rng(c) > 0.5 * ar) {
    if (t1 < 0) add('Молот', 'bull', 1, 'Длинная нижняя тень после падения: продавцы давили, но покупатели вернули цену.', CONF_UP);
    else if (t1 > 0) add('Повешенный', 'bear', 1, 'Длинная нижняя тень после роста: покупатели начинают сдавать позиции.', CONF_DN);
  }
  if (sm && upS(c) >= 2 * body(c) && loS(c) <= 0.35 * body(c) + 0.05 * rng(c) && rng(c) > 0.5 * ar) {
    if (t1 > 0) add('Падающая звезда', 'bear', 1, 'Длинная верхняя тень после роста: покупатели не удержали максимум.', CONF_DN);
    else if (t1 < 0) add('Перевёрнутый молот', 'bull', 1, 'Длинная верхняя тень после падения: покупатели пробуют перехватить инициативу.', CONF_UP);
  }
  if (body(c) >= 0.9 * rng(c) && rng(c) >= 1.2 * ar) add(isUp(c) ? 'Бычий марубозу' : 'Медвежий марубозу', isUp(c) ? 'bull' : 'bear', 1, 'Длинная свеча почти без теней: одна сторона полностью контролировала торги.', 'Сигнал на продолжение движения, но после такой свечи цена часто отдыхает. Входите на откате, а не в погоне.');
  if (p) {
    const tp = trend(cs, i - 1);
    if (c.h < p.h && c.l > p.l) add('Внутренний бар', 'neutral', 2, 'Свеча целиком внутри предыдущей: волатильность сжалась, рынок копит силы.', 'Ждите выхода за границы предыдущей свечи и торгуйте по направлению пробоя.');
    if (isDn(p) && isUp(c) && c.o <= p.c && c.c >= p.o && body(c) > body(p) && tp < 0) add('Бычье поглощение', 'bull', 2, 'Растущая свеча полностью перекрыла предыдущую падающую после снижения.', CONF_UP);
    if (isUp(p) && isDn(c) && c.o >= p.c && c.c <= p.o && body(c) > body(p) && tp > 0) add('Медвежье поглощение', 'bear', 2, 'Падающая свеча полностью перекрыла предыдущую растущую после роста.', CONF_DN);
    const inside = body(p) >= 0.6 * rng(p) && Math.max(c.o, c.c) <= Math.max(p.o, p.c) && Math.min(c.o, c.c) >= Math.min(p.o, p.c) && body(c) < body(p) * 0.6;
    if (inside && isDn(p) && tp < 0) add('Бычье харами', 'bull', 2, 'Маленькая свеча внутри большой падающей: давление продавцов ослабло.', CONF_UP);
    if (inside && isUp(p) && tp > 0) add('Медвежье харами', 'bear', 2, 'Маленькая свеча внутри большой растущей: импульс роста затухает.', CONF_DN);
    if (isDn(p) && isUp(c) && body(p) >= 0.6 * rng(p) && c.o < p.c && c.c > (p.o + p.c) / 2 && c.c < p.o && tp < 0) add('Просвет в облаках', 'bull', 2, 'Рост закрылся выше середины предыдущей падающей свечи.', CONF_UP);
    if (isUp(p) && isDn(c) && body(p) >= 0.6 * rng(p) && c.o > p.c && c.c < (p.o + p.c) / 2 && c.c > p.o && tp > 0) add('Завеса из тёмных облаков', 'bear', 2, 'Падение закрылось ниже середины предыдущей растущей свечи.', CONF_DN);
    if (Math.abs(c.l - p.l) <= 0.1 * ar && isDn(p) && isUp(c) && tp < 0) add('Пинцет по минимумам', 'bull', 2, 'Две свечи подряд не смогли обновить один и тот же минимум.', CONF_UP);
    if (Math.abs(c.h - p.h) <= 0.1 * ar && isUp(p) && isDn(c) && tp > 0) add('Пинцет по максимумам', 'bear', 2, 'Две свечи подряд не смогли обновить один и тот же максимум.', CONF_DN);
  }
  if (p && q) {
    const tq = trend(cs, i - 2);
    if (isDn(q) && body(q) >= 0.6 * rng(q) && body(p) <= 0.3 * body(q) && Math.max(p.o, p.c) <= q.c + 0.1 * ar && isUp(c) && c.c > (q.o + q.c) / 2 && tq < 0) add('Утренняя звезда', 'bull', 3, 'Падение, пауза маленькой свечой и сильный рост выше середины первой свечи.', CONF_UP);
    if (isUp(q) && body(q) >= 0.6 * rng(q) && body(p) <= 0.3 * body(q) && Math.min(p.o, p.c) >= q.c - 0.1 * ar && isDn(c) && c.c < (q.o + q.c) / 2 && tq > 0) add('Вечерняя звезда', 'bear', 3, 'Рост, пауза маленькой свечой и сильное падение ниже середины первой свечи.', CONF_DN);
    const full = [q, p, c].every((x) => body(x) >= 0.5 * rng(x));
    if (full && [q, p, c].every(isUp) && p.c > q.c && c.c > p.c && p.o > q.o && p.o < q.c && c.o > p.o && c.o < p.c) add('Три белых солдата', 'bull', 3, 'Три растущие свечи подряд с ростом закрытий: устойчивое давление покупателей.', 'После трёх сильных свечей возможен откат. Надёжнее входить на коррекциях, стоп под минимум первой свечи.');
    if (full && [q, p, c].every(isDn) && p.c < q.c && c.c < p.c && p.o < q.o && p.o > q.c && c.o < p.o && c.o > p.c) add('Три чёрные вороны', 'bear', 3, 'Три падающие свечи подряд со снижением закрытий: устойчивое давление продавцов.', 'После трёх сильных свечей возможен отскок. Надёжнее входить в Short на отскоках, стоп над максимумом первой свечи.');
  }
  return out;
}

function scan(cs) {
  const res = [];
  for (let i = cs.length - 1; i >= Math.max(2, cs.length - 5); i--) res.push(...detect(cs, i));
  const seen = new Set();
  return res.filter((r) => { const k = r.name; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.i - a.i || b.len - a.len).slice(0, 6);
}
export { scan, detect };

const css = document.createElement('style');
css.textContent = '#cdBox{border-radius:18px;background:var(--kpi);padding:10px 12px;margin:10px 0}#cdBox h3{margin:2px 0 6px}.cd-sum{font-size:13px;margin:4px 0 6px}.cd-l{list-style:none;margin:0;padding:0}.cd-l li{padding:7px 9px;margin:4px 0;border-radius:12px;background:var(--field);border-left:4px solid var(--l4);cursor:pointer;font-size:13px}.cd-l li.bull{border-left-color:var(--ok)}.cd-l li.bear{border-left-color:var(--bad)}.cd-l li b{font-weight:600}.cd-l li small{color:var(--mut);margin-left:6px}.cd-l li p{margin:3px 0 0;color:var(--mut)}.cd-l li em{display:none;margin-top:4px;font-style:normal;color:var(--txt)}.cd-l li.open em{display:block}';
document.head.appendChild(css);

let box = null;
function draw() {
  const cs = chartData();
  if (!box || !box.isConnected) return;
  const list = cs.length > 8 ? scan(cs) : [], n = cs.length;
  const bull = list.filter((x) => x.bias === 'bull').length, bear = list.filter((x) => x.bias === 'bear').length;
  const tf = ((document.querySelector('#shTf .on') || {}).dataset || {}).t || '';
  box.querySelector('.cd-sum').innerHTML = list.length ? `За последние 5 свечей (${esc(tf)}): бычьих сигналов <b class="good">${bull}</b>, медвежьих <b class="bad">${bear}</b>, нейтральных ${list.length - bull - bear}.` : `На последних 5 свечах (${esc(tf)}) выраженных свечных фигур нет.`;
  box.querySelector('.cd-l').innerHTML = list.map((x, k) => {
    const ago = n - 1 - x.i;
    return `<li class="${x.bias}" data-k="${k}"><b>${esc(x.name)}</b><small>${ago === 0 ? 'последняя свеча' : ago + ' св. назад'}</small><p>${esc(x.why)}</p><em>Что делать: ${esc(x.rec)}</em></li>`;
  }).join('');
  box.querySelector('.cd-l').onclick = (e) => {
    const li = e.target.closest('li'); if (!li) return;
    const x = list[+li.dataset.k]; li.classList.toggle('open');
    if (li.classList.contains('open') && x) setBand(cs[Math.max(0, x.i - x.len + 1)].t, cs[x.i].t); else setBand(null);
  };
}
function build() {
  const ch = $('shChart'), sh = $('sheet');
  if (!sh || sh.hidden || !ch || chartData().length < 9) return;
  document.querySelectorAll('#cdBox').forEach((x) => x.remove());
  box = document.createElement('div'); box.id = 'cdBox'; box.setAttribute('data-nogl', '');
  box.innerHTML = '<h3>Свечной анализ</h3><div class="cd-sum"></div><ul class="cd-l"></ul><p class="hint">Нажмите на сигнал, чтобы увидеть, что делать, и подсветить свечи на графике. Свечные фигуры дают вероятность, а не гарантию, на малых таймфреймах они часто ложные. Это не инвестиционная рекомендация.</p>';
  const right = document.querySelector('#sheet .sh-right');
  if (right) right.append(box); else ch.after(box);
  draw();
}
document.addEventListener('ig:chart', () => setTimeout(build, 80));
setInterval(() => { if (box && box.isConnected && !box.querySelector('li.open')) draw(); }, 15000);
build();
