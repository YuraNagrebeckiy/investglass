import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseBoard } from '../src/data/bondsIss.js';

const ISS = 'https://iss.moex.com/iss';
const j = async (u) => {
  for (let k = 0; k < 3; k++) {
    const r = await fetch(u, { headers: { 'user-agent': 'investglass/0.3' } });
    if (r.ok) return r;
    if (k === 2) throw new Error(u + ' ' + r.status);
    await new Promise((res) => setTimeout(res, 1500 * (k + 1)));
  }
};
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
  if (!m) throw new Error('key rate table not recognised');
  const rates = await rd('config/rates.json');
  const [d, mo, y] = m[1].split('.');
  rates.keyRate.value = parseFloat(m[2].replace(',', '.')); rates.keyRate.asOf = `${y}-${mo}-${d}`; rates.updated = today();
  await writeFile('config/rates.json', JSON.stringify(rates, null, 1));
});

const stats = {};

await step('moex-bonds', async () => {
  const bl = await (await j(`${ISS}/engines/stock/markets/bonds/boards.json?iss.meta=off`)).json();
  const cols = bl.boards.columns, idx = (c) => cols.indexOf(c);
  const boards = bl.boards.data.filter((r) => r[idx('is_traded')] === 1 && /^TQ/.test(r[idx('boardid')])).map((r) => r[idx('boardid')]);
  if (!boards.length) boards.push('TQCB', 'TQOB');
  stats.boards = boards;
  const byId = new Map();
  for (const board of boards) {
    let got = 0;
    for (let start = 0; start < 5000; start += 100) {
      const js = await (await j(`${ISS}/engines/stock/markets/bonds/boards/${board}/securities.json?iss.meta=off&start=${start}`)).json();
      const rows = parseBoard(board, js);
      let fresh = 0;
      for (const b of rows) if (!byId.has(b.secid)) { byId.set(b.secid, b); fresh++; }
      got += fresh;
      if (!fresh) break;
    }
    stats['board_' + board] = got;
  }
  const out = [...byId.values()].sort((a, b) => b.volToday - a.volToday);
  await mkdir('data', { recursive: true });
  await writeFile('data/bonds.json', JSON.stringify({ updated: new Date().toISOString(), count: out.length, items: out }));
  stats.bonds = out.length;
});

await step('moex-enrich', async () => {
  const d = await rd('data/bonds.json');
  const targets = d.items.filter((x) => x.volToday > 0).slice(0, 1200);
  let i = 0, okDesc = 0, okAm = 0;
  const worker = async () => {
    while (i < targets.length) {
      const b = targets[i++];
      try {
        const dsc = await (await j(`${ISS}/securities/${b.secid}.json?iss.meta=off&iss.only=description`)).json();
        const get = (n) => { const r = dsc.description.data.find((x) => x[0] === n); return r ? r[2] : null; };
        const q = get('ISQUALIFIEDINVESTORS');
        if (q != null) b.qual = String(q) === '1';
        b.typeName = get('TYPENAME') || get('SECTYPE');
        b.early = get('EARLYREPAYMENT');
        okDesc++;
      } catch { /* leave unknown */ }
      try {
        const am = await (await j(`${ISS}/securities/${b.secid}/bondization.json?iss.meta=off&iss.only=amortizations&limit=100`)).json();
        b.amort = (am.amortizations?.data || []).length > 1; b.amortChecked = true; okAm++;
      } catch { /* leave unknown */ }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  stats.enriched = { targets: targets.length, description: okDesc, amortization: okAm };
  d.enrichedAt = new Date().toISOString();
  await writeFile('data/bonds.json', JSON.stringify(d));
});

await mkdir('data', { recursive: true });
await writeFile('data/status.json', JSON.stringify({ updated: new Date().toISOString(), log, stats }, null, 1));
console.log(log.join('\n'));
