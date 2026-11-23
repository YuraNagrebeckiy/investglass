const RESERVED = new Set(['ig_user', 'ig_users', 'ig_sound', 'ig_bsize', 'ig_theme']);
export const profile = localStorage.getItem('ig_user') || '';
const PFX = profile ? 'u:' + profile + ':' : '';
const SP = Storage.prototype, rawGet = SP.getItem, rawSet = SP.setItem, rawDel = SP.removeItem;
const pk = (k) => (PFX && typeof k === 'string' && k.startsWith('ig_') && !RESERVED.has(k) ? PFX + k : k);
SP.getItem = function (k) { return rawGet.call(this, pk(k)); };
SP.setItem = function (k, v) { return rawSet.call(this, pk(k), v); };
SP.removeItem = function (k) { return rawDel.call(this, pk(k)); };

export const soundOn = () => localStorage.getItem('ig_sound') === '1';
let ctx;
function audio() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function beep(f = 880, ms = 200) {
  if (!soundOn()) return;
  try {
    const c = audio(), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = f; g.gain.value = 0.15; o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + ms / 1000);
  } catch { /* audio unavailable */ }
}
export const chime = () => { beep(660, 150); setTimeout(() => beep(990, 220), 180); };

const PAT = {
  price: [[880, 0.12, 'sine'], [880, 0.12, 'sine']],
  deal: [[523, 0.12, 'triangle'], [659, 0.12, 'triangle'], [784, 0.24, 'triangle']],
  reversal: [[784, 0.18, 'sawtooth'], [523, 0.18, 'sawtooth'], [330, 0.34, 'sawtooth']],
};
export function play(kind) {
  if (!soundOn()) return;
  try {
    const c = audio();
    let t = c.currentTime;
    for (const [f, d, type] of PAT[kind] || PAT.price) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.05);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.06);
      t += d + 0.08;
    }
  } catch { /* audio unavailable */ }
}

const paint = () => { const b = document.getElementById('snd'); if (b) b.textContent = soundOn() ? '🔔' : '🔕'; };
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.sheet:not([hidden])').forEach((s) => { if (s.id !== 'ldg') s.hidden = true; });
});
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.classList && t.classList.contains('sheet') && t.id !== 'ldg') t.hidden = true;
});
const logo = document.querySelector('header > b');
if (logo) logo.classList.add('logo');
const sb = document.getElementById('snd');
if (sb) {
  sb.onclick = () => { localStorage.setItem('ig_sound', soundOn() ? '0' : '1'); paint(); if (soundOn()) { audio(); play('price'); } };
  paint();
}

function mountProfile() {
  const head = document.querySelector('header');
  if (!head) return;
  const b = document.createElement('button');
  b.id = 'usr'; b.className = 'mini'; b.textContent = '👤';
  b.title = 'Профиль: ' + (profile || 'Основной');
  head.insertBefore(b, document.getElementById('snd'));
  const sh = document.createElement('div');
  sh.className = 'sheet'; sh.hidden = true; document.body.appendChild(sh);
  const users = () => { try { return JSON.parse(rawGet.call(localStorage, 'ig_users')) || []; } catch { return []; } };
  const draw = () => {
    const list = ['', ...users()];
    sh.innerHTML = `<div class="panel" style="max-width:560px"><div class="sh-head"><h2>Профили</h2><button class="mini" id="usrX">Закрыть</button></div>
    <p class="hint">Профиль хранит журнал, рисунки, уведомления, избранное и планы отдельно от других. Сейчас: <b>${profile || 'Основной'}</b>.</p>
    ${list.map((u) => `<div class="chip"><span><b>${u || 'Основной'}</b></span><button class="mini" data-u="${u}">${u === profile ? 'Текущий' : 'Войти'}</button></div>`).join('')}
    <div class="row"><input id="usrNew" placeholder="Имя нового профиля" style="max-width:240px"><button class="btn sm" id="usrAdd">Создать и войти</button></div>
    <h3>Перенос данных</h3><div class="row"><button class="btn sm ghost" id="usrExp">Скачать данные профиля</button><button class="btn sm ghost" id="usrImp">Загрузить из файла</button><input type="file" id="usrFile" accept="application/json" hidden></div>
    <div class="note">Это профили на этом устройстве, пароля нет, данные лежат в памяти браузера. Для входа с паролем и синхронизации между телефоном и компьютером нужен сервер, например Supabase или Firebase. Пока используйте скачивание и загрузку файла.</div></div>`;
    sh.querySelector('#usrX').onclick = () => { sh.hidden = true; };
    sh.querySelectorAll('[data-u]').forEach((x) => { x.onclick = () => { rawSet.call(localStorage, 'ig_user', x.dataset.u); location.reload(); }; });
    sh.querySelector('#usrAdd').onclick = () => {
      const n = sh.querySelector('#usrNew').value.trim().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 24);
      if (!n) return;
      const u = users(); if (!u.includes(n)) u.push(n);
      rawSet.call(localStorage, 'ig_users', JSON.stringify(u)); rawSet.call(localStorage, 'ig_user', n); location.reload();
    };
    sh.querySelector('#usrExp').onclick = () => {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (PFX ? k.startsWith(PFX) : k.startsWith('ig_') && !RESERVED.has(k)) data[PFX ? k.slice(PFX.length) : k] = rawGet.call(localStorage, k);
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ profile: profile || 'Основной', saved: new Date().toISOString(), data })], { type: 'application/json' }));
      a.download = `investglass-${profile || 'main'}.json`; a.click();
    };
    sh.querySelector('#usrImp').onclick = () => sh.querySelector('#usrFile').click();
    sh.querySelector('#usrFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const js = JSON.parse(await f.text());
        for (const [k, v] of Object.entries(js.data || {})) if (k.startsWith('ig_')) localStorage.setItem(k, v);
        location.reload();
      } catch { alert('Файл не распознан'); }
    };
  };
  b.onclick = () => { draw(); sh.hidden = false; };
}
mountProfile();

const later = (p) => setTimeout(() => { import(p).catch((e) => console.error('module', p, e)); }, 0);
['./fx.js', './calendar.js', './glossary.js', './motion.js', './icon.js', './guide.js'].forEach(later);
