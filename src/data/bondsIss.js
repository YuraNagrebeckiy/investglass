const table = (js, t) => (js[t] ? js[t].data.map((r) => Object.fromEntries(js[t].columns.map((c, i) => [c, r[i]]))) : []);

export function parseBoard(board, js) {
  const md = Object.fromEntries(table(js, 'marketdata').map((x) => [x.SECID, x]));
  const out = [];
  for (const s of table(js, 'securities')) {
    const m = md[s.SECID] || {};
    const pricePct = m.LAST || s.PREVPRICE || s.PREVWAPRICE;
    if (!pricePct) continue;
    const face = +s.FACEVALUE || 1000, acc = +s.ACCRUEDINT || 0, dirty = (face * pricePct) / 100 + acc;
    const period = +s.COUPONPERIOD || 0, coupon = +s.COUPONVALUE || 0;
    const ppy = period > 0 ? Math.max(1, Math.round(365 / period)) : 0;
    out.push({
      secid: s.SECID, name: s.SHORTNAME, isin: s.ISIN, board, level: s.LISTLEVEL ?? null, unit: s.FACEUNIT || s.CURRENCYID || null,
      group: board === 'TQOB' ? 'ofz' : 'corp' + (s.LISTLEVEL || 3),
      face, pricePct, accrued: acc, coupon, couponPct: s.COUPONPERCENT ?? null, period, ppy, monthly: period >= 28 && period <= 32,
      nextCoupon: s.NEXTCOUPON || null, maturity: s.MATDATE || null, offer: s.OFFERDATE || null, lot: s.LOTSIZE, issueSize: s.ISSUESIZE ?? null,
      grossYield: ppy && coupon ? (coupon * ppy) / dirty : 0, ytm: m.YIELD ?? s.YIELDATPREVWAPRICE ?? null, duration: m.DURATION ?? null,
      volToday: m.VALTODAY || 0, trades: m.NUMTRADES || 0, status: m.TRADINGSTATUS || null,
      spreadPct: m.BID && m.OFFER ? ((m.OFFER - m.BID) / m.OFFER) * 100 : null,
      qual: null, amort: null, amortChecked: false, typeName: null,
    });
  }
  return out;
}
