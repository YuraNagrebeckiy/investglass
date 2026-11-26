const $ = (id) => document.getElementById(id);
const css = document.createElement('style');
css.textContent = '#cfgRefresh .row{margin:6px 0}#cfgRfMsg{min-height:20px}';
document.head.appendChild(css);

const LIT = /['"`](\.{1,2}\/[\w./-]+\.(?:js|css|json|svg))['"`]/g;
const ATTR = /(?:src|href)=["']([^"':#?]+\.(?:js|css|svg|webmanifest))["']/g;

async function crawl(onP) {
  const base = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
  const queue = ['index.html', 'styles.css', 'layout.css', 'ui.css', 'sw.js'].map((p) => new URL(p, base).href);
  const seen = new Set(queue);
  let done = 0, failed = 0;
  const one = async (u) => {
    try {
      const r = await fetch(u, { cache: 'reload' });
      if (!r.ok) { if (!/ui\.css|layout\.css|sw\.js/.test(u)) failed++; return; }
      done++;
      if (/\.(js|html)$|\/$/.test(u.split('?')[0]) || u === new URL('index.html', base).href) {
        const t = await r.text(), found = [];
        for (const m of t.matchAll(LIT)) found.push(m[1]);
        if (u.endsWith('.html')) for (const m of t.matchAll(ATTR)) found.push(m[1]);
        for (const f of found) {
          let n; try { n = new URL(f, u); } catch { continue; }
          if (n.origin !== location.origin || !n.href.startsWith(base) || /\/data\//.test(n.pathname)) continue;
          n.search = ''; n.hash = '';
          if (!seen.has(n.href)) { seen.add(n.href); queue.push(n.href); }
        }
      }
    } catch { failed++; }
    onP(done, seen.size);
  };
  let i = 0;
  const worker = async () => { while (i < queue.length) await one(queue[i++]); };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { done, failed, base };
}

async function fullRefresh() {
  const btn = $('cfgRfGo'), msg = $('cfgRfMsg');
  btn.disabled = true;
  msg.textContent = 'Скачиваю свежие файлы…';
  try {
    const r = await crawl((d, n) => { msg.textContent = `Скачиваю свежие файлы: ${d} из ${n}`; });
    if (r.done < 3) throw new Error('нет связи с сервером');
    msg.textContent = 'Очищаю кэш…';
    if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((g) => g.unregister())); }
    if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
    msg.textContent = `Готово: обновлено файлов ${r.done}. Перезапускаю…`;
    setTimeout(() => { location.replace(r.base + '?r=' + Date.now()); }, 400);
  } catch (e) {
    btn.disabled = false;
    msg.textContent = 'Не удалось обновить: ' + e.message + '. Кэш не тронут, приложение работает как раньше.';
  }
}

function mount() {
  const sh = $('cfgSheet');
  if (!sh || sh.hidden || $('cfgRefresh')) return;
  const note = sh.querySelector('.note');
  const wrap = document.createElement('div');
  wrap.id = 'cfgRefresh';
  wrap.innerHTML = '<h3>Обновление приложения</h3><p class="hint">Полное обновление работает как Ctrl+Shift+R: приложение заново скачивает все файлы, очищает кэш и перезапускается. Ваши данные, аккаунты, журнал и настройки при этом не удаляются, переустанавливать иконку на экране «Домой» не нужно.</p><div class="row"><button class="btn sm" id="cfgRfGo">Полное обновление</button></div><p class="hint" id="cfgRfMsg"></p>';
  if (note) note.before(wrap); else sh.querySelector('.panel').appendChild(wrap);
  $('cfgRfGo').onclick = fullRefresh;
}
new MutationObserver(mount).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
mount();
