const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const META = 'cloud_meta';
const RES = new Set(['ig_user', 'ig_users', 'ig_sound', 'ig_bsize', 'ig_theme']);
const profile = localStorage.getItem('ig_user') || '';
const PFX = profile ? 'u:' + profile + ':' : '';
const rd = () => { try { return JSON.parse(localStorage.getItem(META)); } catch { return null; } };
let cfg = null, meta = rd(), applying = false, pushTimer = 0, busy = false, status = '';
const save = (m) => { meta = m; if (m) localStorage.setItem(META, JSON.stringify(m)); else localStorage.removeItem(META); };
const active = () => !!(cfg && meta && meta.profile === profile && !meta.expired);
const ERR = { invalid_credentials: 'Неверная почта или пароль.', user_already_exists: 'Эта почта уже зарегистрирована, войдите.', weak_password: 'Пароль слишком простой: нужно не менее 6 символов.', email_not_confirmed: 'Подтвердите почту по ссылке из письма и войдите снова.', over_email_send_rate_limit: 'Слишком много писем, попробуйте позже.', signup_disabled: 'Регистрация отключена в проекте.' };

async function api(path, { method = 'GET', body, token, headers } = {}) {
  const r = await fetch(cfg.url.replace(/\/$/, '') + path, { method, headers: { apikey: cfg.key, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || cfg.key), ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = { message: t }; }
  if (!r.ok) { const code = (j && (j.error_code || j.code)) || ''; const e = new Error(ERR[code] || (j && (j.msg || j.message || j.error_description)) || 'Ошибка ' + r.status); e.status = r.status; e.code = code; throw e; }
  return j;
}

function fromSession(s, email) {
  const uid = s.user.id;
  return { uid, email: s.user.email || email, access: s.access_token, refresh: s.refresh_token, exp: Math.floor(Date.now() / 1000) + (s.expires_in || 3600), profile: 'acc-' + uid.slice(0, 8), last: null, dirty: false };
}

async function token() {
  if (!meta) throw new Error('Нет входа');
  if (meta.exp - Date.now() / 1000 > 60) return meta.access;
  try {
    const s = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: meta.refresh } });
    save({ ...meta, access: s.access_token, refresh: s.refresh_token, exp: Math.floor(Date.now() / 1000) + (s.expires_in || 3600) });
    return meta.access;
  } catch (e) { save({ ...meta, expired: true }); status = 'Сессия истекла, войдите снова.'; draw(); throw e; }
}

function collect() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith(PFX)) continue;
    const name = k.slice(PFX.length);
    if (!name.startsWith('ig_') || RES.has(name)) continue;
    const v = localStorage.getItem(name);
    if (v != null && v.length < 400000) out[name] = v;
  }
  return out;
}

function seedFromMain() {
  const fr = document.createElement('iframe');
  fr.style.display = 'none'; document.body.appendChild(fr);
  const raw = fr.contentWindow.Storage.prototype.getItem;
  let n = 0;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  for (const k of keys) {
    if (k.startsWith('ig_') && !RES.has(k)) {
      const v = raw.call(localStorage, k);
      if (v != null && localStorage.getItem(k) == null) { applying = true; localStorage.setItem(k, v); applying = false; n++; }
    }
  }
  fr.remove();
  return n;
}

function mergeData(server, local) {
  const out = { ...server };
  for (const [k, lv] of Object.entries(local)) {
    const sv = server[k];
    if (sv == null) { out[k] = lv; continue; }
    try {
      const a = JSON.parse(sv), b = JSON.parse(lv);
      if (Array.isArray(a) && Array.isArray(b) && [...a, ...b].every((x) => x && typeof x === 'object' && 'id' in x)) {
        const m = new Map(a.map((x) => [x.id, x])); b.forEach((x) => m.set(x.id, x));
        out[k] = JSON.stringify([...m.values()]); continue;
      }
    } catch { /* not JSON */ }
    out[k] = lv;
  }
  return out;
}

function applyLocal(data) {
  let changed = false;
  applying = true;
  const cur = collect();
  for (const k of Object.keys(cur)) if (!(k in data)) { localStorage.removeItem(k); changed = true; }
  for (const [k, v] of Object.entries(data)) if (cur[k] !== v) { localStorage.setItem(k, v); changed = true; }
  applying = false;
  return changed;
}

async function push() {
  if (!active() || busy) return;
  busy = true; clearTimeout(pushTimer);
  try {
    const t = await token();
    const rows = await api('/rest/v1/user_data?on_conflict=user_id', { method: 'POST', token: t, headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: { user_id: meta.uid, data: collect(), updated_at: new Date().toISOString() } });
    save({ ...meta, last: rows && rows[0] ? rows[0].updated_at : meta.last, dirty: false });
    status = 'Сохранено в облаке в ' + new Date().toLocaleTimeString('ru-RU', { timeStyle: 'short' });
  } catch (e) { status = 'Не удалось сохранить в облаке: ' + e.message; }
  busy = false; draw();
}

async function pull(manual) {
  if (!active() || busy) return;
  busy = true;
  try {
    const t = await token();
    const rows = await api('/rest/v1/user_data?select=data,updated_at&user_id=eq.' + meta.uid, { token: t });
    busy = false;
    if (!rows || !rows.length) {
      const n = meta.seeded ? 0 : seedFromMain();
      save({ ...meta, seeded: true, dirty: true });
      status = n ? `Перенесено записей с устройства: ${n}.` : '';
      await push();
      if (n) location.reload();
      return;
    }
    const row = rows[0];
    if (meta.dirty) {
      const merged = mergeData(row.data || {}, collect());
      const changed = applyLocal(merged);
      await push();
      if (changed) location.reload();
    } else if (row.updated_at !== meta.last) {
      const changed = applyLocal(row.data || {});
      save({ ...meta, last: row.updated_at });
      status = 'Данные обновлены из облака.';
      if (changed) { location.reload(); return; }
    } else if (manual) status = 'Всё актуально.';
  } catch (e) { busy = false; status = 'Не удалось связаться с облаком: ' + e.message; }
  draw();
}

function markDirty() {
  if (!active() || applying) return;
  save({ ...meta, dirty: true });
  clearTimeout(pushTimer); pushTimer = setTimeout(push, 2500);
}
const SP = Storage.prototype, setI = SP.setItem, delI = SP.removeItem;
SP.setItem = function (k, v) { const r = setI.call(this, k, v); if (typeof k === 'string' && k.startsWith('ig_') && !RES.has(k)) markDirty(); return r; };
SP.removeItem = function (k) { const r = delI.call(this, k); if (typeof k === 'string' && k.startsWith('ig_') && !RES.has(k)) markDirty(); return r; };

async function login(email, pw, create) {
  const s = create ? await api('/auth/v1/signup', { method: 'POST', body: { email, password: pw } }) : await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: pw } });
  if (!s.access_token) return 'confirm';
  const m = fromSession(s, email);
  save(m);
  localStorage.setItem('ig_user', m.profile);
  location.reload();
  return 'ok';
}

function logout() {
  if (!confirm('Выйти из аккаунта? Данные останутся в облаке, а с этого устройства будут удалены.')) return;
  const run = async () => {
    try { await push(); } catch { /* offline */ }
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (PFX && k && k.startsWith(PFX)) delI.call(localStorage, k); }
    delI.call(localStorage, META); localStorage.setItem('ig_user', ''); location.reload();
  };
  run();
}

function draw() {
  const box = $('accBox');
  if (!box) return;
  const f = (id) => ($(id) ? $(id).value.trim() : '');
  const msg = (t) => { $('accMsg').textContent = t; };
  if (!cfg) {
    box.innerHTML = '<h3>Аккаунт</h3><p class="hint">Регистрация пока не подключена: нужен бесплатный проект Supabase. Инструкция лежит в репозитории, файл <b>supabase/README.md</b>. После подключения здесь появятся вход, регистрация и синхронизация между устройствами.</p>';
    return;
  }
  if (active()) {
    box.innerHTML = `<h3>Аккаунт</h3><p>Вы вошли как <b>${esc(meta.email)}</b>. Журнал, подборки, уведомления, избранное и планы хранятся отдельно для вас и синхронизируются между устройствами.</p><p class="hint" id="accMsg">${esc(status)}</p><div class="row"><button class="btn sm" id="accSync">Синхронизировать</button><button class="btn sm ghost" id="accOut">Выйти</button></div><p class="hint">Данные лежат в облаке Supabase в зашифрованном при хранении виде, но не зашифрованы сквозным шифрованием: владелец проекта технически может их видеть.</p>`;
    $('accSync').onclick = () => { status = 'Синхронизирую…'; draw(); push().then(() => pull(true)); };
    $('accOut').onclick = logout;
    return;
  }
  box.innerHTML = `<h3>Аккаунт</h3>${meta && meta.expired ? '<p class="warn">Сессия истекла, войдите снова.</p>' : ''}<p class="hint">Создайте аккаунт, чтобы журнал и подборки были только вашими и открывались на любом устройстве.</p>
  <div class="two"><label>Почта<input id="accEm" type="email" autocomplete="email" inputmode="email" value="${esc(meta && meta.email || '')}"></label><label>Пароль (от 6 символов)<input id="accPw" type="password" autocomplete="current-password"></label></div>
  <div class="row"><button class="btn sm" id="accIn">Войти</button><button class="btn sm ghost" id="accUp">Зарегистрироваться</button><button class="mini" id="accFg">Забыли пароль</button></div><p class="hint" id="accMsg">${esc(status)}</p>`;
  const go = async (create) => {
    const e = f('accEm'), p = $('accPw').value;
    if (!e || p.length < 6) { msg('Введите почту и пароль не короче 6 символов.'); return; }
    msg('Подождите…');
    try { const r = await login(e, p, create); if (r === 'confirm') msg('Мы отправили письмо. Подтвердите почту по ссылке и затем войдите.'); } catch (x) { msg(x.message); }
  };
  $('accIn').onclick = () => go(false); $('accUp').onclick = () => go(true);
  $('accFg').onclick = async () => { const e = f('accEm'); if (!e) { msg('Введите почту.'); return; } try { await api('/auth/v1/recover', { method: 'POST', body: { email: e } }); msg('Если такая почта есть, мы отправили ссылку для нового пароля.'); } catch (x) { msg(x.message); } };
}

function mount() {
  const x = $('usrX');
  if (!x || $('accBox')) return;
  const sh = x.closest('.panel'); if (!sh) return;
  const box = document.createElement('div'); box.id = 'accBox';
  sh.querySelector('.sh-head').after(box);
  draw();
}

async function recovery() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('type') !== 'recovery' || !h.get('access_token')) return;
  const at = h.get('access_token'), rt = h.get('refresh_token');
  history.replaceState(null, '', location.pathname + location.search);
  const sh = document.createElement('div'); sh.className = 'sheet';
  sh.innerHTML = '<div class="panel" style="max-width:420px"><h2>Новый пароль</h2><label>Пароль (от 6 символов)<input id="rcPw" type="password" autocomplete="new-password"></label><p class="hint" id="rcMsg"></p><button class="btn" id="rcGo">Сохранить и войти</button></div>';
  document.body.appendChild(sh);
  $('rcGo').onclick = async () => {
    const p = $('rcPw').value; if (p.length < 6) { $('rcMsg').textContent = 'Не короче 6 символов.'; return; }
    try {
      const u = await api('/auth/v1/user', { method: 'PUT', token: at, body: { password: p } });
      const m = fromSession({ user: u, access_token: at, refresh_token: rt, expires_in: 3000 });
      save(m); localStorage.setItem('ig_user', m.profile); location.reload();
    } catch (e) { $('rcMsg').textContent = e.message; }
  };
}

(async () => {
  try { cfg = await fetch('config/cloud.json', { cache: 'no-store' }).then((r) => r.json()); } catch { cfg = null; }
  if (!cfg || !cfg.url || !cfg.key) cfg = null;
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
  mount();
  if (cfg) { recovery(); if (active()) { pull(); setInterval(() => pull(), 90000); } }
  document.addEventListener('visibilitychange', () => { if (!active()) return; if (document.hidden) { if (meta.dirty) push(); } else pull(); });
})();
