const IND = {
  macd: { text: 'Показывает, набирает ли движение силу. Считается как разница двух скользящих средних цены. Столбики гистограммы выше нуля и растут: покупатели усиливаются. Ниже нуля и растут вниз: сильнее продавцы. Зелёный: импульс в сторону вашей сделки. Жёлтый: импульс затухает. Красный: импульс против сделки.' },
  ema: { text: 'Скользящая средняя это «сглаженная» цена за период, она убирает случайные скачки. Берутся три средние: быстрая, средняя и медленная. Если цена выше быстрой, быстрая выше средней, а средняя выше медленной, тренд восходящий. Для Short наоборот. Зелёный: средние выстроены в вашу сторону. Жёлтый: тренд не подтверждён. Красный: тренд против сделки.' },
  rsi: { text: 'Индекс от 0 до 100: как сильно цена выросла или упала за последние 14 свечей. Выше 70 рост перегрет, часто следует пауза. Ниже 30 падение затянулось, возможен отскок. Для входа по тренду лучше 45–65. Зелёный: рабочая зона. Жёлтый: граница. Красный: перегрев или слабость против сделки.' },
  atr: { text: 'Средний размах свечи, то есть привычная «болтанка» цены. Направление не показывает. Нужен для стопа: его ставят на 1,5–3 ATR от входа, чтобы обычный шум не выбил из сделки. Чем больше ATR, тем шире стоп и меньше объём позиции при том же риске.' },
};

const TERMS = [
  { k: 'ofz', re: /офз/iu, t: 'ОФЗ', d: 'Облигации федерального займа: государство занимает у вас деньги и платит проценты (купоны). Самые надёжные бумаги страны, поэтому доходность обычно ниже, чем у компаний.' },
  { k: 'ytm', re: /доходност\p{L}* к погашени\p{L}*|ytm/iu, t: 'Доходность к погашению', d: 'Годовой доход, если купить бумагу сейчас по текущей цене и держать до погашения, получая все купоны. Главный показатель для сравнения облигаций.' },
  { k: 'irr', re: /irr|доходност\p{L}* в год/iu, t: 'IRR, доходность в год', d: 'Средний годовой процент с учётом всех ваших взносов и их сроков. Показывает реальную доходность плана.' },
  { k: 'qual', re: /квалифицированн\p{L}* инвестор\p{L}*/iu, t: 'Квалифицированный инвестор', d: 'Статус, который открывает более рискованные бумаги. Его присваивает брокер, если выполнены условия: например размер портфеля, опыт или образование.' },
  { k: 'keyrate', re: /ключев\p{L}* ставк\p{L}*/iu, t: 'Ключевая ставка', d: 'Главная ставка Банка России. Она влияет на проценты по вкладам и кредитам и на цены облигаций: ставка растёт, старые облигации дешевеют.' },
  { k: 'budget', re: /бюджетн\p{L}* правил\p{L}*/iu, t: 'Бюджетное правило', d: 'Правило Минфина: при высоких ценах на нефть покупать валюту, при низких продавать. Покупки сдерживают укрепление рубля.' },
  { k: 'depins', re: /страхован\p{L}* вклад\p{L}*/iu, t: 'Страхование вкладов', d: 'Государство возвращает деньги по вкладам, если банк разорился: сейчас до 1,4 млн ₽ на человека в одном банке. На облигации и брокерский счёт оно не распространяется.' },
  { k: 'rr', re: /прибыл\p{L}* к риску|r:r/iu, t: 'Прибыль к риску', d: 'Во сколько раз возможная прибыль по тейку больше возможного убытка по стопу. Меньше 1,5 после комиссий считается невыгодным.' },
  { k: 'over', re: /переоценён\p{L}*|переоценен\p{L}*/iu, t: 'Переоценён', d: 'Цена сейчас у верхней границы своей годовой истории. Это статистика, а не расчёт справедливой цены, поэтому вывод осторожный.' },
  { k: 'under', re: /недооценён\p{L}*|недооценен\p{L}*/iu, t: 'Недооценён', d: 'Цена сейчас у нижней границы своей годовой истории. Это статистика, а не расчёт справедливой цены.' },
  { k: 'nkd', re: /нкд/iu, t: 'НКД', d: 'Накопленный купонный доход: часть ближайшего купона, которая накопилась с прошлой выплаты. При покупке вы доплачиваете её продавцу, а потом получаете купон целиком.' },
  { k: 'coupon', re: /купон\p{L}*/iu, t: 'Купон', d: 'Регулярная выплата процентов по облигации. Например 20 ₽ в месяц на одну бумагу.' },
  { k: 'nominal', re: /номинал\p{L}*/iu, t: 'Номинал', d: 'Сумма, которую эмитент вернёт по одной бумаге при погашении. Чаще всего 1000 ₽.' },
  { k: 'matur', re: /погашени\p{L}*/iu, t: 'Погашение', d: 'Дата, когда эмитент возвращает номинал и облигация прекращает существовать.' },
  { k: 'bond', re: /облигаци\p{L}*/iu, t: 'Облигация', d: 'Долговая расписка: вы одалживаете деньги компании или государству, они платят проценты и возвращают долг в конце срока.' },
  { k: 'dur', re: /дюраци\p{L}*/iu, t: 'Дюрация', d: 'Средний срок возврата вложений в днях. Чем она больше, тем сильнее цена бумаги реагирует на изменение ставок.' },
  { k: 'offer', re: /оферт\p{L}*/iu, t: 'Оферта', d: 'Право или обязанность эмитента выкупить облигацию досрочно по заранее оговорённой цене. После оферты условия бумаги могут измениться.' },
  { k: 'amort', re: /амортизаци\p{L}*/iu, t: 'Амортизация', d: 'Эмитент возвращает номинал частями, а не сразу в конце. Купоны со временем уменьшаются, потому что проценты считаются с остатка.' },
  { k: 'vdo', re: /вдо/iu, t: 'ВДО', d: 'Высокодоходные облигации: бумаги небольших компаний с высокой ставкой и повышенным риском дефолта.' },
  { k: 'ech', re: /эшелон\p{L}*/iu, t: 'Эшелон', d: 'Уровень листинга на бирже: 1 эшелон самый строгий отбор эмитентов, 3 эшелон самый мягкий.' },
  { k: 'liq', re: /ликвидност\p{L}*/iu, t: 'Ликвидность', d: 'Насколько легко быстро продать бумагу по честной цене. Высокая ликвидность: много сделок и маленький спред.' },
  { k: 'spread', re: /спред\p{L}*/iu, t: 'Спред', d: 'Разница между лучшей ценой покупки и продажи. Чем он меньше, тем дешевле купить и тут же продать.' },
  { k: 'turn', re: /оборот\p{L}*/iu, t: 'Оборот', d: 'Сумма сделок с бумагой за день в рублях. Большой оборот означает, что бумагу активно торгуют.' },
  { k: 'ndfl', re: /ндфл/iu, t: 'НДФЛ', d: 'Налог на доходы физических лиц: 13 % с дохода до 2,4 млн ₽ в год и 15 % с суммы сверх этого. Купоны облагаются, брокер обычно удерживает налог сам.' },
  { k: 'reinv', re: /реинвест\p{L}*/iu, t: 'Реинвестирование', d: 'Купоны и свободные деньги снова вкладываются в бумаги, поэтому доход растёт как сложный процент.' },
  { k: 'div', re: /диверсификаци\p{L}*/iu, t: 'Диверсификация', d: 'Распределение денег между разными эмитентами и отраслями, чтобы проблема одной компании не ударила по всему портфелю.' },
  { k: 'default', re: /дефолт\p{L}*/iu, t: 'Дефолт', d: 'Эмитент не смог заплатить купон или вернуть долг. При дефолте можно потерять часть вложений или все.' },
  { k: 'emit', re: /эмитент\p{L}*/iu, t: 'Эмитент', d: 'Компания, банк или государство, которые выпустили облигацию или акцию.' },
  { k: 'isin', re: /isin/iu, t: 'ISIN', d: 'Международный код ценной бумаги из 12 символов: по нему бумагу находят у любого брокера.' },
  { k: 'macd', re: /macd/iu, t: 'MACD', d: IND.macd.text },
  { k: 'ema', re: /ema/iu, t: 'EMA', d: IND.ema.text },
  { k: 'rsi', re: /rsi/iu, t: 'RSI', d: IND.rsi.text },
  { k: 'atr', re: /atr/iu, t: 'ATR', d: IND.atr.text },
  { k: 'stop', re: /стоп\p{L}*/iu, t: 'Стоп', d: 'Цена, при которой сделка закрывается с убытком, чтобы он не вышел за рамки плана.' },
  { k: 'take', re: /тейк\p{L}*/iu, t: 'Тейк', d: 'Цена, при которой сделка закрывается с прибылью, когда цель достигнута.' },
  { k: 'long', re: /long|лонг\p{L}*/iu, t: 'Long', d: 'Покупка в расчёте на рост цены.' },
  { k: 'short', re: /short|шорт\p{L}*/iu, t: 'Short', d: 'Продажа в расчёте на падение цены: сначала продают взятое в долг, потом выкупают дешевле.' },
  { k: 'lev', re: /плеч\p{L}*|маржинальн\p{L}*/iu, t: 'Плечо', d: 'Заём у брокера или биржи, чтобы сделка была больше ваших денег. Прибыль растёт, но убыток тоже, а при сильном ходе против вас позицию закроют принудительно.' },
  { k: 'margin', re: /марж\p{L}*/iu, t: 'Маржа', d: 'Ваши деньги, которые блокируются под открытую позицию с плечом.' },
  { k: 'candle', re: /свеч\p{L}*/iu, t: 'Свеча', d: 'Один период на графике: открытие, закрытие, максимум и минимум цены. Зелёная свеча означает рост за период, красная падение.' },
  { k: 'pattern', re: /паттерн\p{L}*/iu, t: 'Свечной паттерн', d: 'Узнаваемая комбинация свечей, после которой цена чаще разворачивается или продолжает тренд. Это вероятность, а не гарантия.' },
  { k: 'ob', re: /перекуплен\p{L}*|перегрет\p{L}*/iu, t: 'Перекупленность', d: 'Цена выросла слишком быстро, покупателей может не хватить: возможна пауза или откат.' },
  { k: 'os', re: /перепродан\p{L}*/iu, t: 'Перепроданность', d: 'Цена упала слишком быстро, возможен отскок.' },
  { k: 'trend', re: /тренд\p{L}*/iu, t: 'Тренд', d: 'Преобладающее направление цены: вверх, вниз или боковик.' },
  { k: 'vol', re: /волатильн\p{L}*/iu, t: 'Волатильность', d: 'Насколько сильно цена скачет. Чем выше, тем больше и возможный выигрыш, и возможный убыток.' },
  { k: 'sigma', re: /σ|сигм\p{L}*/iu, t: 'σ (сигма)', d: 'Мера разброса цены вокруг среднего. Отклонение больше 1,5σ случается редко, поэтому его считают перекосом.' },
  { k: 'corr', re: /корреляци\p{L}*/iu, t: 'Корреляция', d: 'Насколько два актива двигаются вместе: +1 всегда вместе, −1 всегда в разные стороны, 0 связи нет.' },
  { k: 'imoex', re: /imoex/iu, t: 'IMOEX', d: 'Индекс Московской биржи: средняя динамика крупнейших акций. С ним сравнивают отдельные бумаги.' },
  { k: 'fut', re: /фьючерс\p{L}*/iu, t: 'Фьючерс', d: 'Контракт на покупку или продажу актива в будущем по заранее оговорённой цене. Вечный фьючерс не имеет даты исполнения.' },
  { k: 'swap', re: /своп\p{L}*/iu, t: 'Бессрочный своп', d: 'Криптоконтракт без даты исполнения: за удержание позиции платят или получают ставку финансирования.' },
  { k: 'fund', re: /funding/iu, t: 'Funding', d: 'Периодическая плата между покупателями и продавцами бессрочного контракта, она держит его цену рядом с обычной.' },
  { k: 'spot', re: /спот\p{L}*/iu, t: 'Спот', d: 'Обычная покупка актива за деньги с получением сразу, без плеча и срока.' },
  { k: 'etf', re: /etf|бпиф\p{L}*/iu, t: 'ETF и БПИФ', d: 'Биржевые фонды: одна бумага, внутри которой корзина активов, например весь индекс.' },
];
const SORTED = [...TERMS].sort((a, b) => b.re.source.length - a.re.source.length);
for (const t of SORTED) { t.full = new RegExp('^(?:' + t.re.source + ')$', 'iu'); t.pre = new RegExp('^(?:' + t.re.source + ')', 'iu'); }
const BIG = new RegExp('(^|[^\\p{L}\\d_])(' + SORTED.map((t) => '(?:' + t.re.source + ')').join('|') + ')', 'giu');
const SKIP = 'script,style,textarea,input,select,option,button,svg,code,a,h1,h2,nav,.bar,.gl,.tip,.tour-card,[data-nogl]';
const ROOTS = 'main,.sheet,.tour-card';

export const helpOn = () => localStorage.getItem('ig_help') !== '0';
export function setHelp(v) {
  localStorage.setItem('ig_help', v ? '1' : '0');
  document.documentElement.classList.toggle('nohelp', !v);
  if (!v) hide();
}
document.documentElement.classList.toggle('nohelp', !helpOn());

function termOf(word) {
  const w = word.toLowerCase();
  for (const t of SORTED) if (t.full.test(w)) return t;
  for (const t of SORTED) if (t.pre.test(w)) return t;
  return null;
}

function wrapNode(tn) {
  const text = tn.nodeValue;
  if (!text || text.length < 3 || !text.trim()) return;
  const p = tn.parentElement;
  if (!p || p.closest(SKIP)) return;
  const box = p.closest('.card,.panel,aside,main') || document.body;
  BIG.lastIndex = 0;
  let m, pos = 0, frag = null;
  while ((m = BIG.exec(text))) {
    const lead = m[1] || '', start = m.index + lead.length;
    let end = start + m[2].length;
    while (end < text.length && /[\p{L}\d]/u.test(text[end]) && end - start < 40) end++;
    const word = text.slice(start, end), term = termOf(word);
    if (!term) continue;
    if ((frag && frag.querySelector('.gl[data-k="' + term.k + '"]')) || box.querySelector('.gl[data-k="' + term.k + '"]')) continue;
    frag = frag || document.createDocumentFragment();
    if (start > pos) frag.appendChild(document.createTextNode(text.slice(pos, start)));
    const s = document.createElement('span');
    s.className = 'gl'; s.dataset.k = term.k; s.tabIndex = 0; s.textContent = word;
    frag.appendChild(s);
    pos = end;
    BIG.lastIndex = end;
  }
  if (frag) {
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    tn.parentNode.replaceChild(frag, tn);
  }
}

function wrapIn(root) {
  if (!root || root.nodeType !== 1 || root.closest('.gl,.tip')) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = w.nextNode()) && nodes.length < 2500) nodes.push(n);
  nodes.forEach(wrapNode);
}

let tip, cur = null;
function ensureTip() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'tip'; tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  return tip;
}
function textFor(el) {
  if (el.dataset.tip) return { t: el.dataset.tipTitle || '', d: el.dataset.tip };
  const term = TERMS.find((x) => x.k === el.dataset.k);
  return term ? { t: term.t, d: term.d } : null;
}
function show(el) {
  if (!helpOn()) return;
  const c = textFor(el);
  if (!c) return;
  const t = ensureTip();
  t.innerHTML = (c.t ? '<b></b>' : '') + '<span></span>';
  if (c.t) t.firstChild.textContent = c.t;
  t.lastChild.textContent = c.d;
  t.classList.add('on');
  const r = el.getBoundingClientRect(), tr = t.getBoundingClientRect();
  let top = r.top - tr.height - 10;
  if (top < 8) top = r.bottom + 10;
  let left = r.left + r.width / 2 - tr.width / 2;
  left = Math.max(8, Math.min(left, innerWidth - tr.width - 8));
  t.style.left = left + 'px'; t.style.top = top + 'px';
  cur = el;
}
function hide() { if (tip) tip.classList.remove('on'); cur = null; }
const hit = (e) => (e.target && e.target.closest ? e.target.closest('.gl,[data-tip]') : null);
document.addEventListener('mouseover', (e) => { const g = hit(e); if (g && matchMedia('(hover:hover)').matches) show(g); });
document.addEventListener('mouseout', (e) => { if (hit(e) && matchMedia('(hover:hover)').matches) hide(); });
document.addEventListener('focusin', (e) => { const g = hit(e); if (g) show(g); });
document.addEventListener('focusout', hide);
document.addEventListener('click', (e) => { const g = hit(e); if (g) { if (cur === g) hide(); else show(g); } else hide(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
window.addEventListener('scroll', hide, { passive: true });
window.addEventListener('resize', hide);

let pending = new Set(), timer = 0;
new MutationObserver((ms) => {
  for (const m of ms) for (const n of m.addedNodes) {
    const el = n.nodeType === 1 ? n : n.parentElement;
    if (el && !el.closest('.gl,.tip')) pending.add(el);
  }
  clearTimeout(timer);
  timer = setTimeout(() => { const q = [...pending]; pending = new Set(); q.forEach(wrapIn); }, 120);
}).observe(document.body, { childList: true, subtree: true });

const start = () => document.querySelectorAll(ROOTS).forEach(wrapIn);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
setTimeout(start, 1500);
window.IGHelp = { setHelp, helpOn, show, hide };
