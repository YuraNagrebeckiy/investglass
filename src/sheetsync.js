const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RES = new Set(['ig_user', 'ig_users', 'ig_sound', 'ig_bsize', 'ig_theme']);
const profile = localStorage.getItem('ig_user') || '';
const PFX = profile ? 'u:' + profile + ':' : '';
const MK = 'cloud2_' + profile;
const MSG = { auth: 'Неверное имя или пароль.', nouser: 'Такого имени нет в облаке.', locked: 'Слишком много неверных попыток, подождите 10 минут.', bad: 'Некорректный запрос.' };
let cfg = null, meta = rdMeta(), busy = false, applying = false, timer = 0, status = '';

function rdMeta() { try { return JSON.parse(localStorage.getItem('cloud2_' + profile)) || { ver: '', dirty: false }; } catch { return { ver: '', dirty: false }; } }
const saveMeta = (m) => { meta = m; localStorage.setItem(MK, JSON.stringify(m)); };
const tok = () => sessionStorage.getItem('cloud_tok') || localStorage.getItem('cloud_tok');
const accounts = () => { try { return JSON.parse(localStorage.getItem('auth_accounts')) || {}; } catch { return {}; } };
const sesName = () => { try { const s = JSON.parse(sessionStorage.getItem('auth_session') || localStorage.getItem('auth_session')); return s ? s.name : null; } catch { return null; } };
const active = () => !!(cfg && tok() && profile && accounts()[profile] && sesName() === profile);
const b64 = (u8) => btoa(String.fromCharCode(...u8));

async function deriveToken(name, pw) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('investglass-cloud:' + name.toLowerCase()), iterations: 120000 }, key, 256);
  return b64(new Uint8Array(bits));
}
async function call(body) {
  const r = await fetch(cfg.url, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' });
  const j = await r.json();
  if (!j.ok) { const e = new Error(MSG[j.err] || j.err || 'ошибка'); e.code = j.err; throw e; }
  return j;
}
const post = (a, extra) => call({ a, n: profile, t: tok(), ...(extra || {}) });

function collect() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith(PFX)) continue;
    const name = k.slice(PFX.length);
    if (!name.startsWith('ig_') || RES.has(name)) continue;
    const v = localStorage.getItem(name);
    if (v != null) out[name] = v;
  }
  return out;
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
  busy = true; clearTimeout(timer);
  try {
    const j = await post('save', { d: collect() });
    saveMeta({ ver: j.ver, dirty: false });
    status = 'Сохранено в Google Таблице в ' + new Date().toLocaleTimeString('ru-RU', { timeStyle: 'short' });
  } catch (e) { status = 'Не удалось сохранить в таблицу: ' + e.message; }
  busy = false; draw();
}
async function pull(manual) {
  if (!active() || busy) return;
  busy = true;
  try {
    let j;
    try { j = await post('load'); } catch (e) { if (e.code === 'nouser') { await post('reg'); j = { ver: '', data: {} }; } else throw e; }
    busy = false;
    if (!j.ver) { saveMeta({ ...meta, dirty: true }); await push(); return; }
    if (meta.dirty) {
      const changed = applyLocal(mergeData(j.data || {}, collect()));
      await push();
      if (changed) location.reload();
    } else if (j.ver !== meta.ver) {
      const changed = applyLocal(j.data || {});
      saveMeta({ ver: j.ver, dirty: false });
      status = 'Данные обновлены из таблицы.';
      if (changed) { location.reload(); return; }
    } else if (manual) status = 'Всё актуально.';
  } catch (e) { busy = false; status = 'Нет связи с таблицей: ' + e.message; }
  draw();
}

const SP = Storage.prototype, setI = SP.setItem, delI = SP.removeItem;
const dirty = () => { if (!active() || applying) return; saveMeta({ ...meta, dirty: true }); clearTimeout(timer); timer = setTimeout(push, 3000); };
SP.setItem = function (k, v) { const r = setI.call(this, k, v); if (typeof k === 'string' && k.startsWith('ig_') && !RES.has(k)) dirty(); return r; };
SP.removeItem = function (k) { const r = delI.call(this, k); if (typeof k === 'string' && k.startsWith('ig_') && !RES.has(k)) dirty(); return r; };

function draw() {
  const box = $('shBox'); if (!box) return;
  if (!cfg) { box.innerHTML = '<h3>Облако</h3><p class="hint">Сохранение в Google Таблицу не подключено. Инструкция в файле <b>sheets/README.md</b> репозитория.</p>'; return; }
  if (!accounts()[profile]) { box.innerHTML = '<h3>Облако</h3><p class="hint">Войдите под своим именем: тогда данные будут сохраняться в Google Таблицу.</p>'; return; }
  if (!active()) { box.innerHTML = '<h3>Облако</h3><p class="hint">Чтобы включить сохранение в Google Таблицу, выйдите и войдите снова с паролем.</p>'; return; }
  box.innerHTML = `<h3>Облако</h3><p>Данные аккаунта <b>${esc(profile)}</b> сохраняются в Google Таблице и открываются на других устройствах по тому же имени и паролю.</p><p class="hint">${esc(status)}</p><button class="btn sm ghost" id="shSync">Синхронизировать</button>`;
  $('shSync').onclick = () => { status = 'Синхронизирую…'; draw(); push().then(() => pull(true)); };
}
function mount() {
  const lg = $('lgBox');
  if (!lg || $('shBox')) return;
  const b = document.createElement('div'); b.id = 'shBox';
  lg.after(b); draw();
  const out = $('lgOut');
  if (out) out.addEventListener('click', () => { sessionStorage.removeItem('cloud_tok'); localStorage.removeItem('cloud_tok'); }, true);
}

function hookGate() {
  const go = $('gGo');
  if (!go || go.__cloud) return;
  go.__cloud = true;
  const note = document.querySelector('#gate .note');
  if (note) note.textContent = 'Данные сохраняются в Google Таблице и доступны на других устройствах по тому же имени и паролю. Пароль защищает вход, а владелец таблицы технически может видеть записи.';
  go.addEventListener('click', async (e) => {
    if (go.__pass) { go.__pass = false; return; }
    e.stopImmediatePropagation(); e.preventDefault();
    const name = $('gName').value.trim().replace(/\s+/g, ' '), pw = $('gPw').value, up = document.querySelector('#gTab .on').dataset.m === 'up', msg = (t) => { $('gMsg').textContent = t; };
    const pass = () => { go.__pass = true; go.disabled = false; go.click(); };
    if (!name || pw.length < 6 || (up && pw !== $('gPw2').value)) { pass(); return; }
    go.disabled = true; msg('Связываюсь с таблицей…');
    try {
      const t = await deriveToken(name, pw), all = accounts(), local = Object.keys(all).find((k) => k.toLowerCase() === name.toLowerCase());
      if (up) {
        if (!local) await call({ a: 'reg', n: name, t });
      } else if (!local) {
        await call({ a: 'load', n: name, t });
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
        const h = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, key, 256));
        all[name] = { s: b64(salt), h: b64(h), i: 150000, c: Date.now() };
        localStorage.setItem('auth_accounts', JSON.stringify(all));
      }
      sessionStorage.setItem('cloud_tok', t);
      if ($('gRem').checked) localStorage.setItem('cloud_tok', t); else localStorage.removeItem('cloud_tok');
      pass();
    } catch (err) {
      go.disabled = false;
      msg(err.code === 'auth' && up ? 'Это имя уже занято в облаке с другим паролем.' : err.code ? err.message : 'Нет связи с таблицей: ' + err.message);
    }
  }, true);
}

(async () => {
  try { cfg = await fetch('config/sheets.json', { cache: 'no-store' }).then((r) => r.json()); } catch { cfg = null; }
  if (!cfg || !cfg.url) cfg = null;
  new MutationObserver(() => { mount(); if (cfg) hookGate(); }).observe(document.body, { childList: true, subtree: true });
  mount(); if (cfg) hookGate();
  if (active()) { pull(); setInterval(() => pull(), 90000); }
  document.addEventListener('visibilitychange', () => { if (!active()) return; if (document.hidden) { if (meta.dirty) push(); } else pull(); });
})();
