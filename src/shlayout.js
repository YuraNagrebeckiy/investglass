const $ = (id) => document.getElementById(id);

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
