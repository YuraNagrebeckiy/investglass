const $ = (id) => document.getElementById(id);
const css = document.createElement('style');
css.textContent = '#scanFind{margin:8px 0 4px}#scanFind input{margin:0}#scanFind .hint{margin:4px 2px}';
document.head.appendChild(css);
let prevView = null, box = null;

function rows() { return [...document.querySelectorAll('#scanTbl tr[data-id]')]; }
function apply() {
  if (!box) return;
  const q = $('scanQ').value.trim().toLowerCase(), all = rows();
  box.hidden = !all.length && !q;
  let shown = 0;
  for (const r of all) {
    const ok = !q || (r.dataset.id || '').toLowerCase().includes(q) || r.children[1].textContent.toLowerCase().includes(q);
    r.hidden = !ok; if (ok) shown++;
  }
  const info = $('scanQi');
  if (!q) info.textContent = all.length ? `Проанализировано активов в таблице: ${all.length}. Введите тикер или название.` : '';
  else info.textContent = shown ? `Найдено: ${shown}. Нажмите на строку, чтобы открыть актив.` : 'Среди проанализированных ничего не найдено. Проверьте написание или нажмите «Проанализировать всё», чтобы обновить список.';
}
function onInput() {
  const q = $('scanQ').value.trim(), on = document.querySelector('#view .on');
  if (q && on && on.dataset.v !== 'all') { prevView = on.dataset.v; document.querySelector('#view [data-v="all"]').click(); }
  else if (!q && prevView) { const b = document.querySelector(`#view [data-v="${prevView}"]`); prevView = null; if (b) b.click(); }
  apply();
}
function mount() {
  const tbl = $('scanTbl');
  if (!tbl || $('scanFind')) return;
  box = document.createElement('div');
  box.id = 'scanFind'; box.hidden = true;
  box.innerHTML = '<input id="scanQ" type="search" placeholder="Найти актив: тикер или название" enterkeyhint="search" autocomplete="off" autocapitalize="characters"><p class="hint" id="scanQi"></p>';
  tbl.closest('.scroll').before(box);
  $('scanQ').addEventListener('input', onInput);
  $('scanQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = rows().find((x) => !x.hidden); if (r) r.click(); } });
  document.addEventListener('click', (e) => { if (e.target.closest('#mkt button')) { $('scanQ').value = ''; prevView = null; } });
  new MutationObserver(() => { const q = $('scanQ').value.trim(); if (q || !box.hidden || rows().length) apply(); }).observe(tbl, { childList: true });
  apply();
}
new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
mount();
