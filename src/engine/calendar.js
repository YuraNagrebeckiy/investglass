const CRLF = String.fromCharCode(13, 10);
const d8 = (s) => s.replace(/-/g, '');

export function buildEvents(sched, qty, { from, to, taxRate = 0.13, fallback = null, name = '', secid = '' }) {
  const out = [];
  let known = fallback;
  const q = typeof qty === 'function' ? qty : () => qty;
  const cps = [...sched.coupons].sort((a, b) => a.date.localeCompare(b.date));
  for (const c of cps) {
    const estimated = c.value == null;
    const v = estimated ? known : c.value;
    if (!estimated) known = c.value;
    if (v == null || c.date < from || c.date > to) continue;
    const n = q(c.date);
    if (!n) continue;
    const gross = v * n;
    out.push({ date: c.date, type: 'coupon', secid, name, qty: n, perUnit: v, gross, net: gross * (1 - taxRate), estimated });
  }
  for (const a of sched.amort) {
    if (a.value == null || a.date < from || a.date > to) continue;
    const n = q(a.date);
    if (!n) continue;
    const gross = a.value * n;
    out.push({ date: a.date, type: 'amort', secid, name, qty: n, perUnit: a.value, gross, net: gross, estimated: false });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.name.localeCompare(y.name));
}

export function monthTotals(events) {
  const m = new Map();
  for (const e of events) {
    const k = e.date.slice(0, 7);
    const r = m.get(k) || { month: k, couponNet: 0, couponGross: 0, amort: 0 };
    if (e.type === 'coupon') { r.couponNet += e.net; r.couponGross += e.gross; } else r.amort += e.net;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function dayTotals(events) {
  const m = new Map();
  for (const e of events) {
    const r = m.get(e.date) || { date: e.date, total: 0, items: [] };
    r.total += e.net; r.items.push(e);
    m.set(e.date, r);
  }
  return m;
}

const esc = (s) => String(s).replace(/[,;]/g, ' ');
export function toIcs(events) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//InvestGlass//Coupons//RU', 'CALSCALE:GREGORIAN'];
  events.forEach((e, i) => {
    const sum = e.type === 'coupon' ? 'Купон' : 'Возврат номинала';
    L.push('BEGIN:VEVENT', `UID:ig-${e.secid}-${e.date}-${e.type}-${i}@investglass`, 'DTSTAMP:20260101T000000Z', `DTSTART;VALUE=DATE:${d8(e.date)}`,
      `SUMMARY:${esc(sum)} ${esc(e.name)}: ${Math.round(e.net)} руб.`, `DESCRIPTION:${esc(e.qty)} шт. по ${e.perUnit.toFixed(2)} руб.${e.estimated ? ' Размер купона оценочный.' : ''}`, 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.join(CRLF) + CRLF;
}
