const $ = (id) => document.getElementById(id);

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
