import { CAT_LABEL, RISK } from './engine/funnel.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rub = (x) => (Number.isFinite(x) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(x)) + ' ₽' : '—');
const sg = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + rub(Math.abs(x));
const pc = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') + ' %' : '—');
const COL = ['#585248', '#8E6420', '#4A6B88', '#3F7052', '#A94841', '#857E71', '#B2ABA0', '#332F2A'];
const ST = { dep: null, rates: null, cmp: null };
const ig = () => window.IG;
const port = () => ig() && ig().ST && ig().ST.port;

const css = document.createElement('style');
css.textContent = `.stp{display:inline-block;margin-right:8px;padding:2px 10px;border-radius:999px;background:var(--acc);color:var(--on-acc);font:600 12px var(--head);vertical-align:middle}
.dpt{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;margin:6px 0;border-radius:14px;background:var(--kpi)}.dpt small{display:block;color:var(--mut)}.dpt b{font-family:var(--head)}
.vd{padding:12px 14px;border-radius:16px;margin:10px 0;font-size:14px}.vd.ok{background:rgba(63,112,82,.16)}.vd.no{background:var(--warnbg);color:var(--warntx)}
#rep{position:fixed;inset:0;z-index:200;background:#fff;color:#1b1916;overflow:auto;padding:14px;font:14px/1.5 -apple-system,"SF Pro Text",Inter,system-ui,sans-serif}#rep[hidden]{display:none}
#rep .rp{max-width:820px;margin:0 auto}#rep h1{font:600 24px/1.2 Georgia,serif;margin:0 0 4px}#rep h2{font:600 17px Georgia,serif;margin:22px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px;color:#1b1916}#rep h3{font:600 14px sans-serif;margin:12px 0 4px;text-transform:none;letter-spacing:0;color:#1b1916}
#rep .sm{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:10px 0}#rep .sm div{border:1px solid #d6d2ca;border-radius:10px;padding:8px 10px;background:#f8f6f3}#rep .sm small{display:block;color:#6b655a;font-size:12px}#rep .sm b{font-size:17px}
#rep table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}#rep th,#rep td{border-bottom:1px solid #e1ded7;padding:4px 6px;text-align:right;white-space:normal;position:static;background:none;color:#1b1916}#rep th:first-child,#rep td:first-child{text-align:left}
#rep .bx{border:1px solid #d6d2ca;border-radius:10px;padding:10px 12px;margin:8px 0;break-inside:avoid}#rep .bx p{margin:3px 0}#rep .gd{color:#3F7052}#rep .bd{color:#A94841}#rep .ft{color:#6b655a;font-size:11px}
#rep svg{width:100%;height:auto;background:none;margin:6px 0}#rep .ce,#rep .cm{break-inside:avoid}#rep .ce{border:0;border-bottom:1px solid #e1ded7;border-radius:0;background:none;padding:3px 0}#rep .cm i{background:#585248}
#rep .tb{position:sticky;top:0;background:#fff;padding:6px 0;display:flex;gap:8px;flex-wrap:wrap;z-index:2}#rep .tb button{padding:10px 16px;border-radius:999px;border:1px solid #585248;background:#332F2A;color:#fff;font:600 14px sans-serif}#rep .tb button.g{background:#fff;color:#332F2A}
@media print{body>*:not(#rep){display:none!important}#rep{position:static!important;overflow:visible!important;padding:0!important}#rep .tb{display:none!important}@page{margin:14mm}}`;
document.head.appendChild(css);

/* ---------- расчёт вкладов ---------- */
function depositFV(init, topup, months, rate, taxLimit, taxRate) {
  let bal = init, put = init;
  const r = rate / 100 / 12, series = [init];
  for (let m = 1; m <= months; m++) { bal += topup; put += topup; bal *= 1 + r; series.push(bal); }
  const interest = bal - put, years = Math.max(1, Math.ceil(months / 12));
  const tax = Math.max(0, interest - taxLimit * years) * taxRate;
  return { final: bal, put, interest, tax, net: bal - tax - put, series };
}

function cbrRate(m, rates) {
  const d = rates.depositAvgMax;
  return m < 3 ? d.upTo90d : m < 6 ? d.d91to180 : m <= 12 ? d.d181to365 : d.over1y;
}

function compare() {
  const p = port(); if (!p || !ST.dep || !ST.rates) return null;
  const { r, months, shared } = p;
  const topup = shared.topup, init = shared.initial;
  const taxLimit = ST.rates.depositTax.taxFreeLimit, taxRate = ST.rates.depositTax.rate;
  const rows = [];
  const mk = (name, cond, rate, note, src) => { const f = depositFV(init, topup, months, rate, taxLimit, taxRate); rows.push({ name, cond, rate, note, src, ...f }); };
  mk('Средняя максимальная ставка топ-10 банков (ЦБ)', 'Ориентир по рынку, ставка по сроку ' + months + ' мес.', cbrRate(months, ST.rates), '', ST.rates.depositAvgMax.asOf);
  for (const o of ST.dep.offers) {
    const ks = Object.keys(o.rates).map(Number).sort((a, b) => a - b);
    const k = [...ks].reverse().find((x) => x <= months) ?? ks[0];
    mk(`${o.bank}, ${o.product}`, o.cond, o.rates[k], k < months ? `Вклад на ${k} мес., дальше принята пролонгация по той же ставке` : k > months ? `Минимальный срок ${k} мес.` : '', o.source);
  }
  const best = rows.reduce((a, b) => (b.net > a.net ? b : a));
  const bond = { profit: r.profit, final: r.equityNet, put: r.contributed };
  const gap = bond.profit - best.net;
  ST.cmp = { rows, best, bond, gap, months };
  return ST.cmp;
}

function verdict(c, p) {
  const { r } = p;
  const items = p.sel.map((x) => x.b), avgY = items.reduce((s, b, i) => s + b.yld * (p.sel[i].w / (p.sel.reduce((q, z) => q + z.w, 0) || 1)), 0);
  const annB = (r.annualReturn || 0) * 100;
  if (c.gap > 0) {
    return { ok: true, text: `Портфель выигрывает у лучшего из сравниваемых вкладов (${c.best.name}) на ${rub(c.gap)} за ${c.months} мес. Причины: средняя доходность выпусков к погашению около ${pc(avgY)} против ${pc(c.best.rate)} по вкладу, купоны приходят ежемесячно и их можно сразу реинвестировать. Это преимущество оплачено риском: облигации не застрахованы АСВ, цена бумаг колеблется, у корпоративных эмитентов есть риск дефолта.` };
  }
  return { ok: false, text: `Портфель не выигрывает у вклада «${c.best.name}»: разница ${sg(c.gap)} за ${c.months} мес. Причины: налог 13% с каждого купона, комиссии брокера и биржи, потери на покупке выше номинала или на спреде, а по вкладам необлагаемый лимит ${rub(ST.rates.depositTax.taxFreeLimit)} в год закрывает налог при небольшой сумме. Доходность портфеля около ${pc(annB)} в год, вклад даёт ${pc(c.best.rate)}. Вклад надёжнее: до 1,4 млн ₽ в одном банке возвращает АСВ.` };
}

function chartBars(rows, w = 600, h = 220) {
  const max = Math.max(...rows.map((x) => x.v), 1), bw = (w - 20) / rows.length;
  return `<svg viewBox="0 0 ${w} ${h}" role="img">${rows.map((x, i) => { const bh = ((h - 70) * x.v) / max, X = 10 + i * bw; return `<rect x="${X + 6}" y="${h - 40 - bh}" width="${bw - 12}" height="${bh}" fill="${x.c}" rx="4"/><text x="${X + bw / 2}" y="${h - 44 - bh}" font-size="11" text-anchor="middle" fill="currentColor">${esc(x.t)}</text><text x="${X + bw / 2}" y="${h - 22}" font-size="10" text-anchor="middle" fill="currentColor">${esc(x.l.slice(0, 14))}</text><text x="${X + bw / 2}" y="${h - 8}" font-size="10" text-anchor="middle" fill="currentColor">${esc(x.l.slice(14, 28))}</text>`; }).join('')}</svg>`;
}

function chartLines(series, labels, w = 600, h = 240) {
  const all = series.flatMap((s) => s.v), lo = Math.min(...all), hi = Math.max(...all), n = labels.length - 1 || 1;
  const X = (i) => 40 + ((w - 50) * i) / n, Y = (v) => h - 30 - ((h - 50) * (v - lo)) / (hi - lo || 1);
  const grid = [0, 0.5, 1].map((t) => { const v = lo + (hi - lo) * t; return `<line x1="40" x2="${w - 10}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ddd"/><text x="2" y="${Y(v) + 4}" font-size="10" fill="currentColor">${Math.round(v / 1000)} тыс</text>`; }).join('');
  const lines = series.map((s) => `<path d="${s.v.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}" fill="none" stroke="${s.c}" stroke-width="2.5"${s.dash ? ' stroke-dasharray="5 4"' : ''}/>`).join('');
  const lg = series.map((s, i) => `<g transform="translate(${40 + i * 160},${h - 8})"><rect width="12" height="4" y="-5" fill="${s.c}"/><text x="16" y="0" font-size="11" fill="currentColor">${esc(s.n)}</text></g>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img">${grid}${lines}${lg}</svg>`;
}

function donut(parts) {
  const tot = parts.reduce((s, x) => s + x.v, 0) || 1; let a = -Math.PI / 2;
  const arcs = parts.map((x, i) => {
    const b = a + (x.v / tot) * Math.PI * 2, big = b - a > Math.PI ? 1 : 0, R = 70, r0 = 42, c = 90;
    const p1 = [c + R * Math.cos(a), c + R * Math.sin(a)], p2 = [c + R * Math.cos(b), c + R * Math.sin(b)], p3 = [c + r0 * Math.cos(b), c + r0 * Math.sin(b)], p4 = [c + r0 * Math.cos(a), c + r0 * Math.sin(a)];
    a = b;
    return parts.length === 1 ? `<circle cx="${c}" cy="${c}" r="56" fill="none" stroke="${COL[0]}" stroke-width="28"/>` : `<path d="M${p1} A${R},${R} 0 ${big} 1 ${p2} L${p3} A${r0},${r0} 0 ${big} 0 ${p4}Z" fill="${COL[i % COL.length]}"/>`;
  }).join('');
  const lg = parts.map((x, i) => `<text x="190" y="${24 + i * 18}" font-size="12" fill="currentColor"><tspan fill="${COL[i % COL.length]}">■</tspan> ${esc(x.n.slice(0, 26))} ${((x.v / tot) * 100).toFixed(0)}%</text>`).join('');
  return `<svg viewBox="0 0 460 ${Math.max(180, 30 + parts.length * 18)}" role="img">${arcs}${lg}</svg>`;
}

/* ---------- блок 5: сравнение со вкладами ---------- */
function renderDeposits() {
  const box = $('depRes'); if (!box) return;
  const p = port();
  if (!p) { box.innerHTML = '<p class="hint">Сначала рассчитайте портфель на шаге 3. Сравнение использует ту же сумму, пополнения и срок.</p>'; return; }
  const c = compare(); if (!c) { box.innerHTML = '<p class="hint">Данные по вкладам не загрузились.</p>'; return; }
  const v = verdict(c, p);
  const bars = [{ t: rub(c.bond.final).replace(' ₽', ''), l: 'Портфель облигаций', v: c.bond.final, c: COL[0] }, ...c.rows.map((x, i) => ({ t: rub(x.final - x.tax).replace(' ₽', ''), l: x.name.replace('Средняя максимальная ставка топ-10 банков (ЦБ)', 'Средняя ставка ЦБ'), v: x.final - x.tax, c: COL[(i + 1) % COL.length] }))];
  box.innerHTML = `<div class="vd ${v.ok ? 'ok' : 'no'}">${esc(v.text)}</div>
  <div class="dpt"><div><b>Портфель облигаций</b><small>после налога, комиссий и выхода</small></div><div><b>${rub(c.bond.final)}</b><small>прибыль ${sg(c.bond.profit)}</small></div></div>
  ${c.rows.map((x) => `<div class="dpt"><div><b>${esc(x.name)}</b><small>${pc(x.rate, 2)} годовых, капитализация ежемесячно. ${esc(x.cond)}${x.note ? '. ' + esc(x.note) : ''}</small><small>Источник: ${esc(x.src)}</small></div><div><b>${rub(x.final - x.tax)}</b><small>прибыль ${sg(x.net)}${x.tax ? ', налог ' + rub(x.tax) : ', налога нет'}</small></div></div>`).join('')}
  ${chartBars(bars)}
  <h3>Условия, которые важно знать</h3>
  <ul class="adv"><li><b>Досрочное снятие.</b> По вкладу при закрытии до минимального срока проценты обычно пересчитываются по ставке «до востребования», как правило меньше 1% годовых. Облигацию можно продать в любой день, но по рыночной цене: она может быть ниже покупной, плюс спред и комиссия.</li>
  <li><b>Защита.</b> Вклады застрахованы АСВ: 100% суммы вместе с процентами, но не более 1,4 млн ₽ на человека в одном банке. Закон о лимите 2 млн ₽ касается только вкладов больше трёх лет и сберегательных сертификатов, он принят Госдумой 18.11.2026. Облигации АСВ не страхуются: защита зависит от эмитента, у ОФЗ гарантом выступает государство.</li>
  <li><b>Налог.</b> Проценты по вкладам облагаются 13% только выше ${rub(ST.rates.depositTax.taxFreeLimit)} дохода в год по всем вкладам (лимит для 2026 года оценочный, проверьте в ФНС). Купоны облигаций облагаются 13% с первого рубля.</li></ul>
  <p class="hint">Акционные ставки до 20% (ВТБ «Вместе», Сбербанк «Выгодный старт +» 19%) действуют на 2–3 месяца и только на небольшую сумму (до 50–100 тыс. ₽) для определённых клиентов, поэтому в расчёт не включены. Ставки на ${esc(ST.dep.asOf.split('-').reverse().join('.'))}. ${esc(ST.dep.note)}</p>
  <div class="note">Это не инвестиционная рекомендация. Расчёт ориентировочный, решение и риски остаются на вас.</div>`;
}

/* ---------- PDF-отчёт ---------- */
function scenarios(p) {
  const { r, sel } = p, tot = sel.reduce((s, x) => s + x.w, 0) || 1, inv = r.contributed;
  const sh = sel.map((x) => ({ b: x.b, s: x.w / tot }));
  const big = sh.reduce((a, b) => (b.s > a.s ? b : a));
  const dur = sh.reduce((s, x) => s + x.s * ((x.b.duration || 0) / 365), 0);
  const spread = sh.reduce((s, x) => s + x.s * ((x.b.spreadPct || 0) / 2 / 100), 0);
  return [
    { n: 'Базовый: держу до конца срока, дефолтов нет', v: r.profit, t: 'Прибыль после налога и комиссий' },
    { n: 'Ставки выросли на 2 п. п., бумаги переоценились', v: -inv * dur * 0.02, t: `Бумажная просадка около ${pc(dur * 2)} от вложенного. Пока вы держите бумагу до погашения, номинал вернётся, потеря реальна только при продаже раньше` },
    { n: 'Продаю всё досрочно по рынку', v: -inv * spread, t: 'Потеря на спреде между покупкой и продажей, без учёта изменения цены' },
    { n: `Дефолт крупнейшего выпуска (${big.b.name}), возврата нет`, v: -inv * big.s, t: `Максимум потери вложенных в выпуск денег, доля ${pc(big.s * 100, 0)}. Часть можно вернуть в процедуре банкротства, срок и размер неизвестны` },
  ];
}

function watchList(b) {
  const w = [];
  w.push(b.cat === 'ofz' ? 'Это ОФЗ: кредитный риск минимальный, главный риск процентный. При росте ключевой ставки цена падает, держите до погашения.' : 'Корпоративный выпуск: раз в квартал смотрите отчётность эмитента (долговая нагрузка, прибыль), кредитный рейтинг АКРА или Эксперт РА и новости.');
  if (b.offer) w.push(`Оферта ${b.offer}: к этой дате решите, предъявлять бумагу к выкупу или держать дальше, купон после оферты может измениться.`);
  if (b.amort === true) w.push('Есть амортизация: часть номинала возвращается раньше, купоны со временем уменьшаются, деньги нужно будет переинвестировать.');
  if (b.qual === true) w.push('Бумага для квалифицированных инвесторов: убедитесь, что у вас есть нужный статус.');
  if ((b.spreadPct ?? 0) > 1) w.push('Узкий рынок: между ценой покупки и продажи большой разрыв, выйти быстро можно с потерей.');
  w.push('Даты заседаний по ключевой ставке: решения меняют цены облигаций, ближайшее заседание ' + (ST.rates && ST.rates.keyRate.nextMeeting ? ST.rates.keyRate.nextMeeting.split('-').reverse().join('.') : 'см. сайт ЦБ') + '.');
  return w;
}

function buildReport() {
  const p = port(); if (!p) { alert('Сначала рассчитайте портфель на шаге 3.'); return; }
  const c = compare(), { r, sel, months, shared, br } = p, tot = sel.reduce((s, x) => s + x.w, 0) || 1;
  const created = new Date().toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
  const mProfit = r.profit / months, mCoupon = r.couponNet / months;
  const calHtml = (() => { const el = $('calRes'); if (!el || !el.querySelector('.ce')) return '<p>Купонный календарь не построен. Откройте шаг 4 и нажмите «Обновить календарь», затем сохраните отчёт заново.</p>'; const cl = el.cloneNode(true); cl.querySelectorAll('button').forEach((b) => b.remove()); return cl.innerHTML; })();
  const v = c ? verdict(c, p) : null, sc = scenarios(p);
  const growth = chartLines([
    { n: 'Капитал (облигации)', c: COL[0], v: [shared.initial, ...r.rows.map((x) => x.equity)] },
    { n: 'Внесено', c: COL[5], dash: 1, v: [shared.initial, ...r.rows.map((x) => x.contributed)] },
    ...(c ? [{ n: 'Лучший вклад', c: COL[1], v: c.best.series }] : []),
  ], ['0', ...r.rows.map((x) => x.month)]);
  const cp = r.rows.map((x, i) => ({ t: String(Math.round(x.couponNet - (i ? r.rows[i - 1].couponNet : 0))), l: 'мес. ' + x.month, v: Math.max(0, x.couponNet - (i ? r.rows[i - 1].couponNet : 0)), c: COL[3] }));
  const el = $('rep') || Object.assign(document.createElement('div'), { id: 'rep' });
  if (!el.parentNode) document.body.appendChild(el);
  el.hidden = false;
  el.innerHTML = `<div class="rp"><div class="tb"><button id="repPrint">Сохранить в PDF / печать</button><button class="g" id="repX">Закрыть</button></div>
  <h1>Идея по облигациям</h1><div class="ft">Создано ${esc(created)} в InvestGlass. Данные Мосбиржи${ig().ST.meta ? ' от ' + new Date(ig().ST.meta.updated).toLocaleDateString('ru-RU') : ''}.</div>
  <div class="sm"><div><small>Сумма вложения</small><b>${rub(r.contributed)}</b></div><div><small>Предполагаемая прибыль</small><b class="${r.profit >= 0 ? 'gd' : 'bd'}">${sg(r.profit)}</b></div><div><small>Ежемесячная прибыль в среднем</small><b>${sg(mProfit)}</b></div><div><small>Купонный доход в месяц (после налога)</small><b>${rub(mCoupon)}</b></div><div><small>Доходность в год</small><b>${pc((r.annualReturn || 0) * 100, 1)}</b></div><div><small>Капитал в конце срока</small><b>${rub(r.equityNet)}</b></div></div>
  <p>Первый взнос ${rub(shared.initial)}, пополнение ${rub(shared.topup)} в месяц, срок ${months} мес., брокер: ${esc(br.name)}. Налог ${pc(shared.taxRate * 100, 0)} ${shared.taxMode === 'end' ? 'в конце при выводе' : 'с каждого купона'}. Комиссии брокера и биржи за срок: ${rub(r.fees + r.exitFee)}. Налог: ${rub(shared.taxMode === 'end' ? r.taxDeferred : r.taxes)}.</p>
  <h2>1. Состав портфеля</h2>${donut(sel.map((x) => ({ n: x.b.name, v: x.w })))}
  <table><tr><th>Бумага</th><th>Доля</th><th>Доходность к погашению</th><th>Погашение</th><th>Риск</th></tr>${sel.map((x) => `<tr><td>${esc(x.b.name)}</td><td>${pc((x.w / tot) * 100, 0)}</td><td>${pc(x.b.yld)}</td><td>${esc(x.b.maturity)} (${x.b.mon} мес.)</td><td>${esc(RISK[x.b.risk])}</td></tr>`).join('')}</table>
  <h2>2. Каждая бумага: что важно знать</h2>${sel.map((x) => { const b = x.b; return `<div class="bx"><h3>${esc(b.name)} <span class="ft">${esc(b.isin || b.secid)} · ${esc(CAT_LABEL[b.cat])}</span></h3>
  <p>Цена ${pc(b.pricePct, 2)} от номинала ${rub(b.face)}, НКД ${b.accrued.toFixed(2)} ₽, купон ${b.coupon} ₽ раз в ${b.period} дн., доходность к погашению ${pc(b.yld, 2)} (около ${pc(b.netYield * 100, 2)} после налога), дюрация ${b.duration ?? '—'} дн., оборот за день ${rub(b.volToday)}, спред ${b.spreadPct != null ? pc(b.spreadPct, 2) : '—'}.</p>
  <p class="gd"><b>Преимущества:</b> ${b.cat === 'ofz' ? 'надёжность государства, высокая ликвидность' : 'доходность выше вкладов и ОФЗ'}${b.monthly ? ', купон ежемесячно' : ''}${b.offer ? '' : ', без оферты'}${b.amort === true ? '' : ', без амортизации'}.</p>
  <p class="bd"><b>Риски:</b> ${esc(RISK[b.risk])} уровень риска; ${b.cat === 'ofz' ? 'просадка цены при росте ставок' : 'возможен дефолт эмитента, нет страхования АСВ'}; ${(b.spreadPct ?? 0) > 1 ? 'узкий рынок; ' : ''}цена может колебаться до погашения.</p>
  <p><b>На что обращать внимание, пока держите:</b></p><ul>${watchList(b).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`; }).join('')}
  <h2>3. Графики</h2><h3>Рост капитала</h3>${growth}<h3>Купонный доход по месяцам, ₽ после налога</h3>${chartBars(cp.length > 18 ? cp.filter((_, i) => i % 2 === 0) : cp)}
  <h2>4. Купонный календарь</h2>${calHtml}
  <h2>5. Сравнение с вкладами</h2>${c ? `<p>${esc(v.text)}</p><table><tr><th>Вариант</th><th>Ставка</th><th>Капитал в конце</th><th>Прибыль</th></tr><tr><td>Портфель облигаций</td><td>${pc((r.annualReturn || 0) * 100, 1)}</td><td>${rub(c.bond.final)}</td><td>${sg(c.bond.profit)}</td></tr>${c.rows.map((x) => `<tr><td>${esc(x.name)}<br><span class="ft">${esc(x.src)}</span></td><td>${pc(x.rate, 2)}</td><td>${rub(x.final - x.tax)}</td><td>${sg(x.net)}</td></tr>`).join('')}</table>${chartBars([{ t: '', l: 'Портфель облигаций', v: c.bond.final, c: COL[0] }, ...c.rows.map((x, i) => ({ t: '', l: x.name.slice(0, 26), v: x.final - x.tax, c: COL[(i + 1) % COL.length] }))])}
  <p>Вклады: досрочное снятие обычно лишает процентов (ставка «до востребования» меньше 1%), защита АСВ до 1,4 млн ₽ в одном банке. Облигации: продать можно в любой день по рыночной цене, АСВ не страхует. Ставки по вкладам на ${esc(ST.dep.asOf.split('-').reverse().join('.'))}.</p>` : '<p>Данные по вкладам не загрузились.</p>'}
  <h2>6. Сколько можно заработать и потерять</h2><table><tr><th>Сценарий</th><th>Результат</th></tr>${sc.map((s) => `<tr><td>${esc(s.n)}<br><span class="ft">${esc(s.t)}</span></td><td class="${s.v >= 0 ? 'gd' : 'bd'}">${sg(s.v)}</td></tr>`).join('')}</table>
  <h2>7. Помесячный расчёт</h2><table><tr><th>Мес.</th><th>Внесено</th><th>Кэш</th><th>Бумаги</th><th>Купоны</th><th>Капитал</th></tr>${r.rows.map((x) => `<tr><td>${x.month}</td><td>${rub(x.contributed)}</td><td>${rub(x.cash)}</td><td>${rub(x.market)}</td><td>${rub(x.couponNet)}</td><td>${rub(x.equity)}</td></tr>`).join('')}</table>
  <h2>Допущения и предупреждение</h2><p class="ft">Расчёт ориентировочный: цена бумаг не меняется, купоны приходят равными частями, свободные деньги растут по ставке ${pc(shared.liquidityRate * 100, 1)} и идут на покупку целых бумаг. Отчёт не является индивидуальной инвестиционной рекомендацией. Риски потери вложений несёт инвестор. Проверьте актуальные условия и тарифы у брокера перед сделкой.</p></div>`;
  $('repX').onclick = () => { el.hidden = true; };
  $('repPrint').onclick = () => window.print();
}

/* ---------- перестройка вкладки ---------- */
function build() {
  const bonds = $('bonds'); if (!bonds || !$('short')) return;
  const pre = (el, n) => { const h = el && el.querySelector('h2'); if (h && !h.querySelector('.stp')) h.insertAdjacentHTML('afterbegin', `<span class="stp">Шаг ${n}</span>`); };
  pre($('bLoad').closest('.card'), 1); pre($('fnl'), 2); pre($('short').closest('.card'), 3); pre($('cal'), 4);
  const hint = document.createElement('p');
  hint.className = 'hint'; hint.textContent = 'Бумаги выбираются один раз на шаге 2. Дальше брокер, сумма и срок задаются здесь, а календарь и сравнение со вкладами берут тот же портфель без повторного ввода.';
  $('short').closest('.card').querySelector('h2').after(hint);
  const cal = $('cal');
  if (cal) {
    const three = cal.querySelector('.three'); if (three) three.style.display = 'none';
    const calHint = cal.querySelector('p.hint'); if (calHint) calHint.textContent = 'Календарь строится автоматически для портфеля с шага 3: те же бумаги, доли, сумма, срок и налог. Даты и суммы берутся из графика выплат Мосбиржи.';
    $('calGo').textContent = 'Обновить календарь';
  }
  const dep = document.createElement('div');
  dep.className = 'card glass'; dep.id = 'depCard';
  dep.innerHTML = '<h2><span class="stp">Шаг 5</span>Сравнение со вкладами</h2><p class="hint">Тот же портфель, та же сумма, пополнения и срок. Вклады: средняя ставка из мониторинга Банка России и популярные предложения на дату ниже.</p><div id="depRes"><p class="hint">Сначала рассчитайте портфель на шаге 3.</p></div>';
  (cal || $('short').closest('.card')).after(dep);
  const fin = document.createElement('div');
  fin.className = 'card glass'; fin.id = 'repCard';
  fin.innerHTML = '<h2><span class="stp">Шаг 6</span>Сохранить идею</h2><p class="hint">В отчёт попадут выбранные бумаги с рисками и преимуществами, сумма вложения, ожидаемая и ежемесячная прибыль, графики и диаграммы, купонный календарь, сравнение с вкладами и сценарии потерь, а также дата создания. Нажмите «Сохранить в PDF / печать» и выберите «Сохранить как PDF». На iPhone: Поделиться, Печать, сожмите страницу двумя пальцами, затем снова Поделиться и «Сохранить в Файлы».</p><button class="btn" id="repGo">Сохранить идею в PDF</button><button class="btn ghost" id="oneToggle">Показать расчёт одной бумаги (отдельный калькулятор)</button><div class="note">Отчёт информационный, не инвестиционная рекомендация. Риски несёт инвестор.</div>';
  dep.after(fin);
  const one = $('calcCard'), tbl = $('tbl') && $('tbl').closest('.card');
  [one, tbl].forEach((x) => { if (x) x.style.display = 'none'; });
  $('oneToggle').onclick = () => { const h = one.style.display !== 'none'; [one, tbl].forEach((x) => { if (x) x.style.display = h ? 'none' : ''; }); $('oneToggle').textContent = h ? 'Показать расчёт одной бумаги (отдельный калькулятор)' : 'Скрыть расчёт одной бумаги'; };
  $('repGo').onclick = buildReport;
  document.addEventListener('ig:portfolio', () => {
    const t = $('pTerm').value;
    $('calM').value = t === 'mat' ? '0' : t; $('calSum').value = $('pInit').value; $('calTax').value = $('pTax').value;
    $('calGo').click();
    renderDeposits();
  });
}

(async () => {
  const lj = (u) => fetch(u, { cache: 'no-store' }).then((r) => r.json());
  try { [ST.dep, ST.rates] = await Promise.all([lj('config/deposits.json'), lj('config/rates.json')]); } catch { /* вклады недоступны */ }
  build();
})();
