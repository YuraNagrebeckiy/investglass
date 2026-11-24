const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rub = (x) => (Number.isFinite(x) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(x)) + ' ₽' : '—');
const sg = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + rub(Math.abs(x));
const pc = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') + ' %' : '—');
const ST = { funds: null, dep: null, rates: null };
const port = () => window.IG && window.IG.ST && window.IG.ST.port;

function grow(init, topup, months, ratePct, c) {
  let bal = init * (1 - c), put = init;
  const r = ratePct / 100 / 12;
  for (let m = 1; m <= months; m++) { bal += topup * (1 - c); put += topup; bal *= 1 + r; }
  return { put, pre: bal, final: bal * (1 - c), comm: c * put + c * bal };
}

function bestDeposit(p) {
  const { months, shared } = p, lim = ST.rates.depositTax.taxFreeLimit, tr = ST.rates.depositTax.rate;
  let best = null;
  const d = ST.rates.depositAvgMax, base = months < 3 ? d.upTo90d : months < 6 ? d.d91to180 : months <= 12 ? d.d181to365 : d.over1y;
  const list = [{ name: 'Средняя максимальная ставка топ-10 банков (ЦБ)', rate: base }];
  for (const o of ST.dep.offers) {
    const ks = Object.keys(o.rates).map(Number).sort((a, b) => a - b);
    const k = [...ks].reverse().find((x) => x <= months) ?? ks[0];
    list.push({ name: `${o.bank}, ${o.product}`, rate: o.rates[k] });
  }
  for (const x of list) {
    const g = grow(shared.initial, shared.topup, months, x.rate, 0);
    const interest = g.final - g.put, tax = Math.max(0, interest - lim * Math.max(1, Math.ceil(months / 12))) * tr;
    const row = { ...x, end: g.final - tax, profit: g.final - tax - g.put };
    if (!best || row.profit > best.profit) best = row;
  }
  return best;
}

function fundRow(f, p, own) {
  const { months, shared, br } = p, fr = ST.funds;
  const rate = fr.rusfar - f.expense;
  const free = own && f.free;
  const c = free ? 0 : (br.brokerRate || 0) + (br.exchangeStock || 0);
  const g = grow(shared.initial, shared.topup, months, rate, c);
  const tax = Math.max(0, g.final - g.put) * 0.13;
  return { f, rate, c, free, own, comm: g.comm, tax, end: g.final - tax, profit: g.final - tax - g.put };
}

function build() {
  const p = port();
  if (!p || !ST.funds || !ST.dep || !ST.rates) return null;
  const key = (p.br.id || '').split('_')[0];
  const ownF = ST.funds.funds.find((f) => f.broker === key) || null;
  const ref = ST.funds.funds.find((f) => f.ticker === 'LQDT');
  const rows = [];
  if (ownF) rows.push(fundRow(ownF, p, true));
  if (ref && (!ownF || ownF.ticker !== 'LQDT')) rows.push(fundRow(ref, p, false));
  const dep = bestDeposit(p);
  const bond = { name: 'Портфель облигаций', end: p.r.equityNet, profit: p.r.profit, risk: Math.max(...p.sel.map((x) => x.b.risk)) };
  const rk = ['', 'низкий', 'умеренный', 'средний', 'повышенный', 'высокий'];
  const rank = [
    { n: 'Портфель облигаций', end: bond.end, profit: bond.profit, risk: `${rk[bond.risk]} (по худшему выпуску)`, comm: `${rub(p.r.fees + p.r.exitFee)}, налог ${rub(p.shared.taxMode === 'end' ? p.r.taxDeferred : p.r.taxes)}` },
    { n: 'Лучший вклад: ' + dep.name, end: dep.end, profit: dep.profit, risk: 'низкий в пределах 1,4 млн ₽ (АСВ)', comm: 'без комиссий' },
    ...rows.map((x) => ({ n: `Фонд ${x.f.ticker}${x.own ? ' (фонд вашего брокера)' : ' (ориентир рынка)'}`, end: x.end, profit: x.profit, risk: 'умеренный: доход плавает вслед за ставкой, АСВ не страхует', comm: `${x.free ? 'сделки без комиссии' : 'комиссия сделок ' + pc(x.c * 100) + ' на вход и выход, ' + rub(x.comm)}, налог ${rub(x.tax)}` })),
  ].sort((a, b) => b.profit - a.profit);
  return { p, ownF, rows, dep, rank, key };
}

function html(b, forReport) {
  const { p, ownF, rows, rank } = b, fr = ST.funds;
  const fundCards = rows.map((x) => `<div class="${forReport ? 'bx' : 'dpt'}"><div><b>${esc(x.f.ticker)} · ${esc(x.f.name)}</b><small>УК ${esc(x.f.uk)}. Расходы фонда ${pc(x.f.expense)} в год${x.f.verify ? ' (не подтверждены, ориентир)' : ''}. Прогноз доходности ${pc(x.rate)} годовых: ставка денежного рынка ${pc(fr.rusfar)} минус расходы. За 12 месяцев фонд показал ${pc(x.f.y1)} на ${esc(x.f.y1AsOf)}, прошлое не гарантирует будущее.</small><small>${x.free ? `Покупка и продажа у вашего брокера без комиссии: ${esc(x.f.src)}` : x.own ? `Нулевая комиссия для этого фонда у вашего брокера не подтверждена, применён тариф: ${pc(x.c * 100)} за сделку. ${esc(x.f.src)}` : `Это не фонд вашего брокера, поэтому применена комиссия вашего тарифа ${pc(x.c * 100)} на каждую сделку (вход и выход), а у родного брокера фонда её нет.`}</small></div><div><b>${rub(x.end)}</b><small>прибыль ${sg(x.profit)}, налог при продаже ${rub(x.tax)}${x.comm ? ', комиссии ' + rub(x.comm) : ''}</small></div></div>`).join('');
  const noOwn = !ownF ? '<div class="note">Для вашего тарифа собственный фонд брокера не найден, показан крупнейший фонд ЛИКВИДНОСТЬ (LQDT) с вашей комиссией за сделки. Если нужен вариант без комиссий, выберите брокера со своим фондом: ВТБ (LQDT), Сбер (SBMM), Альфа (AKMM), Т-Инвестиции (TMON), БКС (BCSD).</div>' : '';
  const table = `<table><tr><th>Актив</th><th>Капитал в конце</th><th>Прибыль</th><th>Риск</th><th>Комиссии и налог</th></tr>${rank.map((x) => `<tr><td>${esc(x.n)}</td><td>${rub(x.end)}</td><td>${sg(x.profit)}</td><td>${esc(x.risk)}</td><td>${esc(x.comm)}</td></tr>`).join('')}</table>`;
  const rec = `<ul class="adv">
  <li><b>Облигации.</b> Рекомендации: держите выпуски до погашения, распределяйте вложения по разным эмитентам и отраслям, раз в квартал проверяйте отчётность и рейтинг, следите за датами оферт и заседаниями по ключевой ставке. Риски: дефолт эмитента, падение цены при росте ставок, узкий рынок при продаже, налог 13% с купонов, нет страхования АСВ.</li>
  <li><b>Вклады.</b> Рекомендации: сумму выше 1,4 млн ₽ делите между банками, заранее смотрите условия досрочного закрытия и пролонгации, сравнивайте эффективную ставку. Риски: после окончания срока ставка может быть ниже, при досрочном закрытии проценты обычно сгорают до ставки «до востребования», у акционных ставок есть лимит суммы и требования к клиенту.</li>
  <li><b>Фонд денежного рынка.</b> Рекомендации: подходит для свободных денег на небольшой срок, берите фонд своего брокера, чтобы не платить комиссию за сделки, сравнивайте расходы фонда: у LQDT и SBMM около 0,3% в год, у AKMM 0,69%, у TMON до 1,2%. Риски: доходность следует за ключевой ставкой и падает вместе с ней, фонд не застрахован АСВ и не гарантирует доход, доход облагается 13% при продаже паёв, расходы фонда уменьшают результат.</li></ul>
  <p class="hint">Данные по фондам на ${esc(fr.asOf.split('-').reverse().join('.'))}: ${esc(fr.rusfarSource)}. ${esc(fr.note)} Расчёт ориентировочный: ставка принята неизменной, налог по фонду посчитан при продаже в конце срока, возможную льготу долгосрочного владения (от 3 лет) не учитывает.</p>
  <div class="note">Решение, что покупать, принимает инвестор. Расчёт и рекомендации носят информационный характер и не являются индивидуальной инвестиционной рекомендацией, а риски потери вложений лежат на вас.</div>`;
  return `${forReport ? '<h2 class="fndx">5а. Сравнение нескольких активов</h2>' : '<h3>Фонды денежного рынка и общий рейтинг активов</h3>'}${noOwn}<p>${forReport ? '' : 'Фонд вашего брокера выбирается автоматически. Если комиссия за сделки у него нулевая, это указано ниже. '}Активы отсортированы по расчётной прибыли за срок портфеля, но высокая прибыль не означает лучший выбор: смотрите риск и условия.</p>${table}${fundCards}<h3>Рекомендации и риски по каждому активу</h3>${rec}`;
}

function render() {
  const b = build(), box = $('fundRes');
  if (!box) return;
  box.innerHTML = b ? html(b, false) : '<p class="hint">Сначала рассчитайте портфель на шаге 3.</p>';
}

function decorate() {
  const rep = $('rep');
  if (!rep || rep.hidden || rep.querySelector('.fndx')) return;
  const b = build(); if (!b) return;
  const h = [...rep.querySelectorAll('h2')].find((x) => /^6\./.test(x.textContent.trim()));
  if (h) h.insertAdjacentHTML('beforebegin', html(b, true));
}

(async () => {
  const lj = (u) => fetch(u, { cache: 'no-store' }).then((r) => r.json());
  try { [ST.funds, ST.dep, ST.rates] = await Promise.all([lj('config/funds.json'), lj('config/deposits.json'), lj('config/rates.json')]); } catch { return; }
  const wait = setInterval(() => {
    const card = $('depCard');
    if (!card) return;
    clearInterval(wait);
    const box = document.createElement('div');
    box.id = 'fundRes'; box.innerHTML = '<p class="hint">Сначала рассчитайте портфель на шаге 3.</p>';
    card.appendChild(box);
    document.addEventListener('ig:portfolio', render);
    render();
  }, 400);
  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
})();
