export function scanOutcome(rec, cs) {
  const d = rec.dir === 'short' ? -1 : 1, t0 = Date.parse(rec.ts) / 1000;
  const dur = cs.length > 1 ? cs[1].t - cs[0].t : 3600;
  const bars = cs.filter((c) => c.t + dur > t0);
  let mfe = 0, mae = 0, status = 'open', hitT = null, hitPrice = null;
  for (const c of bars) {
    const fav = d === 1 ? c.h : c.l, adv = d === 1 ? c.l : c.h;
    mfe = Math.max(mfe, d * (fav - rec.price) / rec.price);
    mae = Math.min(mae, d * (adv - rec.price) / rec.price);
    const stopHit = d === 1 ? c.l <= rec.stop : c.h >= rec.stop, tpHit = d === 1 ? c.h >= rec.tp : c.l <= rec.tp;
    if (stopHit) { status = 'stop'; hitT = c.t; hitPrice = rec.stop; break; }
    if (tpHit) { status = 'tp'; hitT = c.t; hitPrice = rec.tp; break; }
  }
  const last = bars.length ? bars[bars.length - 1] : cs[cs.length - 1];
  return { status, hitT, hitPrice, mfe, mae, last: last ? last.c : rec.price, lastT: last ? last.t : t0 };
}

export function tradePnl(rec, exitPrice, endTs, o = {}) {
  const d = rec.dir === 'short' ? -1 : 1, qty = rec.qty, entry = rec.price, lev = rec.lev || 1;
  const notional = qty * entry, margin = notional / lev;
  const gross = d * (exitPrice - entry) * qty;
  const fees = (o.feeRate ?? rec.feeRate ?? 0) * (entry + exitPrice) * qty;
  const days = Math.max(0, (endTs - Date.parse(rec.ts)) / 864e5);
  let financing = 0;
  if (rec.inst === 'swap') financing = Math.abs(o.fundingRate8h || 0) * 3 * days * notional;
  else if (lev > 1) {
    const base = d === 1 ? notional - margin : notional;
    const daily = rec.market === 'crypto' ? o.borrowDaily || 0 : (o.marginYear ?? 0.2) / 365;
    financing = base * daily * days;
  }
  const net = gross - fees - financing;
  return { gross, fees, financing, net, margin, notional, pctMargin: (net / margin) * 100, pctPrice: d * (exitPrice / entry - 1) * 100, days };
}

export function dailySeries(rec, daily, endTs, o = {}) {
  const t0 = Date.parse(rec.ts) / 1000, end = endTs / 1000, rows = [];
  for (const c of daily) {
    if (c.t + 86400 <= t0 || c.t > end) continue;
    const at = Math.min((c.t + 86400) * 1000, endTs), price = at >= endTs && o.exitPrice != null ? o.exitPrice : c.c;
    const p = tradePnl(rec, price, at, o);
    rows.push({ date: new Date(c.t * 1000).toISOString().slice(0, 10), close: price, net: p.net, pct: p.pctMargin, financing: p.financing });
  }
  return rows;
}
