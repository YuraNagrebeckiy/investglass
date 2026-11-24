const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (x, d = 0) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d }).format(x);
const CHECKED = '24.11.2026';

const BROKERS = [
  { id: 'sber', name: 'СберИнвестиции', url: 'https://www.sberbank.com/ru/person/investments/broker', warn: 'Актуальную ставку не удалось подтвердить по официальному тарифу. Цифра взята из обзора, сверьте её в приложении.',
    tariffs: [{ n: 'Инвестиционный', buy: 0.3, sell: 0.3, fee: 0, c: 'Без платы за обслуживание', uncertain: true }] },
  { id: 't', name: 'Т-Инвестиции', url: 'https://www.tbank.ru/invest/pricing/',
    tariffs: [{ n: 'Инвестор', buy: 0.3, sell: 0.3, fee: 0, c: 'Подключается по умолчанию' }, { n: 'Трейдер', buy: 0.05, sell: 0.05, fee: 390, c: 'Бесплатно при активах от 1,5 млн ₽ (по обзору)' }] },
  { id: 'vtb', name: 'ВТБ Мои Инвестиции', url: 'https://www.vtb.ru/personal/investicii/tarify/',
    warn: 'В источниках разные цифры: от 0,05% до 0,25% в зависимости от уровня программы. Взята базовая ставка.',
    tariffs: [{ n: 'Мой онлайн (базовый уровень)', buy: 0.25, sell: 0.25, fee: 0, c: 'Серебро 0,20%, Золото 0,15% по уровню программы', uncertain: true }] },
  { id: 'alfa', name: 'Альфа-Инвестиции', url: 'https://alfabank.ru/alfa-investor/tariffs/',
    tariffs: [{ n: 'Инвестор', buy: 0.3, sell: 0.3, fee: 0, c: 'Без платы за обслуживание' }, { n: 'Трейдер', buy: 0.049, sell: 0.049, fee: 199, c: 'Плата берётся при наличии сделок; ставка снижается до 0,014% с ростом оборота' }] },
  { id: 'bcs', name: 'БКС Мир инвестиций', url: 'https://bcs.ru/tariffs',
    tariffs: [{ n: 'Инвестор', buy: 0, sell: 0.3, fee: 0, c: 'Покупка без комиссии, за продажу 0,3%' }, { n: 'Трейдер', buy: 0.04, sell: 0.04, fee: 299, c: 'Плата берётся при наличии сделок; ставка от 0,03–0,04% снижается до 0,008% с ростом оборота или активов' }] },
  { id: 'finam', name: 'Финам', url: 'https://broker.finam.ru/landing/tariff-learn-more/',
    tariffs: [{ n: 'Стратег', buy: 0.05, sell: 0.05, fee: 0, c: 'Минимум 50 ₽ за поручение' }, { n: 'Инвестор', buy: 0.035, sell: 0.035, fee: 200, c: 'Комиссия до оборота 1 млн ₽ в день' }] },
];

const css = document.createElement('style');
css.textContent = '.brk{margin:10px 0;padding:14px;border-radius:18px;background:var(--kpi)}.brk h3{margin:0 0 6px;text-transform:none;letter-spacing:0;font-size:16px;color:var(--txt)}.brk .tr{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--grid)}.brk .tr b{font-family:var(--head)}.brk .tr small{display:block;color:var(--mut)}.brk .cost{font:600 16px var(--head);white-space:nowrap}.brk .best{color:var(--ok)}.brk a{color:var(--info);font-size:13px;font-weight:400}';
document.head.appendChild(css);

const nav = $('tabs'), main = document.querySelector('main');
if (nav && main) {
  const btn = document.createElement('button');
  btn.dataset.tab = 'brk'; btn.textContent = 'Брокеры';
  nav.appendChild(btn);
  const sec = document.createElement('section');
  sec.id = 'brk'; sec.className = 'tab';
  sec.innerHTML = `<div class="card glass"><h2>Брокеры России</h2>
  <p class="hint">Популярные тарифы для частных инвесторов на фондовом рынке Мосбиржи. Порядок в списке выбран редакционно и не является рейтингом. Данные собраны из тарифов брокеров и обзоров на ${CHECKED}, условия меняются, перед открытием счёта проверьте их на сайте брокера.</p>
  <div class="two"><label>Покупок в месяц, ₽<input id="brkBuy" inputmode="numeric" value="100000"></label><label>Продаж в месяц, ₽<input id="brkSell" inputmode="numeric" value="100000"></label></div>
  <p class="hint">Расчёт показывает комиссию брокера и плату за обслуживание в месяц. Депозитарные сборы, биржевые комиссии вне тарифа, налоги и спред сюда не входят.</p>
  <div id="brkList"></div>
  <div class="note">Это справочная информация, а не инвестиционная рекомендация и не предложение открыть счёт. Выбор брокера и риски остаются на вас.</div></div>`;
  main.appendChild(sec);
  const draw = () => {
    const b = Math.max(0, parseFloat($('brkBuy').value.replace(/\s/g, '')) || 0), s = Math.max(0, parseFloat($('brkSell').value.replace(/\s/g, '')) || 0);
    const all = BROKERS.flatMap((x) => x.tariffs.map((t) => ({ ...t, cost: t.fee + (t.buy * b + t.sell * s) / 100 })));
    const min = Math.min(...all.map((t) => t.cost));
    $('brkList').innerHTML = BROKERS.map((x) => `<div class="brk"><h3>${esc(x.name)} <a href="${esc(x.url)}" target="_blank" rel="noopener">тарифы на сайте</a></h3>${x.warn ? `<div class="note">${esc(x.warn)}</div>` : ''}
    ${x.tariffs.map((t) => { const cost = t.fee + (t.buy * b + t.sell * s) / 100; return `<div class="tr"><div><b>${esc(t.n)}</b>${t.uncertain ? ' <span class="tag warn">уточнить</span>' : ''}<small>Покупка ${nf(t.buy, 3)}%, продажа ${nf(t.sell, 3)}%, обслуживание ${nf(t.fee)} ₽/мес. ${esc(t.c)}</small></div><div class="cost ${cost === min ? 'best' : ''}">${nf(cost)} ₽/мес${cost === min ? ' · дешевле всех при ваших оборотах' : ''}</div></div>`; }).join('')}</div>`).join('');
  };
  $('brkBuy').oninput = draw; $('brkSell').oninput = draw; draw();
  btn.onclick = () => {
    document.querySelectorAll('#tabs button,.tab').forEach((e) => e.classList.remove('on'));
    btn.classList.add('on'); sec.classList.add('on'); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
}
