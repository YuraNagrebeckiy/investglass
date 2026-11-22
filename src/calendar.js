import { buildEvents, monthTotals, toIcs } from './engine/calendar.js';

const ISS = 'https://iss.moex.com/iss';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rub = (x) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(x) + ' ₽';
const rub2 = (x) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x) + ' ₽';
const anchor = $('short') && $('short').closest('.card');
if (anchor) {
  const css = document.createElement('style');
  css.textContent = `.cm{display:grid;grid-template-columns:70px 1fr 90px;gap:8px;align-items:center;font-size:13px;margin:4px 0}.cm i{display:block;height:12px;border-radius:6px;background:linear-gradient(90deg,#4f74f5,#8b5cf6)}.cm b{text-align:right}
.ce{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;margin:5px 0;border-radius:12px;background:var(--kpi);font-size:13px}.ce small{color:var(--mut)}.ce .a{text-align:right;white-space:nowrap}.ce.am{border-left:4px solid #d97706}
.cq{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0;font-size:14px}`;
  document.head.appendChild(css);
  const card = document.createElement('div');
  card.className = 'card glass'; card.id = 'cal';
  card.innerHTML = `<h2>Календарь купонов</h2>
  <p class="hint">Даты и суммы берутся из графика выплат Московской биржи по каждой отобранной бумаге. Количество бумаг считается по долям и сумме портфеля, его можно поправить вручную.</p>
  <div class="three"><label>Период<select id="calM"><option value="3">3 месяца</option><option value="6">6 месяцев</option><option value="12" selected>12 месяцев</option><option value="24">24 месяца</option><option value="0">До погашения</option></select></label>
  <label>Сумма в бумагах, ₽<input id="calSum" type="number" inputmode="numeric" placeholder="как первый взнос"></label>
  <label>НДФЛ, %<input id="calTax" type="number" inputmode="decimal" value="13"></label></div>
  <button id="calGo" class="btn">Построить календарь выплат</button>
  <div id="calQty"></div><div id="calRes"></div>`;
  anchor.after(card);
  const S = { bonds: [], events: [] };

  const table = (js, t) => (js[t] ? js[t].data.map((r) => Object.fromEntries(js[t].columns.map((c, i) => [c, r[i]]))) : []);
  const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error('MOEX ' + r.status); return r.json(); };

  async function loadSched(secid, from, pages = 6) {
    const coupons = new Map(), amort = new Map();
    for (let start = 0; start < pages * 100; start += 100) {
      const js = await get(`${ISS}/statistics/engines/stock/markets/bonds/bondization/${encodeURIComponent(secid)}.json?iss.meta=off&iss.only=coupons,amortizations&from=${from}&start=${start}&limit=100`);
      const cp = table(js, 'coupons');
      for (const c of cp) if (c.coupondate) coupons.set(c.coupondate, { date: c.coupondate, value: c.value_rub ?? c.value ?? null });
      for (const a of table(js, 'amortizations')) if (a.amortdate) amort.set(a.amortdate, { date: a.amortdate, value: a.value_rub ?? a.value ?? null });
      if (cp.length < 100) break;
    }
    return { coupons: [...coupons.values()], amort: [...amort.values()] };
  }

  async function loadMarket(secid) {
    const js = await get(`${ISS}/engines/stock/markets/bonds/securities/${encodeURIComponent(secid)}.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,PREVPRICE,FACEVALUE,ACCRUEDINT,COUPONVALUE&marketdata.columns=SECID,LAST`);
    const md = table(js, 'marketdata');
    for (const s of table(js, 'securities')) {
      const price = (md.find((m) => m.LAST > 0) || {}).LAST || s.PREVPRICE;
      if (price > 0 && s.FACEVALUE > 0) return { unit: (s.FACEVALUE * price) / 100 + (s.ACCRUEDINT || 0), coupon: s.COUPONVALUE || null };
    }
    throw new Error('нет цены');
  }

  function iso(d) { return d.toISOString().slice(0, 10); }

  async function go() {
    const sel = JSON.parse(localStorage.getItem('ig_bsel') || '[]');
    const out = $('calRes');
    if (!sel.length) { out.innerHTML = '<p class="hint">Сначала отберите бумаги: нажмите на бумагу в списке и выберите «Отобрать».</p>'; return; }
    $('calGo').disabled = true; out.textContent = 'Загружаю графики выплат…';
    const sum = +$('calSum').value || +($('pInit') && $('pInit').value) || 100000;
    const wsum = sel.reduce((s, x) => s + (+x.w || 0), 0) || 1;
    const from = iso(new Date());
    const errors = [];
    let done = 0;
    S.bonds = [];
    await Promise.all(sel.map(async (x) => {
      try {
        const [sched, mk] = await Promise.all([loadSched(x.s, from), loadMarket(x.s)]);
        const qty = Math.floor((sum * ((+x.w || 100 / sel.length) / wsum)) / mk.unit);
        S.bonds.push({ secid: x.s, name: x.n, sched, qty, unit: mk.unit, fallback: mk.coupon });
      } catch (e) { errors.push(`${x.n}: ${e.message}`); }
      out.textContent = `Загружено ${++done} из ${sel.length}`;
    }));
    S.errors = errors;
    $('calGo').disabled = false;
    drawQty(); drawRes();
  }

  function drawQty() {
    $('calQty').innerHTML = S.bonds.length ? `<h3>Сколько бумаг у вас</h3>${S.bonds.map((b, i) => `<div class="cq"><span>${esc(b.name)} <small class="hint">≈ ${rub2(b.unit)} за штуку</small></span><input class="wbox" type="number" inputmode="numeric" data-q="${i}" value="${b.qty}"></div>`).join('')}` : '';
  }

  function drawRes() {
    const out = $('calRes'), months = +$('calM').value, tax = (parseFloat($('calTax').value) || 0) / 100;
    const to = months ? iso(new Date(Date.now() + months * 30.44 * 864e5)) : '2100-01-01';
    const from = iso(new Date());
    S.events = S.bonds.flatMap((b) => buildEvents(b.sched, b.qty, { from, to, taxRate: tax, fallback: b.fallback, name: b.name, secid: b.secid }));
    S.events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    const errs = (S.errors || []).map((e) => `<p class="bad">${esc(e)}</p>`).join('');
    if (!S.events.length) { out.innerHTML = errs + '<p class="hint">В выбранном периоде выплат нет или у бумаг не найден график.</p>'; return; }
    const mt = monthTotals(S.events), max = Math.max(...mt.map((m) => m.couponNet + m.amort)) || 1;
    const cpN = S.events.filter((e) => e.type === 'coupon').reduce((s, e) => s + e.net, 0), cpG = S.events.filter((e) => e.type === 'coupon').reduce((s, e) => s + e.gross, 0);
    const am = S.events.filter((e) => e.type === 'amort').reduce((s, e) => s + e.net, 0);
    const hasEst = S.events.some((e) => e.estimated);
    out.innerHTML = `${errs}<div class="kpis"><div class="k"><small>Купоны за период, после налога</small><b>${rub(cpN)}</b></div><div class="k"><small>Купоны до налога</small><b>${rub(cpG)}</b></div><div class="k"><small>Возврат номинала</small><b>${rub(am)}</b></div><div class="k"><small>Выплат</small><b>${S.events.length}</b></div></div>
    <h3>По месяцам</h3>${mt.map((m) => `<div class="cm"><span>${m.month}</span><i style="width:${(((m.couponNet + m.amort) / max) * 100).toFixed(1)}%"></i><b>${rub(m.couponNet + m.amort)}</b></div>`).join('')}
    <h3>По датам</h3>${S.events.map((e) => `<div class="ce ${e.type === 'amort' ? 'am' : ''}"><span><b>${e.date.split('-').reverse().join('.')}</b> ${esc(e.name)}<br><small>${e.type === 'coupon' ? 'купон' : 'возврат части номинала или погашение'} · ${e.qty} шт. × ${e.perUnit.toFixed(2)} ₽${e.estimated ? ' · размер оценочный' : ''}</small></span><span class="a">${rub2(e.net)}</span></div>`).join('')}
    ${hasEst ? '<div class="note">У части бумаг размер будущих купонов ещё не объявлен (плавающий купон). Для них взят последний известный размер, это оценка.</div>' : ''}
    <p class="hint">Налог 13% учтён только с купонов. Даты выплат могут сдвигаться на ближайший рабочий день, а выплата приходит на счёт брокера обычно в течение 1–3 рабочих дней. Эмитент может изменить график, проверяйте перед сделкой.</p>
    <button id="calIcs" class="btn sm ghost">Скачать в календарь (.ics)</button>`;
    $('calIcs').onclick = () => {
      const url = URL.createObjectURL(new Blob([toIcs(S.events)], { type: 'text/calendar' }));
      const a = document.createElement('a'); a.href = url; a.download = 'investglass-coupons.ics'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
  }

  $('calGo').onclick = go;
  $('calM').onchange = () => S.bonds.length && drawRes();
  $('calTax').oninput = () => S.bonds.length && drawRes();
  $('calQty').addEventListener('input', (e) => { const i = e.target.dataset.q; if (i != null) { S.bonds[+i].qty = Math.max(0, parseInt(e.target.value, 10) || 0); drawRes(); } });

  const bs = $('bsheet');
  if (bs) {
    new MutationObserver(async () => {
      const sm = bs.querySelector('h2 small'), k = bs.querySelector('.kpis');
      if (bs.hidden || !sm || !k || bs.querySelector('.nxc')) return;
      const holder = document.createElement('div');
      holder.className = 'note nxc'; holder.textContent = 'Ищу даты ближайших купонов…';
      k.after(holder);
      try {
        const s = await loadSched(sm.textContent.trim(), iso(new Date()), 1);
        const next = [...s.coupons].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
        holder.innerHTML = next.length ? '<b>Ближайшие купоны:</b> ' + next.map((c) => `${c.date.split('-').reverse().join('.')}${c.value != null ? ', ' + c.value.toFixed(2) + ' ₽' : ', размер ещё не объявлен'}`).join('; ') + ' (на 1 бумагу, до налога).' : 'График будущих купонов не найден.';
      } catch (e) { holder.textContent = 'Не удалось получить график выплат: ' + e.message; }
    }).observe(bs, { childList: true, subtree: true });
  }
}
