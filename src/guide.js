import { soundOn, play } from './ui.js';
import { setHelp, helpOn } from './glossary.js';
import { setTheme, themeMode } from './theme.js';

const $ = (id) => document.getElementById(id);
const head = document.querySelector('header');
const cfg = document.createElement('button');
cfg.id = 'cfg'; cfg.className = 'mini'; cfg.title = 'Настройки'; cfg.textContent = '⚙';
if (head) head.insertBefore(cfg, $('theme'));

const STEPS = [
  { t: 'Добро пожаловать в InvestGlass', x: 'Приложение помогает отобрать облигации, посмотреть сигналы по акциям и крипте, следить за валютами и вести журнал сделок. Это не инвестиционная рекомендация, все решения вы принимаете сами. Давайте за минуту пройдём главные шаги.' },
  { sel: '#tabs', t: 'Разделы приложения', x: 'Сверху вкладки: Облигации, Валюты, Анализ, Журнал, Риск и Данные. Нажмите на название, чтобы переключиться.' },
  { tab: 'bonds', sel: '#bLoad', t: 'Шаг 1. Подгрузите базу облигаций', x: 'Нажмите «Подгрузить информацию». Приложение скачает все облигации Мосбиржи и свежие цены. В окне будут видны процент, этап и оставшееся время, а по окончании прозвучит сигнал, если звук включён.' },
  { tab: 'bonds', sel: '#bLive', t: 'Свежие цены', x: 'Эта галочка просит обновить цены и обороты напрямую с биржи. Оставьте её включённой, а если биржа недоступна, приложение возьмёт данные из последней сохранённой копии.' },
  { tab: 'bonds', sel: '#fSteps', alt: '#bLoad', t: 'Шаг 2. Отберите бумаги', x: 'После загрузки появится блок отбора: категория (ОФЗ, эшелоны, ВДО), доходность, ликвидность, срок, сектор. Воронка показывает, сколько бумаг осталось после каждого условия. Меняйте условия, пока не останется 5–10 вариантов, затем нажмите на бумагу и выберите «Отобрать».' },
  { tab: 'bonds', sel: '#short', t: 'Шаг 3. Отобранные бумаги', x: 'Здесь лежат выбранные вами облигации и их доли. Ниже рассчитывается рост портфеля со сложным процентом: сумма, пополнения, налог, комиссии брокера и срок.' },
  { tab: 'bonds', sel: '#cal', alt: '#short', t: 'Календарь купонов', x: 'Покажет, когда и сколько денег придёт по выбранным бумагам. Можно сохранить даты в календарь телефона.' },
  { tab: 'fx', sel: '#fxTop', alt: '#fx', t: 'Валюты', x: 'Доллар, евро, юань и мировые пары анализируются сами. Приложение пишет, когда валюта «переоценена» или «недооценена», а по нажатию на пару показывает признаки, причины движения и новости.' },
  { tab: 'scan', sel: '#scanBtn', t: 'Анализ акций и крипты', x: 'Нажмите «Проанализировать всё». В таблице светофор по каждому активу. Нажмите на актив: откроется окно с графиком, индикаторами MACD, EMA, RSI, ATR, планом сделки и риском.' },
  { tab: 'journal', sel: '#jTbl', alt: '#journal', t: 'Журнал сделок', x: 'Сюда записываются ваши входы с ценой, стопом, тейком и состоянием индикаторов, чтобы потом разобрать, что сработало.' },
  { sel: '#cfg', t: 'Настройки и установка', x: 'В настройках можно включить или выключить пояснения, выбрать тему, проверить звуки и заново пройти это обучение. Там же подсказка, как установить приложение на экран телефона.' },
];

let ti = -1, hole, card, dim, onMove, token = 0;
const exists = (s) => {
  let e = s && document.querySelector(s);
  if (!e || !(e.offsetParent !== null || getComputedStyle(e).position === 'fixed')) return null;
  if (e.tagName === 'INPUT' && e.closest('label')) e = e.closest('label');
  return e;
};

function endTour(done = true) {
  [hole, card, dim].forEach((e) => e && e.remove());
  hole = card = dim = null;
  window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true);
  document.removeEventListener('keydown', onKey);
  if (done) localStorage.setItem('ig_tour', 'done');
  ti = -1;
}
function onKey(e) { if (e.key === 'Escape') endTour(); }

function place(target) {
  if (!hole) return;
  if (target) {
    const r = target.getBoundingClientRect(), p = 8;
    Object.assign(hole.style, { left: r.left - p + 'px', top: r.top - p + 'px', width: r.width + 2 * p + 'px', height: r.height + 2 * p + 'px' });
  } else Object.assign(hole.style, { left: '50%', top: '40%', width: '0px', height: '0px' });
}

function show(i) {
  const s = STEPS[i];
  ti = i;
  card.innerHTML = `<h3></h3><p></p><div class="tour-n"><button class="mini" data-a="skip">Пропустить</button><span class="dots">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span><span><button class="mini" data-a="prev" ${i === 0 ? 'disabled' : ''}>Назад</button> <button class="btn sm" data-a="next">${i === STEPS.length - 1 ? 'Готово' : 'Далее'}</button></span></div>`;
  card.querySelector('h3').textContent = s.t;
  card.querySelector('p').textContent = s.x;
  if (s.tab) { const b = document.querySelector(`#tabs button[data-tab="${s.tab}"]`); if (b && !b.classList.contains('on')) b.click(); }
  const run = ++token;
  setTimeout(() => {
    if (run !== token || !hole) return;
    const target = exists(s.sel) || exists(s.alt);
    if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => {
      if (run !== token || !hole) return;
      onMove = () => place(target);
      place(target);
      window.addEventListener('resize', onMove); window.addEventListener('scroll', onMove, true);
    }, target ? 380 : 0);
  }, s.tab ? 330 : 40);
}

export function startTour() {
  if (ti >= 0) return;
  dim = document.createElement('div'); dim.className = 'tour-dim';
  hole = document.createElement('div'); hole.className = 'tour-hole';
  card = document.createElement('div'); card.className = 'tour-card'; card.setAttribute('role', 'dialog');
  document.body.append(dim, hole, card);
  card.addEventListener('click', (e) => {
    const a = e.target.dataset.a;
    if (a === 'skip') endTour();
    if (a === 'prev' && ti > 0) show(ti - 1);
    if (a === 'next') { if (ti >= STEPS.length - 1) { endTour(); const b = document.querySelector('#tabs button[data-tab="bonds"]'); b && b.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); } else show(ti + 1); }
  });
  document.addEventListener('keydown', onKey);
  show(0);
}

function openSettings() {
  let sh = $('cfgSheet');
  if (!sh) { sh = document.createElement('div'); sh.id = 'cfgSheet'; sh.className = 'sheet'; document.body.appendChild(sh); }
  const th = themeMode();
  sh.innerHTML = `<div class="panel" style="max-width:560px"><div class="sh-head"><h2>Настройки</h2><button class="mini" id="cfgX">Закрыть</button></div>
  <div class="set"><div><b>Пояснения сложных слов</b><p>Подчёркнутые слова можно навести или нажать, чтобы увидеть объяснение простым языком.</p></div><label class="sw"><input type="checkbox" id="cfgHelp" ${helpOn() ? 'checked' : ''}><span></span></label></div>
  <div class="set"><div><b>Звук уведомлений</b><p>Сигналы о загрузке, цене, хорошей сделке и развороте.</p></div><label class="sw"><input type="checkbox" id="cfgSnd" ${soundOn() ? 'checked' : ''}><span></span></label></div>
  <div class="row"><button class="mini" data-s="price">Звук цены</button><button class="mini" data-s="deal">Звук хорошей сделки</button><button class="mini" data-s="reversal">Звук разворота</button></div>
  <div class="set"><div><b>Тема</b><p>Светлая, тёмная или как в настройках телефона.</p></div><div class="seg" id="cfgTheme"><button data-v="light" class="${th === 'light' ? 'on' : ''}">Светлая</button><button data-v="dark" class="${th === 'dark' ? 'on' : ''}">Тёмная</button><button data-v="auto" class="${th === 'auto' ? 'on' : ''}">Авто</button></div></div>
  <div class="set"><div><b>Обучение</b><p>Пошаговая подсказка по основным экранам.</p></div><button class="btn sm" id="cfgTour">Пройти заново</button></div>
  <div class="set"><div><b>Профиль</b><p>Журнал, рисунки и планы хранятся отдельно для каждого профиля на этом устройстве.</p></div><button class="btn sm ghost" id="cfgUsr">Открыть</button></div>
  <h3>Установка как приложение</h3>
  <p class="hint"><b>iPhone, Safari:</b> кнопка «Поделиться», затем «На экран Домой». <b>Android, Chrome:</b> меню с тремя точками, затем «Установить приложение». <b>Компьютер, Chrome или Edge:</b> значок установки справа в адресной строке.</p>
  <div class="note">Приложение показывает расчёты и статистические сигналы. Это не индивидуальная инвестиционная рекомендация, все решения и риски остаются на вас.</div></div>`;
  sh.hidden = false;
  sh.querySelector('#cfgX').onclick = () => { sh.hidden = true; };
  sh.querySelector('#cfgHelp').onchange = (e) => setHelp(e.target.checked);
  sh.querySelector('#cfgSnd').onchange = (e) => { localStorage.setItem('ig_sound', e.target.checked ? '1' : '0'); const b = $('snd'); if (b) b.textContent = e.target.checked ? '🔔' : '🔕'; if (e.target.checked) play('price'); };
  sh.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { const was = soundOn(); if (!was) localStorage.setItem('ig_sound', '1'); play(b.dataset.s); if (!was) setTimeout(() => localStorage.setItem('ig_sound', '0'), 1200); }; });
  sh.querySelector('#cfgTheme').onclick = (e) => { const v = e.target.dataset.v; if (!v) return; setTheme(v); sh.querySelectorAll('#cfgTheme button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); };
  sh.querySelector('#cfgTour').onclick = () => { sh.hidden = true; localStorage.removeItem('ig_tour'); startTour(); };
  sh.querySelector('#cfgUsr').onclick = () => { sh.hidden = true; const u = $('usr'); u && u.click(); };
}
cfg.onclick = openSettings;

window.IGGuide = { startTour, openSettings };
if (localStorage.getItem('ig_tour') !== 'done') setTimeout(startTour, 1200);
