// Копия акций MOEX для устройств, где Мосбиржа закрыта: устройство с открытой Мосбиржей раз в 12 часов отправляет её в Google Таблицу.
import { stocks, candles } from './data/moex.js';
import { putStocks } from './data/cloudfx.js';

const $ = (id) => document.getElementById(id);
const LAST = 'stockshare_t', TRY = 'stockshare_try';
const prof = () => localStorage.getItem('ig_user') || '';
const tok = () => sessionStorage.getItem('cloud_tok') || localStorage.getItem('cloud_tok');
const logged = () => { try { const s = JSON.parse(sessionStorage.getItem('auth_session') || localStorage.getItem('auth_session')); return !!(s && s.name === prof() && tok()); } catch { return false; } };
const fmt = (t) => (t ? new Date(+t).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : 'ещё не отправлялась');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slim = (a, n) => a.slice(-n).map((c) => [c.t, c.o, c.h, c.l, c.c, c.v]);

export async function shareStocks(log = () => {}) {
  log('Проверяю, открывается ли Мосбиржа…');
  const list = (await stocks([1, 2], { live: true })).slice(0, 40);
  const cs = {};
  let done = 0, i = 0;
  const jobs = [];
  list.forEach((s, k) => { jobs.push([s.id, '1d']); if (k < 15) jobs.push([s.id, '1h']); });
  jobs.push(['IMOEX', '1d']);
  const worker = async () => {
    while (i < jobs.length) {
      const [id, tf] = jobs[i++];
      try { const c = await candles(id, tf, id === 'IMOEX' ? 'index' : 'shares/boards/TQBR', { live: true }); if (c.length > 10) (cs[id] ||= {})[tf] = slim(c, tf === '1d' ? 250 : 300); } catch { /* skip */ }
      log(`Загружено ${++done} из ${jobs.length}`);
      await sleep(120);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const ok = list.filter((s) => cs[s.id] && cs[s.id]['1d']);
  if (ok.length < 5) throw new Error('получено слишком мало данных, попробуйте позже');
  log('Отправляю в Google Таблицу…');
  const r = await putStocks({ n: prof(), t: tok(), d: { list: ok, candles: cs } });
  localStorage.setItem(LAST, String(Date.now()));
  return r;
}

async function auto() {
  if (!logged()) return;
  if (Date.now() - (+localStorage.getItem(LAST) || 0) < 12 * 3600e3) return;
  if (Date.now() - (+localStorage.getItem(TRY) || 0) < 30 * 60e3) return;
  localStorage.setItem(TRY, String(Date.now()));
  try { await shareStocks(); } catch { /* тихо: повторим через 30 минут */ }
}
setTimeout(auto, 30000);
setInterval(auto, 30 * 60e3);

function mount() {
  const w = $('cfgData');
  if (!w || $('shareBox')) return;
  const b = document.createElement('div');
  b.id = 'shareBox';
  b.innerHTML = `<h3>Копия акций для других устройств</h3><p class="hint">Если на этом устройстве открывается Мосбиржа, оно раз в 12 часов само отправляет акции в вашу Google Таблицу, и устройства без доступа к Мосбирже читают их оттуда. Нужен вход в аккаунт с облаком. Последняя отправка: <b id="shareLast">${fmt(localStorage.getItem(LAST))}</b>.</p><button class="btn sm" id="shareGo">Отправить копию сейчас</button><p class="hint" id="shareMsg"></p>`;
  w.appendChild(b);
  $('shareGo').onclick = async () => {
    const m = $('shareMsg');
    if (!logged()) { m.textContent = 'Сначала войдите в аккаунт с облаком (значок профиля).'; return; }
    $('shareGo').disabled = true;
    try { const r = await shareStocks((t) => { m.textContent = t; }); m.textContent = `Готово: отправлено ${r.tickers} акций, ${r.rows} свечей.`; $('shareLast').textContent = fmt(localStorage.getItem(LAST)); } catch (e) { m.textContent = 'Не получилось: ' + e.message; }
    $('shareGo').disabled = false;
  };
}
new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
mount();
