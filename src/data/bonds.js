const ISS = 'https://iss.moex.com/iss/engines/stock/markets/bonds/boards';
const table = (js, t) => (js[t] ? js[t].data.map((r) => Object.fromEntries(js[t].columns.map((c, i) => [c, r[i]]))) : []);

export async function loadBase(onP) {
  onP(3, 'Проверяю актуальность данных');
  const r = await fetch('data/bonds.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('файл data/bonds.json не найден (HTTP ' + r.status + '). Запустите Actions, update-data.');
  const total = +r.headers.get('content-length') || +localStorage.getItem('ig_bsize') || 2000000;
  const rd = r.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onP(5 + 50 * Math.min(1, got / total), `Скачиваю базу облигаций: ${(got / 1048576).toFixed(1)} МБ`);
  }
  localStorage.setItem('ig_bsize', String(got));
  onP(57, 'Разбираю данные');
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  const j = JSON.parse(new TextDecoder().decode(buf));
  onP(60, `В базе ${j.items.length} выпусков`);
  return j;
}

export async function refreshLive(items, onP) {
  const byId = new Map(items.map((b) => [b.secid, b]));
  const boards = [...new Set(items.map((b) => b.board))];
  const expected = items.length;
  let done = 0, merged = 0;
  for (const board of boards) {
    const seen = new Set();
    for (let start = 0; start < 6000;) {
      const u = `${ISS}/${board}/securities.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,PREVPRICE,ACCRUEDINT,COUPONVALUE,NEXTCOUPON&marketdata.columns=SECID,LAST,YIELD,VALTODAY,NUMTRADES,BID,OFFER,DURATION&start=${start}`;
      const r = await fetch(u);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const js = await r.json();
      const sec = table(js, 'securities');
      if (!sec.length) break;
      const md = Object.fromEntries(table(js, 'marketdata').map((x) => [x.SECID, x]));
      let fresh = 0;
      for (const s of sec) {
        if (seen.has(s.SECID)) continue;
        seen.add(s.SECID); fresh++; done++;
        const b = byId.get(s.SECID), m = md[s.SECID] || {};
        if (!b) continue;
        const price = m.LAST || s.PREVPRICE;
        if (price > 0) b.pricePct = price;
        if (s.ACCRUEDINT != null) b.accrued = +s.ACCRUEDINT;
        if (s.COUPONVALUE > 0) b.coupon = +s.COUPONVALUE;
        if (s.NEXTCOUPON) b.nextCoupon = s.NEXTCOUPON;
        if (m.YIELD > 0) b.ytm = m.YIELD;
        if (m.DURATION) b.duration = m.DURATION;
        b.volToday = m.VALTODAY || 0; b.trades = m.NUMTRADES || 0;
        b.spreadPct = m.BID && m.OFFER ? ((m.OFFER - m.BID) / m.OFFER) * 100 : null;
        const dirty = (b.face * b.pricePct) / 100 + b.accrued;
        if (b.ppy && b.coupon) b.grossYield = (b.coupon * b.ppy) / dirty;
        merged++;
      }
      if (!fresh) break;
      start += sec.length;
      onP(62 + 36 * Math.min(1, done / expected), `Обновляю цены и обороты с MOEX: ${board}, ${done} из ${expected}`);
    }
  }
  return merged;
}
