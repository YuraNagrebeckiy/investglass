// InvestGlass: хранение данных пользователей, курсов валют и копии акций в Google Таблице.
// Вставьте этот код в Расширения -> Apps Script (в самой таблице) и опубликуйте как веб-приложение.
// Подробная инструкция: sheets/README.md
var MAX_PART = 40000;
var FX_CODES = ['USD', 'EUR', 'CNY'];
var FX_SHEET = 'Курсы';
var ST_SHEET = 'Акции';
var ST_LIST = 'Акции список';
var ST_HEAD = ['Тикер', 'ТФ', 'Время unix', 'Дата и время', 'Откр', 'Макс', 'Мин', 'Закр', 'Объём'];
var STL_HEAD = ['Тикер', 'Название', 'Уровень', 'Цена', 'Оборот', 'Изм. за день %', 'Обновлено'];

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.a === 'pub') return json_(p.k === 'stocks' ? stocksRead_() : pubGet_());
  return ContentService.createTextOutput('InvestGlass sync работает');
}

function doPost(e) {
  var out;
  try {
    var q = JSON.parse(e.postData.contents);
    out = q.a === 'pubrefresh' ? refreshFx_(false) : q.a === 'stocksput' ? stocksPut_(q) : handle(q);
  } catch (err) { out = { ok: false, err: 'server: ' + err }; }
  return json_(out);
}

function sheet_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(head); s.getRange('A:Z').setNumberFormat('@'); }
  return s;
}

function plainSheet_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

// Проверка имени и ключа пользователя (как при сохранении данных). Пять неверных попыток блокируют имя на 10 минут.
function authUser_(q) {
  var n = String(q.n || '').trim().toLowerCase();
  if (n.length < 2 || n.length > 24 || !q.t) return false;
  var cache = CacheService.getScriptCache(), ck = 'fail:' + n, fails = Number(cache.get(ck)) || 0;
  if (fails >= 5) return false;
  var users = sheet_('Users', ['name', 'hash', 'created', 'version']).getDataRange().getValues(), th = hex_(String(q.t)), i;
  for (i = 1; i < users.length; i++) {
    if (String(users[i][0]) === n) {
      if (String(users[i][1]) === th) { cache.remove(ck); return true; }
      cache.put(ck, String(fails + 1), 600);
      return false;
    }
  }
  return false;
}

// ---------- Копия акций MOEX: её присылает устройство, у которого Мосбиржа открывается ----------
// Листы «Акции список» (тикер, название, цена) и «Акции» (свечи: дневные для всех, часовые для самых торгуемых).

function stocksRead_() {
  var L = plainSheet_(ST_LIST, STL_HEAD), S = plainSheet_(ST_SHEET, ST_HEAD);
  var lv = L.getDataRange().getValues(), sv = S.getDataRange().getValues(), list = [], candles = {}, upd = '', i;
  for (i = 1; i < lv.length; i++) {
    if (!lv[i][0]) continue;
    list.push({ id: String(lv[i][0]), name: String(lv[i][1]), board: 'TQBR', level: Number(lv[i][2]) || null, price: Number(lv[i][3]), vol: Number(lv[i][4]) || 0, chg24: Number(lv[i][5]) || 0 });
    if (String(lv[i][6]) > upd) upd = String(lv[i][6]);
  }
  for (i = 1; i < sv.length; i++) {
    var r = sv[i];
    if (!r[0]) continue;
    var k = r[0] + '|' + r[1];
    (candles[k] = candles[k] || []).push([Number(r[2]), Number(r[4]), Number(r[5]), Number(r[6]), Number(r[7]), Number(r[8])]);
  }
  return { ok: true, updated: upd, list: list, candles: candles };
}

function stocksPut_(q) {
  if (!authUser_(q)) return { ok: false, err: 'auth' };
  var d = q.d || {}, list = d.list, cs = d.candles;
  if (!list || !cs || list.length < 5 || list.length > 120) return { ok: false, err: 'bad' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var old = stocksRead_(), chk = 0, bad = 0;
    list.forEach(function (s) {
      var o = old.candles[s.id + '|1d'], nw = cs[s.id] && cs[s.id]['1d'];
      if (o && o.length && nw && nw.length) { chk++; var r = nw[nw.length - 1][4] / o[o.length - 1][4]; if (!(r > 0.6 && r < 1.6)) bad++; }
    });
    if (chk >= 5 && bad > chk / 3) return { ok: false, err: 'sanity' };
    var rows = [], now = new Date().toISOString();
    Object.keys(cs).forEach(function (id) {
      ['1d', '1h'].forEach(function (tf) {
        (cs[id][tf] || []).forEach(function (k) {
          rows.push([id, tf, k[0], new Date((k[0] + 10800) * 1000).toISOString().slice(0, 16).replace('T', ' '), k[1], k[2], k[3], k[4], k[5]]);
        });
      });
    });
    if (rows.length < 100) return { ok: false, err: 'bad' };
    var L = plainSheet_(ST_LIST, STL_HEAD), S = plainSheet_(ST_SHEET, ST_HEAD);
    var lrows = list.map(function (s) { return [s.id, s.name, s.level || '', s.price, s.vol, s.chg24, now]; });
    L.getRange(2, 1, Math.max(L.getMaxRows() - 1, 1), 7).clearContent();
    L.getRange(2, 1, lrows.length, 7).setValues(lrows);
    S.getRange(2, 1, Math.max(S.getMaxRows() - 1, 1), 9).clearContent();
    S.getRange(2, 1, rows.length, 9).setValues(rows);
    return { ok: true, updated: now, tickers: list.length, rows: rows.length };
  } finally { lock.releaseLock(); }
}

// ---------- Курсы валют: обычная таблица на листе «Курсы» в этой же Google Таблице ----------
// Строка = день. Для каждой валюты пять граф: откр, макс, мин, закр, объём. В строке 2 справа указаны источники и время обновления.
// Раз в сутки данные обновляет триггер dailyFx (см. installDaily). Если данные старше 20 часов, их обновит любой запрос приложения.
// Приложение читает этот лист, когда интернет-источники недоступны. Вручную править лист можно: цены берутся из граф «закр».

function fxHead_() {
  var h = ['Дата'];
  FX_CODES.forEach(function (c) { h.push(c + ' откр', c + ' макс', c + ' мин', c + ' закр', c + ' объём'); });
  FX_CODES.forEach(function (c) { h.push('Источник ' + c); });
  h.push('Обновлено');
  return h;
}

function fxSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), s = ss.getSheetByName(FX_SHEET);
  if (!s) {
    s = ss.insertSheet(FX_SHEET);
    var h = fxHead_();
    s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    s.setFrozenRows(1);
    s.getRange('A:A').setNumberFormat('@');
  }
  return s;
}

function num_(x) { var v = typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.')); return isFinite(v) ? v : null; }

function pubRead_() {
  var S = fxSheet_(), rows = S.getDataRange().getValues(), meta = rows[1] || [], upd = String(meta[19] || ''), data = {};
  FX_CODES.forEach(function (code, ci) {
    var base = 1 + ci * 5, out = [], i;
    for (i = 1; i < rows.length; i++) {
      var c = num_(rows[i][base + 3]);
      if (c === null || rows[i][base + 3] === '') continue;
      var d = rows[i][0];
      if (d instanceof Date) d = Utilities.formatDate(d, 'Europe/Moscow', 'yyyy-MM-dd');
      var t = Math.floor(Date.parse(String(d) + 'T00:00:00+03:00') / 1000);
      if (!t) continue;
      var o = num_(rows[i][base]), h = num_(rows[i][base + 1]), l = num_(rows[i][base + 2]), v = num_(rows[i][base + 4]);
      out.push([t, o === null ? c : o, h === null ? c : h, l === null ? c : l, c, v === null ? 0 : v]);
    }
    out.sort(function (a, b) { return a[0] - b[0]; });
    if (out.length) data[code] = { source: String(meta[16 + ci] || ''), updated: upd, candles: out };
  });
  return { ok: true, updated: upd, data: data };
}

function pubGet_() {
  var cache = CacheService.getScriptCache(), c = cache.get('pubfx');
  if (c) return JSON.parse(c);
  var out = pubRead_();
  try { cache.put('pubfx', JSON.stringify(out), 300); } catch (e) { /* слишком большой для кэша */ }
  return out;
}

function pubWrite_(res) {
  var S = fxSheet_(), cur = pubRead_().data, byDate = {}, src = {}, W = fxHead_().length;
  FX_CODES.forEach(function (code, ci) {
    var use = res[code] || cur[code];
    if (!use) return;
    src[ci] = use.source;
    use.candles.forEach(function (k) {
      var d = new Date((k[0] + 10800) * 1000).toISOString().slice(0, 10);
      (byDate[d] = byDate[d] || {})[ci] = k;
    });
  });
  var dates = Object.keys(byDate).sort(), n = dates.length, now = new Date().toISOString();
  var vals = dates.map(function (d, r) {
    var row = [d];
    FX_CODES.forEach(function (code, ci) { var k = byDate[d][ci]; if (k) row.push(k[1], k[2], k[3], k[4], k[5]); else row.push('', '', '', '', ''); });
    FX_CODES.forEach(function (code, ci) { row.push(r === 0 ? (src[ci] || '') : ''); });
    row.push(r === 0 ? now : '');
    return row;
  });
  S.getRange(2, 1, Math.max(S.getMaxRows() - 1, 1), W).clearContent();
  if (n) {
    S.getRange(2, 1, n, 1).setNumberFormat('@');
    S.getRange(2, 2, n, 15).setNumberFormat('0.0000');
    [6, 11, 16].forEach(function (col) { S.getRange(2, col, n, 1).setNumberFormat('0'); });
    S.getRange(2, 1, n, W).setValues(vals);
  }
}

var CBR_ID = { USD: 'R01235', EUR: 'R01239', CNY: 'R01375' };
function cbrFx_(code) {
  try {
    var to = new Date(), from = new Date(to.getTime() - 430 * 864e5);
    var f = function (d) { return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); };
    var resp = UrlFetchApp.fetch('https://www.cbr.ru/scripts/XML_dynamic.asp?date_req1=' + f(from) + '&date_req2=' + f(to) + '&VAL_NM_RQ=' + CBR_ID[code], { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    var xml = resp.getContentText(), re = /<Record Date="(\d+)\.(\d+)\.(\d+)"[^>]*>\s*<Nominal>(\d+)<\/Nominal>\s*<Value>([\d,\.]+)<\/Value>/g, m, out = [];
    while ((m = re.exec(xml))) {
      var v = parseFloat(m[5].replace(',', '.')) / Number(m[4]), t = Math.floor(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 9) / 1000);
      out.push([t, v, v, v, v, 0]);
    }
    out.sort(function (a, b) { return a[0] - b[0]; });
    if (out.length < 60) return null;
    return { source: 'официальный курс ЦБ РФ, только закрытие', candles: out.slice(-300) };
  } catch (e) { return null; }
}

var MOEX_FX = {
  USD: [['USDRUBF', 'futures/markets/forts'], ['USDRUB_TOM', 'currency/markets/selt/boards/CETS']],
  EUR: [['EURRUBF', 'futures/markets/forts'], ['EURRUB_TOM', 'currency/markets/selt/boards/CETS']],
  CNY: [['CNYRUBF', 'futures/markets/forts'], ['CNYRUB_TOM', 'currency/markets/selt/boards/CETS']]
};
function moexFx_(code) {
  var from = new Date(Date.now() - 430 * 864e5).toISOString().slice(0, 10), j;
  for (j = 0; j < MOEX_FX[code].length; j++) {
    try {
      var id = MOEX_FX[code][j][0], base = MOEX_FX[code][j][1];
      var resp = UrlFetchApp.fetch('https://iss.moex.com/iss/engines/' + base + '/securities/' + id + '/candles.json?iss.meta=off&interval=24&from=' + from, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) continue;
      var js = JSON.parse(resp.getContentText()), col = js.candles.columns, ix = function (n) { return col.indexOf(n); };
      var out = js.candles.data.map(function (d) { return [Math.floor(Date.parse(String(d[ix('begin')]).replace(' ', 'T') + '+03:00') / 1000), d[ix('open')], d[ix('high')], d[ix('low')], d[ix('close')], d[ix('volume')]]; });
      if (out.length > 60) return { source: id, candles: out.slice(-300) };
    } catch (e) { /* следующий инструмент */ }
  }
  return null;
}

// trigger=true: сначала Мосбиржа, затем ЦБ. trigger=false (запрос приложения): только ЦБ и только если данным больше 20 часов.
function refreshFx_(trigger) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cur = pubRead_(), age = cur.updated ? Date.now() - Date.parse(cur.updated) : 1e12;
    if (!trigger && age < 20 * 3600e3) return { ok: true, skipped: true, updated: cur.updated };
    var res = {}, any = false;
    FX_CODES.forEach(function (code) {
      var r = trigger ? moexFx_(code) : null;
      if (!r) r = cbrFx_(code);
      if (r) { res[code] = r; any = true; }
    });
    if (!any) return { ok: false, err: 'нет данных ни от Мосбиржи, ни от ЦБ' };
    pubWrite_(res);
    CacheService.getScriptCache().remove('pubfx');
    return { ok: true, updated: new Date().toISOString(), codes: Object.keys(res) };
  } finally { lock.releaseLock(); }
}

// Запускается по расписанию раз в сутки.
function dailyFx() { return refreshFx_(true); }

// Запустите один раз вручную: создаёт ежедневный триггер и сразу обновляет курсы.
function installDaily() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyFx') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyFx').timeBased().everyDays(1).atHour(7).create();
  return dailyFx();
}

// ---------- Данные пользователей ----------
function handle(q) {
  var n = String(q.n || '').trim().toLowerCase();
  if (n.length < 2 || n.length > 24 || !q.t) return { ok: false, err: 'bad' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var cache = CacheService.getScriptCache(), ck = 'fail:' + n, fails = Number(cache.get(ck)) || 0;
    if (fails >= 5) return { ok: false, err: 'locked' };
    var U = sheet_('Users', ['name', 'hash', 'created', 'version']);
    var D = sheet_('Data', ['name', 'key', 'part', 'value']);
    var users = U.getDataRange().getValues(), row = -1, i;
    for (i = 1; i < users.length; i++) if (String(users[i][0]) === n) { row = i + 1; break; }
    var th = hex_(String(q.t));
    if (row < 0) {
      if (q.a !== 'reg') return { ok: false, err: 'nouser' };
      U.appendRow([n, th, new Date().toISOString(), '']);
      return { ok: true, created: true, ver: '' };
    }
    if (String(users[row - 1][1]) !== th) { cache.put(ck, String(fails + 1), 600); return { ok: false, err: 'auth' }; }
    cache.remove(ck);
    var ver = String(users[row - 1][3] || '');
    if (q.a === 'reg') return { ok: true, created: false, ver: ver };
    var all = D.getDataRange().getValues();
    if (q.a === 'load') {
      var parts = {}, data = {};
      for (i = 1; i < all.length; i++) if (String(all[i][0]) === n) { var k = String(all[i][1]); (parts[k] = parts[k] || []).push([Number(all[i][2]), String(all[i][3])]); }
      Object.keys(parts).forEach(function (k) { data[k] = parts[k].sort(function (a, b) { return a[0] - b[0]; }).map(function (p) { return p[1]; }).join(''); });
      return { ok: true, ver: ver, data: data };
    }
    if (q.a === 'save') {
      var keep = [], d = q.d || {};
      for (i = 1; i < all.length; i++) if (String(all[i][0]) !== n) keep.push([String(all[i][0]), String(all[i][1]), String(all[i][2]), String(all[i][3])]);
      Object.keys(d).forEach(function (k) {
        var v = String(d[k]), p = 0;
        do { keep.push([n, k, String(p), v.substr(p * MAX_PART, MAX_PART)]); p++; } while (p * MAX_PART < v.length);
      });
      D.clearContents();
      D.getRange(1, 1, 1, 4).setValues([['name', 'key', 'part', 'value']]);
      if (keep.length) { var r = D.getRange(2, 1, keep.length, 4); r.setNumberFormat('@'); r.setValues(keep); }
      ver = new Date().toISOString();
      U.getRange(row, 4).setValue(ver);
      return { ok: true, ver: ver };
    }
    if (q.a === 'del') {
      var rest = [];
      for (i = 1; i < all.length; i++) if (String(all[i][0]) !== n) rest.push([String(all[i][0]), String(all[i][1]), String(all[i][2]), String(all[i][3])]);
      D.clearContents();
      D.getRange(1, 1, 1, 4).setValues([['name', 'key', 'part', 'value']]);
      if (rest.length) { var r2 = D.getRange(2, 1, rest.length, 4); r2.setNumberFormat('@'); r2.setValues(rest); }
      U.deleteRow(row);
      return { ok: true };
    }
    return { ok: false, err: 'bad' };
  } finally { lock.releaseLock(); }
}
