import { simulatePortfolio, diversify } from './engine/portfolio.js';
import { prepare, funnel, DEFAULTS, CAT_LABEL, RISK } from './engine/funnel.js';
import { SECTORS } from './engine/sector.js';
import { loadBase, refreshLive } from './data/bonds.js';
import { chime, beep } from './ui.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const rub = (x) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(x) + ' ₽';
const pct = (x, d = 2) => (Number.isFinite(x) ? (x * 100).toFixed(d) + ' %' : '—');
const num = (id) => parseFloat($(id).value) || 0;
const chk = (id) => $(id).checked;
const ST = { raw: [], items: [], byId: new Map(), sel: store('ig_bsel', []), meta: null, fees: null, rates: null, last: [], port: null };
window.IG = { ST };

let t0 = 0;
function ldgOpen(title) { $('ldg').hidden = false; $('ldgT').textContent = title; $('ldgX').hidden = true; t0 = performance.now(); ldg(0, 'Запускаю…'); }
function ldg(p, stage) {
  const pc = Math.max(0, Math.min(100, p)), el = (performance.now() - t0) / 1000;
  $('ldgBar').style.width = pc + '%'; $('ldgPct').textContent = Math.round(pc) + ' %'; $('ldgS').textContent = stage;
  $('ldgEta').textContent = pc >= 100 ? `готово за ${el.toFixed(1)} с` : pc > 6 ? `осталось ≈ ${Math.max(1, Math.round((el * (100 - pc)) / pc))} с` : 'оцениваю время…';
}

function prepareAll() {
  ST.items = prepare(ST.raw, ST.rates.keyRate.value);
  ST.byId = new Map(ST.items.map((b) => [b.secid, b]));
}

async function loadAll() {
  ldgOpen('Подгрузка базы облигаций');
  $('bLoad').disabled = true;
  try {
    const j = await loadBase(ldg);
    ST.raw = j.items; ST.meta = { updated: j.updated, enriched: j.enrichedAt, live: null, note: '' };
    if (chk('bLive')) {
      try { const n = await refreshLive(ST.raw, ldg); ST.meta.live = new Date(); ST.meta.note = `Цены и обороты обновлены напрямую с MOEX (${n} бумаг).`; }
      catch (e) { ST.meta.note = `MOEX напрямую недоступен (${e.message}), показаны данные GitHub.`; }
    }
    ldg(99, 'Готовлю отбор');
    prepareAll(); renderFunnel(); renderShort(); renderPick();
    ldg(100, 'Готово');
    chime();
    const when = (d) => new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    $('bInfo').innerHTML = `В базе <b>${ST.items.length}</b> выпусков. Данные GitHub от ${when(ST.meta.updated)}${ST.meta.enriched ? ', признаки «для квалов» и амортизации проверены ' + when(ST.meta.enriched) : ''}. ${esc(ST.meta.note)}`;
    setTimeout(() => { $('ldg').hidden = true; $('fnl').hidden = false; $('fnl').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 700);
  } catch (e) {
    ldg(0, 'Ошибка: ' + e.message); $('ldgX').hidden = false; beep(220, 400);
  }
  $('bLoad').disabled = false;
}

function readC() {
  const n = (id) => parseFloat($(id).value) || 0;
  return {
    onlyTraded: chk('f_traded'), rubOnly: chk('f_rub'), cats: { ofz: chk('f_ofz'), corp1: chk('f_corp1'), corp2: chk('f_corp2'), corp3: chk('f_corp3'), hy: chk('f_hy') },
    qual: chk('f_qual'), sector: ($('f_sector') && $('f_sector').value) || '', coupon: $('f_coupon').value, minYield: n('f_minY'), maxYield: n('f_maxY'), minVol: n('f_minV'), minTrades: n('f_minT'),
    maxSpread: n('f_maxS') || 99, minM: n('f_minM'), maxM: n('f_maxM') || 9999, noOffer: chk('f_noOffer'), noAmort: chk('f_noAmort'),
    maxRisk: +$('f_risk').value, sort: $('f_sort').value,
  };
}

const tags = (b) => [
  b.qual === true ? '<span class="tag warn">только для квалов</span>' : b.qual === null ? '<span class="tag">статус для квалов не проверен</span>' : '',
  b.offer ? `<span class="tag warn">оферта ${esc(b.offer)}</span>` : '',
  b.amort === true ? '<span class="tag warn">амортизация</span>' : b.amort === null ? '<span class="tag">амортизация не проверена</span>' : '',
  (b.spreadPct ?? 0) > 1 ? '<span class="tag warn">узкий рынок</span>' : '',
].join('');

function sectorOptions(c) {
  const el = $('f_sector');
  if (!el) return;
  const base = funnel(ST.items, { ...c, sector: '' }).result, cnt = {};
  base.forEach((b) => { cnt[b.sector] = (cnt[b.sector] || 0) + 1; });
  const cur = el.value;
  el.innerHTML = `<option value="">Все сектора (${base.length})</option>` + SECTORS.filter((s) => cnt[s] || s === cur).map((s) => `<option value="${esc(s)}">${esc(s)} (${cnt[s] || 0})</option>`).join('');
  el.value = cur;
}

function renderFunnel() {
  const c = readC();
  const f = funnel(ST.items, c);
  ST.last = f.result;
  sectorOptions(c);
  const total = f.steps[0].count || 1;
  $('fSteps').innerHTML = f.steps.map((s) => `<div class="st"><span>${s.label}</span><b>${s.count}</b>${s.removed ? `<small>−${s.removed}</small>` : '<small></small>'}<i style="width:${((s.count / total) * 100).toFixed(1)}%"></i></div>`).join('');
  $('fCount').textContent = `Осталось ${f.result.length} из ${ST.items.length}`;
  $('bList').innerHTML = f.result.slice(0, 60).map((b) => `<div class="bi" data-s="${esc(b.secid)}"><div class="l"><b>${esc(b.name)}</b><small><b>${esc(b.sector)}</b></small><small>${CAT_LABEL[b.cat]} · купон ${b.coupon} ₽ раз в ${b.period} дн. · до ${esc(b.maturity)} (${b.mon} мес.)</small><span>${tags(b)}</span></div><div class="r"><b>${b.yld.toFixed(1)} %</b><small>оборот ${(b.volToday / 1e6).toFixed(1)} млн</small><small class="r${b.risk}">${RISK[b.risk]}</small></div></div>`).join('') || '<p class="hint">Под эти условия бумаг нет. Ослабьте последний фильтр, у которого в воронке стоит большое «−».</p>';
  const more = f.result.length > 60 ? `<p class="hint">Показаны первые 60 из ${f.result.length}. Сузьте условия.</p>` : '';
  $('bMore').innerHTML = more;
}

const isSel = (id) => ST.sel.some((x) => x.s === id);
function toggleSel(id) {
  const b = ST.byId.get(id);
  const i = ST.sel.findIndex((x) => x.s === id);
  if (i >= 0) ST.sel.splice(i, 1); else if (b) ST.sel.push({ s: id, n: b.name, w: 0 });
  equalize(); save(); renderShort(); renderPick();
}
function equalize() { const n = ST.sel.length; ST.sel.forEach((x) => { x.w = n ? +(100 / n).toFixed(2) : 0; }); }
const save = () => localStorage.setItem('ig_bsel', JSON.stringify(ST.sel));

function renderShort() {
  $('short').innerHTML = ST.sel.length ? ST.sel.map((x) => {
    const b = ST.byId.get(x.s);
    return `<div class="chip"><span><b>${esc(x.n)}</b>${b ? `<small>${esc(b.sector)} · ${b.yld.toFixed(1)} %</small>` : ''}</span><input class="wbox" type="number" inputmode="decimal" data-w="${esc(x.s)}" value="${x.w}"><button class="mini" data-rm="${esc(x.s)}">×</button></div>`;
  }).join('') : '<p class="hint">Пока ничего не отобрано. Нажмите на бумагу в списке выше и выберите «Отобрать».</p>';
}

function renderPick() {
  const cur = $('bPick').value;
  $('bPick').innerHTML = '<option value="">Выберите из отобранных…</option>' + ST.sel.map((x) => `<option value="${esc(x.s)}">${esc(x.n)}</option>`).join('');
  if (ST.sel.some((x) => x.s === cur)) $('bPick').value = cur;
}

function fillCalc(id) {
  const b = ST.byId.get(id);
  if (!b) return;
  const ppy = b.ppy || 12;
  $('bName').value = `${b.name} (${b.isin || b.secid})`; $('face').value = b.face; $('pricePct').value = b.pricePct; $('accrued').value = b.accrued;
  $('coupon').value = +((b.coupon * ppy) / 12).toFixed(2);
  $('mat').value = b.mon != null && b.mon <= 240 ? Math.max(1, b.mon) : '';
  $('cNote').textContent = ppy !== 12 ? `Купон ${b.coupon} ₽ выплачивается раз в ${b.period} дн. В калькуляторе он приведён к месячному эквиваленту.` : '';
  $('calc').click();
}

function links(b) {
  const q = encodeURIComponent(b.name.split(' ')[0] + ' облигации'), iss = encodeURIComponent(b.name.split(' ')[0]);
  return [['Новости (Google)', `https://news.google.com/search?q=${q}&hl=ru`], ['Smart-lab: страница облигации', `https://smart-lab.ru/q/bonds/${b.secid}/`], ['Карточка на MOEX', `https://www.moex.com/ru/issue.aspx?board=${b.board}&code=${b.secid}`], ['Раскрытие информации (e-disclosure)', `https://www.e-disclosure.ru/poisk-po-kompaniyam?query=${iss}`]]
    .map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${t}</a></li>`).join('');
}

function openBond(id) {
  const b = ST.byId.get(id), sh = $('bsheet');
  if (!b) return;
  sh.hidden = false;
  sh.innerHTML = `<div class="panel"><div class="sh-head"><h2>${esc(b.name)} <small>${esc(b.isin || b.secid)}</small></h2><button class="mini" id="bsClose">Закрыть</button></div>
  <div class="kpis">${[['Тип', CAT_LABEL[b.cat]], ['Сектор', b.sector], ['Цена', b.pricePct.toFixed(2) + ' %'], ['НКД', b.accrued.toFixed(2) + ' ₽'], ['Купон', `${b.coupon} ₽ раз в ${b.period} дн.`], ['Доходность к погашению', b.yld.toFixed(2) + ' %'], ['≈ после налога', (b.netYield * 100).toFixed(2) + ' %'], ['Погашение', `${b.maturity} (${b.mon} мес.)`], ['Дюрация, дн.', b.duration ?? '—'], ['Оборот за день', rub(b.volToday)], ['Сделок', b.trades], ['Спред bid/offer', b.spreadPct != null ? b.spreadPct.toFixed(2) + ' %' : '—'], ['Оценка риска', RISK[b.risk]]].map(([t, v]) => `<div class="k"><small>${t}</small><b>${v}</b></div>`).join('')}</div>
  <p>${tags(b)}</p>
  <div class="note">Оценка риска строится по эшелону, спреду доходности к ключевой ставке и ликвидности. Это не кредитный рейтинг. Сектор определяется по названию эмитента и может быть неточным. Рейтинг АКРА или Эксперт РА, отчётность и новости эмитента проверьте по ссылкам.</div>
  <h3>Новости и документы</h3><ul class="links">${links(b)}</ul><p class="hint">Автоматическая лента новостей по бумаге появится на следующем этапе.</p>
  <button class="btn" id="bsAdd">${isSel(id) ? 'Убрать из отобранных' : 'Отобрать'}</button></div>`;
  $('bsClose').onclick = () => { sh.hidden = true; };
  $('bsAdd').onclick = () => { toggleSel(id); sh.hidden = true; };
}

function calcPortfolio() {
  const sel = ST.sel.map((x) => ({ b: ST.byId.get(x.s), w: +x.w || 0 })).filter((x) => x.b && x.w > 0);
  if (!sel.length) { ST.port = null; $('pRes').innerHTML = '<p class="hint">Отберите бумаги и проверьте доли.</p>'; return; }
  const term = $('pTerm').value;
  const months = term === 'mat' ? Math.min(120, Math.max(1, ...sel.map((x) => x.b.mon ?? 12))) : +term;
  const br = ST.fees.brokers.find((x) => x.id === $('pBrk').value);
  const shared = { initial: num('pInit'), topup: num('pTop'), months, taxRate: num('pTax') / 100, taxMode: $('pTaxMode').value, liquidate: term !== 'mat', feeRate: br.brokerRate, exchangeRate: br.exchangeBond, monthlyFee: br.monthlyFee, monthlyFeeOnlyIfTrades: !!br.monthlyFeeOnlyIfTrades, liquidityRate: num('pLiq') / 100 };
  const items = sel.map((x) => ({ name: x.b.name, weight: x.w, params: { face: x.b.face, pricePct: x.b.pricePct, accrued: x.b.accrued, coupon: x.b.coupon, payPerYear: x.b.ppy || 12, maturityMonth: x.b.mon != null && x.b.mon <= months ? Math.max(1, x.b.mon) : null } }));
  const r = simulatePortfolio(items, shared);
  ST.port = { sel, months, term, shared, br, r };
  const taxNote = shared.taxMode === 'end' ? `к уплате при выводе: ${rub(r.taxDeferred)}` : `удержан по ходу: ${rub(r.taxes)}`;
  const k = [['Капитал в конце (после налога и выхода)', rub(r.equityNet)], ['Внесено', rub(r.contributed)], ['Прибыль', rub(r.profit)], ['Налог', taxNote], ['Комиссии брокера', rub(r.fees + r.exitFee)], ['Чистые купоны', rub(r.couponNet)], ['Доходность в год (IRR)', pct(r.annualReturn)], ['Срок', months + ' мес.']];
  const total = sel.reduce((s, x) => s + x.w, 0) || 1;
  const secMap = {};
  sel.forEach((x) => { secMap[x.b.sector] = (secMap[x.b.sector] || 0) + x.w / total; });
  const secList = Object.entries(secMap).sort((a, b) => b[1] - a[1]);
  const div = diversify(sel.map((x) => x.b), ST.items.filter((b) => chk('f_qual') || b.qual !== true));
  const li = (b) => `<li>${esc(b.name)}, ${esc(b.sector)}, ${CAT_LABEL[b.cat]}, доходность ${b.yld.toFixed(1)} %, оборот ${rub(b.volToday)}${b.monthly ? '' : ', купон не ежемесячный'}<button class="mini" data-add="${esc(b.secid)}">+</button></li>`;
  $('pRes').innerHTML = `<div class="kpis">${k.map(([t, v]) => `<div class="k"><small>${t}</small><b>${v}</b></div>`).join('')}</div>
  <h3>Риск дефолта по выпускам</h3><ul>${sel.map((x) => `<li>${esc(x.b.name)} (${esc(x.b.sector)}): доля ${((x.w / total) * 100).toFixed(1)} %. При дефолте возможна потеря до этой доли портфеля, без учёта возврата.</li>`).join('')}</ul>
  <h3>Отрасли портфеля</h3>${secList.map(([n, v]) => `<div class="chip"><span>${esc(n)}</span><b>${(v * 100).toFixed(0)} %</b></div>`).join('')}
  <h3>Диверсификация</h3>${div.notes.map((n) => `<div class="note">${n}</div>`).join('') || '<p class="hint">Явных перекосов нет.</p>'}
  ${div.protective.length ? `<p>Защитные бумаги (другой эмитент, высокая ликвидность, сначала из других секторов):</p><ul class="sug">${div.protective.map(li).join('')}</ul>` : ''}
  ${div.balance.length ? `<p>Для баланса (2 эшелон, другой эмитент, сначала из других секторов):</p><ul class="sug">${div.balance.map(li).join('')}</ul>` : ''}
  <p class="hint">Допущения: цена бумаги не меняется, купон приходит равными частями, свободные деньги растут по ставке ликвидности и идут на покупку целых бумаг.</p>
  <div class="scroll"><table><tr><th>Мес.</th><th>Внесено</th><th>Кэш</th><th>Бумаги</th><th>Купоны</th><th>Капитал</th></tr>${r.rows.map((x) => `<tr><td>${x.month}</td><td>${rub(x.contributed)}</td><td>${rub(x.cash)}</td><td>${rub(x.market)}</td><td>${rub(x.couponNet)}</td><td>${rub(x.equity)}</td></tr>`).join('')}</table></div>`;
  document.dispatchEvent(new CustomEvent('ig:portfolio'));
}

async function init() {
  const lj = (u) => fetch(u, { cache: 'no-store' }).then((r) => r.json());
  [ST.fees, ST.rates] = await Promise.all([lj('config/fees.json'), lj('config/rates.json')]);
  $('pBrk').innerHTML = ST.fees.brokers.map((b) => `<option value="${b.id}">${b.name}</option>`).join('');
  const sl = document.createElement('label');
  sl.innerHTML = 'Сектор (отрасль)<select id="f_sector"><option value="">Все сектора</option></select>';
  const fs = $('f_sort');
  if (fs && fs.parentElement) fs.parentElement.before(sl);
  $('bLoad').onclick = loadAll; $('ldgX').onclick = () => { $('ldg').hidden = true; };
  let tm;
  $('fnl').addEventListener('input', (e) => { if (e.target.closest('#fCtl')) { clearTimeout(tm); tm = setTimeout(renderFunnel, 150); } });
  $('fnl').addEventListener('change', (e) => { if (e.target.closest('#fCtl')) renderFunnel(); });
  $('bList').addEventListener('click', (e) => { const el = e.target.closest('.bi'); if (el) openBond(el.dataset.s); });
  $('fTop').onclick = () => { ST.last.slice(0, 10).forEach((b) => { if (!isSel(b.secid)) ST.sel.push({ s: b.secid, n: b.name, w: 0 }); }); equalize(); save(); renderShort(); renderPick(); };
  $('fReset').onclick = () => {
    const d = DEFAULTS, set = (id, v) => { $(id).value = v; }, c = (id, v) => { $(id).checked = v; };
    c('f_traded', d.onlyTraded); c('f_rub', d.rubOnly); c('f_ofz', d.cats.ofz); c('f_corp1', d.cats.corp1); c('f_corp2', d.cats.corp2); c('f_corp3', d.cats.corp3); c('f_hy', d.cats.hy);
    c('f_qual', d.qual); c('f_noOffer', d.noOffer); c('f_noAmort', d.noAmort); set('f_coupon', d.coupon); set('f_minY', d.minYield); set('f_maxY', ''); set('f_minV', d.minVol);
    set('f_minT', d.minTrades); set('f_maxS', d.maxSpread); set('f_minM', d.minM); set('f_maxM', d.maxM); set('f_risk', d.maxRisk); set('f_sort', d.sort); set('f_sector', ''); renderFunnel();
  };
  $('short').addEventListener('input', (e) => { const id = e.target.dataset.w; if (id) { ST.sel.find((x) => x.s === id).w = parseFloat(e.target.value) || 0; save(); } });
  $('short').addEventListener('click', (e) => { const id = e.target.dataset.rm; if (id) toggleSel(id); });
  $('sEq').onclick = () => { equalize(); save(); renderShort(); };
  $('bPick').onchange = () => fillCalc($('bPick').value);
  $('pCalc').onclick = calcPortfolio;
  $('pRes').addEventListener('click', (e) => { const id = e.target.dataset.add; if (id && !isSel(id)) { toggleSel(id); calcPortfolio(); } });
  renderShort(); renderPick();
}
init();
