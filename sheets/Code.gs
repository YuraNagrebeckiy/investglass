// InvestGlass: хранение данных пользователей и общих курсов валют в Google Таблице.
// Вставьте этот код в Расширения -> Apps Script (в самой таблице) и опубликуйте как веб-приложение.
// Подробная инструкция: sheets/README.md
var MAX_PART = 40000;
var FX_CODES = ['USD', 'EUR', 'CNY'];

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.a === 'pub') return json_(pubGet_());
  return ContentService.createTextOutput('InvestGlass sync работает');
}

function doPost(e) {
  var out;
  try {
    var q = JSON.parse(e.postData.contents);
    out = q.a === 'pubrefresh' ? refreshFx_(false) : handle(q);
  } catch (err) { out = { ok: false, err: 'server: ' + err }; }
  return json_(out);
}

function sheet_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(head); s.getRange('A:Z').setNumberFormat('@'); }
  return s;
}

function hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

// ---------- Общие курсы валют (лист Public) ----------
// Раз в сутки данные обновляет триггер dailyFx (см. installDaily). Если данные старше 20 часов,
// их обновит любой запрос приложения pubrefresh. Приложение читает лист, когда интернет-источники недоступны.

function pubRead_() {
  var S = sheet_('Public', ['key', 'updated', 'part', 'value']), rows = S.getDataRange().getValues(), parts = {}, upd = '', i;
  for (i = 1; i < rows.length; i++) {
    var k = String(rows[i][0]);
    if (k.indexOf('fx:') !== 0) continue;
    (parts[k] = parts[k] || []).push([Number(rows[i][2]), String(rows[i][3])]);
    if (String(rows[i][1]) > upd) upd = String(rows[i][1]);
  }
  var data = {};
  Object.keys(parts).forEach(function (k) {
    try { data[k.slice(3)] = JSON.parse(parts[k].sort(function (a, b) { return a[0] - b[0]; }).map(function (p) { return p[1]; }).join('')); } catch (e) { /* битая запись */ }
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
  var S = sheet_('Public', ['key', 'updated', 'part', 'value']), all = S.getDataRange().getValues(), keep = [], i, now = new Date().toISOString();
  for (i = 1; i < all.length; i++) {
    var k = String(all[i][0]);
    if (k.indexOf('fx:') === 0 && res[k.slice(3)]) continue;
    keep.push([k, String(all[i][1]), String(all[i][2]), String(all[i][3])]);
  }
  Object.keys(res).forEach(function (code) {
    var v = JSON.stringify({ source: res[code].source, updated: now, candles: res[code].candles }), p = 0;
    do { keep.push(['fx:' + code, now, String(p), v.substr(p * MAX_PART, MAX_PART)]); p++; } while (p * MAX_PART < v.length);
  });
  S.clearContents();
  S.getRange(1, 1, 1, 4).setValues([['key', 'updated', 'part', 'value']]);
  var r = S.getRange(2, 1, keep.length, 4); r.setNumberFormat('@'); r.setValues(keep);
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
