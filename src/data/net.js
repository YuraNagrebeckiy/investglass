const PROXIES = [
  (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  (u) => 'https://thingproxy.freeboard.io/fetch/' + u,
];
export const net = { via: 'напрямую', proxyFirst: false, pi: 0, dead: {} };

function timed(url, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  return fetch(url, { signal: c.signal }).finally(() => clearTimeout(t));
}
async function one(url, ms) {
  const r = await timed(url, ms);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return JSON.parse(await r.text());
}

export async function getJson(url, { timeout = 7000, validate } = {}) {
  const host = new URL(url).host;
  if (net.dead[host] && Date.now() < net.dead[host]) throw new Error('источник ' + host + ' недоступен с вашего подключения');
  const direct = { name: 'напрямую', url, ms: timeout };
  const px = PROXIES.map((p, i) => ({ name: 'через прокси ' + (i + 1), url: p(url), ms: 11000, i }));
  const order = net.proxyFirst ? [px[net.pi], direct, ...px.filter((p) => p.i !== net.pi)] : [direct, ...px];
  let last = null;
  for (const a of order) {
    try {
      const j = await one(a.url, a.ms);
      if (validate && !validate(j)) throw new Error('неожиданный ответ');
      net.proxyFirst = a.i !== undefined; if (a.i !== undefined) net.pi = a.i;
      net.via = a.name; delete net.dead[host];
      return j;
    } catch (e) { last = e; }
  }
  net.dead[host] = Date.now() + 45000;
  throw new Error((last && last.message) || 'нет связи');
}
