import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseBoard } from '../src/data/bondsIss.js';
import { CBR_IDS, parseDynamic, parseDaily, mergeSeries, dmy } from './cbr.mjs';

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

const tbl = (js, t) => (js[t] ? js[t].data.map((r) => Object.fromEntries(js[t].columns.map((c, i) => [c, r[i]]))) : []);
const cand = async (base, id, days) => {
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const js = await (await j(`${ISS}/engines/${base}/securities/${id}/candles.json?iss.meta=off&interval=24&from=${from}`)).json();
  return tbl(js, 'candles').map((r) => [Math.floor(Date.parse(r.begin.replace(' ', 'T') + '+03:00') / 1000), r.open, r.high, r.low, r.close, r.volume]);
};

await step('moex-fx', async () => {
  const FX = {
    USD: [['USDRUBF', 'futures/markets/forts'], ['USDRUB_TOM', 'currency/markets/selt/boards/CETS']],
    EUR: [['EURRUBF', 'futures/markets/forts'], ['EURRUB_TOM', 'currency/markets/selt/boards/CETS']],
    CNY: [['CNYRUBF', 'futures/markets/forts'], ['CNYRUB_TOM', 'currency/markets/selt/boards/CETS']],
  };
  const out = {};
  for (const [code, list] of Object.entries(FX)) {
    for (const [id, base] of list) {
      try { const c = await cand(base, id, 420); if (c.length > 30) { out[code] = { source: id, candles: c }; break; } } catch { /* next source */ }
    }
  }
  if (!Object.keys(out).length) throw new Error('no fx series');
  await writeFile('data/fx.json', JSON.stringify({ updated: new Date().toISOString(), ...out }));
  stats.fx = Object.keys(out);
});

// Если Мосбиржа не отдала валюту, кладём в тот же файл официальный курс ЦБ (только закрытие). История накапливается из запуска в запуск.
await step('cbr-fx', async () => {
  let base = {};
  try { base = await rd('data/fx.json'); } catch { /* файла ещё нет */ }
  const viaMoex = new Set(stats.fx || []);
  const need = Object.keys(CBR_IDS).filter((c) => !viaMoex.has(c));
  if (!need.length) return;
  const txt = async (u) => (await j(u)).text();
  const from = Date.now() - 430 * 864e5, to = Date.now() + 864e5;
  const series = {};
  for (const code of need) {
    try {
      const rows = parseDynamic(await txt(`https://www.cbr.ru/scripts/XML_dynamic.asp?date_req1=${dmy(from)}&date_req2=${dmy(to)}&VAL_NM_RQ=${CBR_IDS[code]}`));
      if (rows.length >= 60) series[code] = rows;
    } catch (e) { stats.cbrDynamic = e.message; }
  }
  const lacking = need.filter((c) => !series[c]);
  if (lacking.length) {
    const prev = Object.fromEntries(lacking.map((c) => [c, base[c] && /ЦБ/.test(base[c].source || '') ? base[c].candles : []]));
    const have = new Set(lacking.flatMap((c) => prev[c].map((r) => dmy((r[0] + 10800) * 1000))));
    const todo = [];
    for (let i = 0; i < 260 && todo.length < 170; i++) {
      const t = Date.now() - i * 864e5, wd = new Date(t).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      if (todo.length < 6 || !have.has(dmy(t))) todo.push(t);
    }
    const add = Object.fromEntries(lacking.map((c) => [c, []]));
    let k = 0;
    const worker = async () => {
      while (k < todo.length) {
        const t = todo[k++];
        try {
          const d = parseDaily(await txt(`https://www.cbr.ru/scripts/XML_daily.asp?date_req=${dmy(t)}`), lacking);
          if (d) for (const c of lacking) if (d.rates[c]) add[c].push([d.t, d.rates[c], d.rates[c], d.rates[c], d.rates[c], 0]);
        } catch (e) { stats.cbrDaily = e.message; }
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    for (const c of lacking) { const m = mergeSeries(prev[c], add[c]); if (m.length > 30) series[c] = m; }
  }
  if (!Object.keys(series).length) throw new Error('курсы ЦБ не получены: ' + (stats.cbrDynamic || stats.cbrDaily || 'нет ответа'));
  const next = { updated: new Date().toISOString() };
  for (const c of Object.keys(CBR_IDS)) {
    if (viaMoex.has(c) && base[c]) next[c] = base[c];
    else if (series[c]) next[c] = { source: 'официальный курс ЦБ РФ, только закрытие', candles: series[c].slice(-320) };
  }
  await writeFile('data/fx.json', JSON.stringify(next));
  stats.fxCbr = Object.keys(series);
});

await step('moex-stocks', async () => {
  const js = await (await j(`${ISS}/engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=securities,marketdata`)).json();
  const md = Object.fromEntries(tbl(js, 'marketdata').map((x) => [x.SECID, x]));
  const list = tbl(js, 'securities').filter((s) => s.LISTLEVEL != null && [1, 2].includes(s.LISTLEVEL))
    .map((s) => { const m = md[s.SECID] || {}; return { id: s.SECID, name: s.SHORTNAME || s.SECID, board: 'TQBR', level: s.LISTLEVEL, price: m.LAST || s.PREVPRICE, vol: m.VALTODAY || 0, chg24: m.LASTCHANGEPRC ?? 0 }; })
    .sort((a, b) => b.vol - a.vol).slice(0, 40);
  const candles = {};
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const s = list[i++];
      try { const c = await cand('stock/markets/shares/boards/TQBR', s.id, 420); if (c.length > 30) candles[s.id] = c; } catch { /* skip */ }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  try { candles.IMOEX = await cand('stock/markets/index/boards/SNDX', 'IMOEX', 420); } catch { /* skip */ }
  await writeFile('data/stocks.json', JSON.stringify({ updated: new Date().toISOString(), list: list.filter((s) => candles[s.id]), candles }));
  stats.stocks = Object.keys(candles).length;
});

await mkdir('data', { recursive: true });
await writeFile('data/status.json', JSON.stringify({ updated: new Date().toISOString(), log, stats }, null, 1));
console.log(log.join('\n'));
