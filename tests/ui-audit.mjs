// Автопроверка верстки: node tests/ui-audit.mjs
// Нужно: npm i -D playwright && npx playwright install chromium
// Переменные: BASE (адрес сайта), FULL=1 (ещё запустить анализ и открыть актив), OUT (папка отчёта)
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'https://yuranagrebeckiy.github.io/investglass/';
const OUT = process.env.OUT || 'audit-out';
const FULL = process.env.FULL === '1';
fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  ['iphone', devices['iPhone 14']],
  ['small-android', { viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['Pixel 5'].userAgent }],
  ['ipad', devices['iPad (gen 7)']],
  ['desktop', { viewport: { width: 1280, height: 800 } }],
];

const inPage = () => {
  const W = innerWidth, out = { overflowX: document.documentElement.scrollWidth - W, wide: [], tiny: [], small: [], offscreen: [] };
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden]'); };
  const name = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : '')) + (e.textContent ? ' «' + e.textContent.trim().slice(0, 24) + '»' : '');
  const top = [...document.querySelectorAll('.sheet:not([hidden])')].pop();
  const all = [...(top ? top.querySelectorAll('*') : document.querySelectorAll('main *, header *'))];
  for (const e of all) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.right > W + 1 && !e.closest('.scroll,.dtt,nav,.seg')) out.wide.push(name(e));
    if (r.left < -1 && !e.closest('.scroll,.dtt,nav,.seg')) out.offscreen.push(name(e));
    if (e.matches('button,select,input:not([type=checkbox]):not([type=hidden]),summary,a.btn') && (r.height < 36 || r.width < 36)) out.tiny.push(name(e) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 11.5) out.small.push(name(e));
  }
  for (const k of ['wide', 'tiny', 'small', 'offscreen']) out[k] = [...new Set(out[k])].slice(0, 12);
  return out;
};

const browser = await chromium.launch();
const report = [];
for (const [vname, opts] of VIEWS) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => { localStorage.setItem('boot_off', '1'); localStorage.setItem('auth_skip', '1'); window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push('JS: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await pg.goto(BASE, { waitUntil: 'load' });
  await pg.waitForTimeout(3500);
  const rec = { view: vname, cls: 0, screens: [], errs };
  const snap = async (label) => {
    const r = await pg.evaluate(inPage);
    await pg.screenshot({ path: `${OUT}/${vname}-${label}.png` }).catch(() => {});
    rec.screens.push({ label, ...r });
  };
  const tabs = await pg.$$eval('#tabs button', (b) => b.map((x) => x.dataset.tab));
  for (const t of tabs) { await pg.click(`#tabs [data-tab="${t}"]`).catch(() => {}); await pg.waitForTimeout(700); await snap('tab-' + t); }
  const popups = [['#usr', 'profile'], ['#cfg', 'settings'], ['button[title*="ведомл"]', 'alerts'], ['#snd', 'sound']];
  for (const [sel, label] of popups) {
    const el = await pg.$(sel);
    if (!el) { rec.screens.push({ label, missing: true }); continue; }
    await el.click().catch(() => {}); await pg.waitForTimeout(700);
    if (await pg.$('.sheet:not([hidden])')) { await snap('popup-' + label); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); const still = await pg.$('.sheet:not([hidden])'); if (still) await pg.mouse.click(2, 2).catch(() => {}); }
  }
  if (FULL) {
    await pg.click('#tabs [data-tab="scan"]').catch(() => {});
    await pg.click('#scanBtn').catch(() => {});
    await pg.waitForFunction(() => /Готово/.test(document.getElementById('prog')?.textContent || ''), null, { timeout: 120000 }).catch(() => {});
    const row = await pg.$('#scanTbl tr[data-id]');
    if (row) { await row.click(); await pg.waitForTimeout(6000); await snap('asset-sheet'); await pg.keyboard.press('Escape'); }
  }
  rec.cls = +(await pg.evaluate(() => window.__cls)).toFixed(3);
  report.push(rec);
  await ctx.close();
}
await browser.close();

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
let bad = 0;
for (const r of report) {
  console.log(`\n== ${r.view}: сдвиги макета (CLS) ${r.cls}${r.cls > 0.1 ? '  <- много' : ''}`);
  r.errs.slice(0, 8).forEach((e) => console.log('  ошибка', e));
  for (const s of r.screens) {
    if (s.missing) { console.log(`  ${s.label}: кнопки нет`); continue; }
    const issues = [];
    if (s.overflowX > 1) issues.push(`горизонтальная прокрутка +${s.overflowX}px`);
    if (s.wide.length) issues.push('выходят вправо: ' + s.wide.join('; '));
    if (s.offscreen.length) issues.push('выходят влево: ' + s.offscreen.join('; '));
    if (s.tiny.length) issues.push('мелкие кнопки: ' + s.tiny.join('; '));
    if (s.small.length) issues.push('мелкий текст: ' + s.small.join('; '));
    if (issues.length) { bad++; console.log(`  ${s.label}:`); issues.forEach((i) => console.log('    - ' + i)); } else console.log(`  ${s.label}: ок`);
  }
}
console.log(`\nГотово. Проблемных экранов: ${bad}. Отчёт и скриншоты: ${OUT}/`);
