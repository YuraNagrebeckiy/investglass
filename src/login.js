const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RES = new Set(['ig_user', 'ig_users', 'ig_sound', 'ig_bsize', 'ig_theme']);
const ACC = 'auth_accounts', SES = 'auth_session', ITER = 150000;
const getAcc = () => { try { return JSON.parse(localStorage.getItem(ACC)) || {}; } catch { return {}; } };
const setAcc = (a) => localStorage.setItem(ACC, JSON.stringify(a));
const profile = localStorage.getItem('ig_user') || '';
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let fails = 0, lockUntil = 0;

async function hash(pw, salt, iter = ITER) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
function session() {
  try { return JSON.parse(sessionStorage.getItem(SES) || localStorage.getItem(SES)); } catch { return null; }
}
function setSession(name, remember) {
  const v = JSON.stringify({ name, t: Date.now() });
  sessionStorage.setItem(SES, v);
  if (remember) localStorage.setItem(SES, v); else localStorage.removeItem(SES);
}
const clearSession = () => { sessionStorage.removeItem(SES); localStorage.removeItem(SES); };

function frameStore() {
  const fr = document.createElement('iframe');
  fr.style.display = 'none'; document.body.appendChild(fr);
  const P = fr.contentWindow.Storage.prototype;
  return { get: (k) => P.getItem.call(localStorage, k), set: (k, v) => P.setItem.call(localStorage, k, v), rm: (k) => P.removeItem.call(localStorage, k), done: () => fr.remove() };
}
function profileKeys(name) {
  const st = frameStore(), out = {}, pfx = name ? 'u:' + name + ':' : '';
  const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  for (const k of keys) {
    if (pfx ? k.startsWith(pfx) : k.startsWith('ig_')) {
      const n = pfx ? k.slice(pfx.length) : k;
      if (n.startsWith('ig_') && !RES.has(n)) out[n] = st.get(k);
    }
  }
  st.done(); return out;
}
function wipeProfile(name) {
  const st = frameStore(), pfx = 'u:' + name + ':';
  const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  keys.filter((k) => k.startsWith(pfx)).forEach((k) => st.rm(k)); st.done();
}

const css = document.createElement('style');
css.textContent = '#gate{position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;padding:14px;background:linear-gradient(165deg,var(--bg1),var(--bg2));overflow:auto}#gate .panel{width:min(440px,100%);margin:auto}#gate h1{font:italic 600 34px/1 var(--logo);margin:0 0 6px}#gate .seg{margin:10px 0}#gate .lk{background:none;border:0;color:var(--info);text-decoration:underline;cursor:pointer;font:inherit;padding:8px 0}#gMsg{min-height:20px}#accBox.off{display:none}';
document.head.appendChild(css);

function gate() {
  if (document.getElementById('gate')) return;
  const accs = getAcc(), has = Object.keys(accs).length > 0;
  const cnt = Object.keys(profileKeys(profile)).length;
  const g = document.createElement('div'); g.id = 'gate';
  g.innerHTML = `<div class="panel"><h1>InvestGlass</h1><p class="hint">Войдите, чтобы открыть своё: у каждого имени отдельные журнал, подборки, уведомления и рисунки.</p>
  <div class="seg" id="gTab"><button data-m="in" class="${has ? 'on' : ''}">Войти</button><button data-m="up" class="${has ? '' : 'on'}">Создать аккаунт</button></div>
  <label>Имя (логин)<input id="gName" autocomplete="username" autocapitalize="none" maxlength="24"></label>
  <label>Пароль (от 6 символов)<input id="gPw" type="password" autocomplete="current-password"></label>
  <div id="gRep" hidden><label>Повторите пароль<input id="gPw2" type="password" autocomplete="new-password"></label>${cnt ? `<label class="chk"><input type="checkbox" id="gImp" checked> Перенести в аккаунт данные этого устройства (${cnt} записей)</label>` : ''}</div>
  <label class="chk"><input type="checkbox" id="gRem" checked> Запомнить на этом устройстве</label>
  <p class="warn" id="gMsg"></p><button class="btn" id="gGo">Войти</button>
  <button class="lk" id="gGuest">Продолжить без входа</button>
  <div class="note">Пароль защищает вход в приложение на этом устройстве, но данные в памяти браузера не шифруются. Аккаунты не синхронизируются между устройствами: для этого нужен сервер.</div></div>`;
  document.body.appendChild(g);
  let mode = has ? 'in' : 'up';
  const setMode = (m) => {
    mode = m;
    g.querySelectorAll('#gTab button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    $('gRep').hidden = m === 'in'; $('gGo').textContent = m === 'in' ? 'Войти' : 'Создать и войти';
    $('gPw').autocomplete = m === 'in' ? 'current-password' : 'new-password'; $('gMsg').textContent = '';
  };
  setMode(mode);
  $('gTab').onclick = (e) => { if (e.target.dataset.m) setMode(e.target.dataset.m); };
  const msg = (t) => { $('gMsg').textContent = t; };
  const finish = (name, remember) => {
    setSession(name, remember);
    if (profile === name) { g.remove(); } else { localStorage.setItem('ig_user', name); location.reload(); }
  };
  $('gGo').onclick = async () => {
    const name = $('gName').value.trim().replace(/\s+/g, ' '), pw = $('gPw').value, rem = $('gRem').checked;
    if (Date.now() < lockUntil) { msg('Слишком много попыток, подождите ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' с.'); return; }
    if (!name || !/^[\p{L}\p{N} _-]{2,24}$/u.test(name)) { msg('Имя: 2–24 символа, буквы, цифры, пробел, дефис или подчёркивание.'); return; }
    if (pw.length < 6) { msg('Пароль не короче 6 символов.'); return; }
    $('gGo').disabled = true; msg('Проверяю…');
    try {
      const all = getAcc(), key = Object.keys(all).find((k) => k.toLowerCase() === name.toLowerCase());
      if (mode === 'up') {
        if (key) { msg('Это имя занято, выберите другое или войдите.'); $('gGo').disabled = false; return; }
        if (pw !== $('gPw2').value) { msg('Пароли не совпадают.'); $('gGo').disabled = false; return; }
        const salt = crypto.getRandomValues(new Uint8Array(16)), h = await hash(pw, salt);
        all[name] = { s: b64(salt), h: b64(h), i: ITER, c: Date.now() }; setAcc(all);
        if ($('gImp') && $('gImp').checked) { const data = profileKeys(profile), st = frameStore(); for (const [k, v] of Object.entries(data)) st.set('u:' + name + ':' + k, v); st.done(); }
        finish(name, rem);
      } else {
        if (!key) { msg('Такого имени нет. Проверьте написание или создайте аккаунт.'); $('gGo').disabled = false; return; }
        const a = all[key], h = await hash(pw, unb64(a.s), a.i);
        if (b64(h) !== a.h) { fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; } msg('Неверное имя или пароль.'); $('gGo').disabled = false; return; }
        fails = 0; finish(key, rem);
      }
    } catch (e) { msg('Не удалось: ' + e.message + '. Нужен https и современный браузер.'); $('gGo').disabled = false; }
  };
  $('gGuest').onclick = () => {
    const accounts = getAcc();
    setSession('', false); localStorage.setItem('auth_skip', '1');
    if (profile && Object.keys(accounts).some((k) => k.toLowerCase() === profile.toLowerCase())) { localStorage.setItem('ig_user', ''); location.reload(); } else g.remove();
  };
  g.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('gGo').click(); });
}

function needGate() {
  const names = Object.keys(getAcc()), s = session(), isAcc = names.includes(profile);
  if (isAcc && s && s.name === profile) return false;
  if (!isAcc && (localStorage.getItem('auth_skip') || (s && s.name === ''))) return false;
  return true;
}

function profileBlock() {
  const x = $('usrX'); if (!x || $('lgBox')) return;
  const panel = x.closest('.panel'); if (!panel) return;
  const acc = getAcc(), isAcc = Object.keys(acc).some((k) => k === profile);
  const box = document.createElement('div'); box.id = 'lgBox';
  box.innerHTML = `<h3>Вход</h3>${isAcc ? `<p>Вы вошли как <b>${esc(profile)}</b>. Всё, что вы записываете, хранится только под этим именем на этом устройстве.</p><div class="row"><button class="btn sm ghost" id="lgOut">Выйти</button><button class="btn sm ghost" id="lgPw">Сменить пароль</button><button class="mini" id="lgDel">Удалить аккаунт</button></div>` : '<p>Вы работаете без входа. Войдите или создайте аккаунт, чтобы хранить данные под своим именем.</p><div class="row"><button class="btn sm" id="lgIn">Войти или создать аккаунт</button></div>'}<p class="hint" id="lgMsg"></p>`;
  panel.querySelector('.sh-head').after(box);
  const out = () => { clearSession(); localStorage.removeItem('auth_skip'); localStorage.setItem('ig_user', ''); location.reload(); };
  if ($('lgOut')) $('lgOut').onclick = out;
  if ($('lgIn')) $('lgIn').onclick = out;
  if ($('lgPw')) $('lgPw').onclick = async () => {
    const old = prompt('Текущий пароль:'); if (old == null) return;
    const all = getAcc(), a = all[profile];
    if (b64(await hash(old, unb64(a.s), a.i)) !== a.h) { $('lgMsg').textContent = 'Текущий пароль неверный.'; return; }
    const nw = prompt('Новый пароль (от 6 символов):'); if (!nw || nw.length < 6) { $('lgMsg').textContent = 'Пароль не изменён: нужно не менее 6 символов.'; return; }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    all[profile] = { ...a, s: b64(salt), h: b64(await hash(nw, salt)), i: ITER }; setAcc(all); $('lgMsg').textContent = 'Пароль изменён.';
  };
  if ($('lgDel')) $('lgDel').onclick = async () => {
    const pw = prompt('Чтобы удалить аккаунт «' + profile + '» и все его данные на этом устройстве, введите пароль:'); if (!pw) return;
    const all = getAcc(), a = all[profile];
    if (b64(await hash(pw, unb64(a.s), a.i)) !== a.h) { $('lgMsg').textContent = 'Пароль неверный.'; return; }
    if (!confirm('Удалить безвозвратно?')) return;
    wipeProfile(profile); delete all[profile]; setAcc(all); out();
  };
}

new MutationObserver(() => { profileBlock(); const a = $('accBox'); if (a && !a.classList.contains('off') && a.textContent.includes('пока не подключена')) a.classList.add('off'); }).observe(document.body, { childList: true, subtree: true });
if (needGate()) { if (document.body) gate(); else document.addEventListener('DOMContentLoaded', gate); }
profileBlock();
