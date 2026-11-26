// InvestGlass: хранение данных пользователей в Google Таблице.
// Вставьте этот код в Расширения -> Apps Script (в самой таблице) и опубликуйте как веб-приложение.
var MAX_PART = 40000;

function doGet() { return ContentService.createTextOutput('InvestGlass sync работает'); }

function doPost(e) {
  var out;
  try { out = handle(JSON.parse(e.postData.contents)); } catch (err) { out = { ok: false, err: 'server: ' + err }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
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
