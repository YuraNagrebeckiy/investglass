const SEL_NUM = '.k b,.px,.pxs,.bi .r>b,.st b,.cm b,.ce .amt,.ce>.a,#fCount,.tp .r,.ind b,#ldgPct,.kpis b';
const SEL_STATE = '.dot,.badge,.verdict,.fxt,.tag';
const SEL_BAR = '.st i,.cm i,.bar2 i';
const last = new Map(), lastBar = new Map(), lastState = new Map();
const num = (s) => parseFloat(String(s).replace(/\s/g, '').replace(',', '.').replace(/[^\d.+-]/g, ''));
const keyOf = (el, sel) => {
  const box = el.closest('[id]');
  const scope = box ? box.id : 'root';
  const same = box ? box.querySelectorAll(sel) : document.querySelectorAll(sel);
  let i = 0;
  for (const x of same) { if (x === el) break; i++; }
  return scope + '|' + sel.length + '|' + i;
};
const flash = (el, cls) => {
  el.classList.remove('up', 'down', 'chg');
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 1200);
};

function scan(root) {
  if (!root || root.nodeType !== 1) return;
  const pick = (sel) => [...(root.matches && root.matches(sel) ? [root] : []), ...root.querySelectorAll(sel)];
  for (const el of pick(SEL_NUM)) {
    const k = keyOf(el, SEL_NUM), now = el.textContent.trim(), old = last.get(k);
    last.set(k, now);
    if (old !== undefined && old !== now) {
      const a = num(old), b = num(now);
      flash(el, Number.isFinite(a) && Number.isFinite(b) && a !== b ? (b > a ? 'up' : 'down') : 'chg');
    }
  }
  for (const el of pick(SEL_STATE)) {
    const k = keyOf(el, SEL_STATE), now = el.className + '|' + el.textContent.trim(), old = lastState.get(k);
    lastState.set(k, now);
    if (old !== undefined && old !== now) flash(el, 'chg');
  }
  for (const el of pick(SEL_BAR)) {
    const k = keyOf(el, SEL_BAR), target = el.style.width;
    const prev = lastBar.get(k);
    lastBar.set(k, target);
    if (prev !== undefined && prev !== target && target) {
      el.style.width = prev;
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.width = target; }));
    }
  }
}

let queue = new Set(), timer = 0;
function flushSoon() {
  clearTimeout(timer);
  timer = setTimeout(() => { const q = [...queue]; queue = new Set(); q.forEach(scan); }, 30);
}
new MutationObserver((ms) => {
  for (const m of ms) {
    for (const n of m.addedNodes) queue.add(n.nodeType === 1 ? n : n.parentElement);
    if (m.type === 'characterData' && m.target.parentElement) queue.add(m.target.parentElement);
  }
  queue.delete(null);
  flushSoon();
}).observe(document.body, { childList: true, subtree: true, characterData: true });

const nav = document.getElementById('tabs');
if (nav) {
  const pill = document.createElement('i');
  pill.className = 'nav-pill';
  nav.prepend(pill);
  const place = () => {
    const on = nav.querySelector('button.on');
    if (!on) return;
    pill.style.left = on.offsetLeft + 'px';
    pill.style.width = on.offsetWidth + 'px';
    const l = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, l), behavior: 'smooth' });
  };
  nav.addEventListener('click', () => requestAnimationFrame(place));
  new MutationObserver(() => requestAnimationFrame(place)).observe(nav, { childList: true, attributes: true, subtree: true, attributeFilter: ['class'] });
  window.addEventListener('resize', place);
  window.addEventListener('load', place);
  setTimeout(place, 50);
  document.fonts && document.fonts.ready.then(place);
}
scan(document.body);
