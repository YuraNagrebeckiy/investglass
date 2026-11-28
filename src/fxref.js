import './stockshare.js';

// Пояснения под карточками валют: чем отличается биржевая цена от официального курса ЦБ и на сколько.
const NAMES = { 'Доллар': 'USD', 'Евро': 'EUR', 'Юань': 'CNY' };
let ref = null, refT = 0;
const rub = (x) => x.toFixed(2).replace('.', ',') + ' ₽';

async function loadRef() {
  if (ref && Date.now() - refT < 60000) return ref;
  try { ref = await fetch('data/fx.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); } catch { ref = null; }
  refT = Date.now();
  return ref;
}

async function decorate() {
  const box = document.getElementById('fxCards');
  if (!box) return;
  const cards = [...box.querySelectorAll('.fxc')].filter((c) => !c.querySelector('.fxref') && c.querySelector('.px'));
  if (!cards.length) return;
  const sn = await loadRef();
  for (const c of cards) {
    if (c.querySelector('.fxref')) continue;
    const code = NAMES[(c.querySelector('h2') || {}).textContent];
    const px = parseFloat(((c.querySelector('.px') || {}).textContent || '').replace(',', '.'));
    const src = (c.querySelector('small.hint') || {}).textContent || '';
    if (!code || !(px > 0)) continue;
    const p = document.createElement('p');
    p.className = 'hint fxref';
    const x = sn && sn[code] && sn[code].candles && sn[code].candles.length ? sn[code].candles[sn[code].candles.length - 1] : null;
    const cbrRef = x && /ЦБ/.test(sn[code].source || '');
    const cbrDay = x ? new Date((x[0] + 10800) * 1000).toLocaleDateString('ru-RU') : '';
    if (/ЦБ/.test(src)) {
      p.textContent = 'Это официальный курс ЦБ РФ на указанную дату, а не цена биржевых торгов. Биржевая цена обычно отличается на десятые доли процента и меняется в течение дня.';
    } else if (cbrRef) {
      const d = ((px / x[4] - 1) * 100).toFixed(2).replace('.', ',');
      p.textContent = `Это биржевая цена Мосбиржи, она меняется в течение дня. Официальный курс ЦБ на ${cbrDay}: ${rub(x[4])}. Разница ${d}%: это нормально, у них разная природа.`;
    } else {
      p.textContent = 'Это биржевая цена Мосбиржи, она меняется в течение дня. Официальный курс ЦБ для сверки пока не загружен.';
    }
    const anchor = c.querySelector('.fxt');
    (anchor || c.lastElementChild).after(p);
  }
}
new MutationObserver(() => { decorate(); }).observe(document.body, { childList: true, subtree: true });
decorate();
