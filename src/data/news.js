const cache = new Map();
let lastAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || '');
  return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

export async function fxNews(query, { max = 8 } = {}) {
  const hit = cache.get(query);
  if (hit && Date.now() - hit.at < 600000) return hit.items;
  const wait = lastAt + 5500 - Date.now();
  if (wait > 0) await sleep(wait);
  lastAt = Date.now();
  const u = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=25&timespan=7d&sort=datedesc`;
  const r = await fetch(u);
  const txt = await r.text();
  let js;
  try { js = JSON.parse(txt); } catch { throw new Error(r.status === 429 ? 'лимит запросов, повторите через несколько секунд' : 'ответ не распознан'); }
  const seen = new Set(), items = [];
  for (const a of js.articles || []) {
    const k = (a.title || '').toLowerCase();
    if (!a.title || seen.has(k)) continue;
    seen.add(k);
    items.push({ title: a.title, url: a.url, domain: a.domain, date: parseDate(a.seendate) });
    if (items.length >= max) break;
  }
  cache.set(query, { at: Date.now(), items });
  return items;
}
