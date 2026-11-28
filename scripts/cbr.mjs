// Разбор официальных курсов ЦБ РФ (XML). Чистые функции, без сети: их проверяют тесты.
export const CBR_IDS = { USD: 'R01235', EUR: 'R01239', CNY: 'R01375' };
const num = (s) => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
const msk = (y, m, d) => Date.UTC(+y, +m - 1, +d) / 1000 - 3 * 3600;
export const dmy = (t) => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };

// XML_dynamic.asp: история одной валюты за период.
export function parseDynamic(xml) {
  const out = [], re = /<Record\s+Date="(\d+)\.(\d+)\.(\d+)"[^>]*>\s*<Nominal>(\d+)<\/Nominal>\s*<Value>([\d\s,.]+)<\/Value>/g;
  let m;
  while ((m = re.exec(xml))) {
    const v = num(m[5]) / Number(m[4]);
    if (Number.isFinite(v) && v > 0) out.push([msk(m[3], m[2], m[1]), v, v, v, v, 0]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// XML_daily.asp: все валюты на одну дату. Дата берётся из ответа: в выходные ЦБ отдаёт курс прошлого рабочего дня.
export function parseDaily(xml, codes = Object.keys(CBR_IDS)) {
  const d = /<ValCurs[^>]*\sDate="(\d+)\.(\d+)\.(\d+)"/.exec(xml);
  if (!d) return null;
  const t = msk(d[3], d[2], d[1]), rates = {};
  for (const code of codes) {
    const m = new RegExp(`<CharCode>${code}</CharCode>\\s*<Nominal>(\\d+)</Nominal>[\\s\\S]*?<Value>([\\d\\s,.]+)</Value>`).exec(xml);
    if (m) { const v = num(m[2]) / Number(m[1]); if (Number.isFinite(v) && v > 0) rates[code] = v; }
  }
  return Object.keys(rates).length ? { t, rates } : null;
}

// Объединяет старую историю и новые точки по дате, новые значения важнее.
export function mergeSeries(old, add, keep = 320) {
  const m = new Map((old || []).map((r) => [r[0], r]));
  for (const r of add || []) m.set(r[0], r);
  return [...m.values()].sort((a, b) => a[0] - b[0]).slice(-keep);
}
