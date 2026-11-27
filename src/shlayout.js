const $ = (id) => document.getElementById(id);

const net = (window.__igNet = window.__igNet || { pend: new Map(), last: {}, seq: 0 });
if (!net.wrapped) {
  net.wrapped = true;
  const label = (u) => {
    try {
      const x = new URL(u, location.href), h = x.host, all = decodeURIComponent(x.href);
      const via = /corsproxy|allorigins|codetabs|thingproxy/.test(h) ? ' через прокси' : '';
      if (/iss\.moex\.com/.test(h) || (via && /iss\.moex\.com/.test(all))) return 'Котировки Мосбиржи' + via;
      if (/okx\.com/.test(h)) return 'Биржа OKX';
      if (/coingecko/.test(h)) return 'CoinGecko (фундамент)';
      if (/unpkg/.test(h)) return 'Библиотека графиков';
      if (/script\.google\.com/.test(h)) return 'Google Таблица';
      if (/cbr-xml-daily/.test(h)) return 'Курсы ЦБ РФ';
      if (/frankfurter/.test(h)) return 'Курсы валют ЕЦБ';
      if (h === location.host) return 'Файлы приложения';
      return h + via;
    } catch { return 'Данные'; }
  };
  const of = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const u = typeof input === 'string' ? input : (input && input.url) || String(input), id = ++net.seq, l = label(u), t0 = Date.now();
    net.pend.set(id, { l, t0 });
    return of(input, init).then((r) => { net.pend.delete(id); net.last[l] = { ok: r.ok, status: r.status, ms: Date.now() - t0 }; return r; }, (e) => { net.pend.delete(id); net.last[l] = { ok: false, err: (e && e.message) || 'нет связи', ms: Date.now() - t0 }; throw e; });
  };
}

let lockY = 0, locked = false;
function lockSync() {
  const open = !!document.querySelector('.sheet:not([hidden])');
  if (open && !locked) {
    lockY = window.scrollY; locked = true;
    document.body.style.top = -lockY + 'px';
    document.body.classList.add('lock');
  } else if (!open && locked) {
    locked = false;
    document.body.classList.remove('lock');
    document.body.style.top = '';
    window.scrollTo({ top: lockY, left: 0, behavior: 'instant' });
  }
}
new MutationObserver(lockSync).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
lockSync();
document.addEventListener('scroll', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('sheet') && t.scrollLeft) t.scrollLeft = 0; }, true);

function build() {
  const sh = $('sheet'), ch = $('shChart');
  if (!sh || sh.hidden || !ch) return;
  sh.querySelectorAll('.mini-t th:first-child').forEach((t) => { if (t.textContent !== 'ТФ') t.textContent = 'ТФ'; });
  let top = sh.querySelector('.sh-top');
  if (!top) {
    const dir = $('shDir'), tf = $('shTf'), lights = $('shLights');
    if (!dir || !tf || !lights) return;
    const hint = ch.nextElementSibling && ch.nextElementSibling.tagName === 'P' ? ch.nextElementSibling : null;
    top = document.createElement('div'); top.className = 'sh-top';
    const left = document.createElement('div'); left.className = 'sh-left';
    const right = document.createElement('div'); right.className = 'sh-right';
    top.append(left, right);
    lights.before(top);
    [dir, tf, ...sh.querySelectorAll('.dtb'), ch].forEach((e) => left.appendChild(e));
    if (hint) left.appendChild(hint);
  }
  const right = top.querySelector('.sh-right');
  const pb = $('patBox'); if (pb && pb.parentNode !== right) right.prepend(pb);
  const cb = $('cdBox'); if (cb && cb.parentNode !== right) right.append(cb);
}
document.addEventListener('ig:chart', () => { build(); setTimeout(build, 120); setTimeout(build, 400); });
const sh = $('sheet');
if (sh) new MutationObserver(build).observe(sh, { childList: true, subtree: true });
build();
