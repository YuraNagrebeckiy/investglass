import { SYMBOLS, parseFrankfurter } from '../engine/pairs.js';

export async function loadWorld() {
  const from = new Date(Date.now() - 430 * 864e5).toISOString().slice(0, 10), syms = SYMBOLS.join(',');
  const urls = [`https://api.frankfurter.dev/v1/${from}..?base=USD&symbols=${syms}`, `https://api.frankfurter.dev/v2/rates?from=${from}&base=USD&quotes=${syms}`];
  let err = null;
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const days = parseFrankfurter(await r.json());
      if (days.length > 60) return days;
      throw new Error('мало данных');
    } catch (e) { err = e; }
  }
  throw err;
}
