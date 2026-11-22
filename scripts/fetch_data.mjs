import { readFile, writeFile, mkdir } from 'node:fs/promises';

const j = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'investglass/0.1' } }); if (!r.ok) throw new Error(u + ' ' + r.status); return r; };
const rd = async (p) => JSON.parse(await readFile(p, 'utf8'));
const today = () => new Date().toISOString().slice(0, 10);
const log = [];
const step = async (name, fn) => { try { await fn(); log.push('ok ' + name); } catch (e) { log.push('FAIL ' + name + ': ' + e.message); } };

await step('okx', async () => {
  const fees = await rd('config/fees.json');
  const q = (await (await j('https://www.okx.com/api/v5/public/interest-rate-loan-quota')).json()).data[0];
  const usdt = q.basic.find((x) => x.ccy === 'USDT');
  const f = (await (await j('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP')).json()).data[0];
  fees.crypto.okx.borrowDailyUSDT = +usdt.rate; fees.crypto.okx.fundingRate8h = +f.fundingRate; fees.updated = today();
  await writeFile('config/fees.json', JSON.stringify(fees, null, 1));
});

await step('cbr-key-rate', async () => {
  const html = await (await j('https://www.cbr.ru/hd_base/keyrate/')).text();
  const m = [...html.matchAll(/(\d{2}\.\d{2}\.\d{4})\s*<\/td>\s*<td[^>]*>\s*([\d,]+)/g)][0];
  if (!m) throw new Error('таблица ключевой ставки не распознана');
  const rates = await rd('config/rates.json');
  const [d, mo, y] = m[1].split('.');
  rates.keyRate.value = parseFloat(m[2].replace(',', '.')); rates.keyRate.asOf = `${y}-${mo}-${d}`; rates.updated = today();
  await writeFile('config/rates.json', JSON.stringify(rates, null, 1));
});

await step('moex-bonds', async () => {
  const out = [];
  for (const board of ['TQCB', 'TQOB']) {
    const u = `https://iss.moex.com/iss/engines/stock/markets/bonds/boards/${board}/securities.json?iss.meta=off`;
    const js = await (await j(u)).json();
    const tab = (t) => js[t].data.map((r) => Object.fromEntries(js[t].columns.map((c, i) => [c, r[i]])));
    const md = Object.fromEntries(tab('marketdata').map((x) => [x.SECID, x]));
    for (const s of tab('securities')) {
      const m = md[s.SECID] || {};
      const period = +s.COUPONPERIOD;
      if (!(period >= 28 && period <= 32) || !s.COUPONVALUE) continue;
      const pricePct = m.LAST || s.PREVPRICE;
      if (!pricePct) continue;
      const face = +s.FACEVALUE, dirty = (face * pricePct) / 100 + (+s.ACCRUEDINT || 0);
      out.push({ secid: s.SECID, name: s.SHORTNAME, isin: s.ISIN, board, face, pricePct, accrued: +s.ACCRUEDINT || 0, coupon: +s.COUPONVALUE,
        nextCoupon: s.NEXTCOUPON, maturity: s.MATDATE, offer: s.OFFERDATE || null, lot: s.LOTSIZE,
        netYield: (s.COUPONVALUE * 12 * 0.87) / dirty, volToday: m.VALTODAY || 0, trades: m.NUMTRADES || 0, amortChecked: false });
    }
  }
  await mkdir('data', { recursive: true });
  out.sort((a, b) => b.netYield - a.netYield);
  await writeFile('data/bonds.json', JSON.stringify({ updated: new Date().toISOString(), count: out.length, items: out }));
});

console.log(log.join('\n'));
