/* =================================================================
   app.js — メインアプリケーションロジック v1.3.0
   ================================================================= */

currentPatientId = null;
var currentView = 'all';
var editingId = null;
var _confirmResolve = null;

function tx(s, m) { return db.transaction(s, m).objectStore(s); }
function prom(r) {
  return new Promise(function(res, rej) {
    r.onsuccess = function() { res(r.result); };
    r.onerror = function() { rej(r.error); };
  });
}
function $(id) { return document.getElementById(id); }
function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Toast
var toastTimer = null;
function toast(msg) {
  var t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2500);
}

// Modal
function showModal(id) { var el = $('modal-' + id); if (el) el.style.display = 'flex'; }
function hideModal(id) { var el = $('modal-' + id); if (el) el.style.display = 'none'; }
function showScreen(id) {
  var a = $('screen-id'), b = $('screen-patient');
  if (a) a.style.display = id === 'id' ? '' : 'none';
  if (b) b.style.display = id === 'patient' ? '' : 'none';
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════

async function init() {
   // Open DB
   try { db = await openDBSync(); } catch (e) { alert('DB open failed: ' + e.message); return; }

   // Event: ID input
   var inpId = $('inp-patient-id');
   if (inpId) inpId.addEventListener('keydown', function(e) {
     if (e.key === 'Enter') { e.preventDefault(); handleIdEnter(); }
   });
   var btnStart = $('btn-id-enter');
   if (btnStart) btnStart.addEventListener('click', handleIdEnter);

   // Event: View tabs
   var vAll = $('view-all'), vPaste = $('view-paste');
   if (vAll) vAll.addEventListener('click', function() { currentView = 'all'; if (currentPatientId) renderView(); });
   if (vPaste) vPaste.addEventListener('click', function() { currentView = 'paste'; if (currentPatientId) renderView(); });

   // Event: Back to top
   var bb = $('btn-back');
   if (bb) bb.addEventListener('click', goBack);

   // Event: Patient select
   var sel = $('sel-patient');
   if (sel) sel.addEventListener('change', function() {
     currentPatientId = sel.value;
     if (currentPatientId) renderPatientPage();
   });

   // Event: Registration
   var btnReg = $('btn-register');
   if (btnReg) btnReg.addEventListener('click', registerReading);

   var inpDbp = $('inp-dbp');
   if (inpDbp) inpDbp.addEventListener('keydown', function(e) {
     if (e.key === 'Enter') { e.preventDefault(); registerReading(); }
   });
   var inpMemo = $('inp-memo');
   if (inpMemo) inpMemo.addEventListener('keydown', function(e) {
     if (e.key === 'Enter') { e.preventDefault(); registerReading(); }
   });
   var inpDate = $('inp-date');
   if (inpDate) inpDate.addEventListener('keydown', function(e) {
     if (e.key === 'Enter') { e.preventDefault(); var s = $('inp-sbp'); if (s) s.focus(); }
   });
   var inpSbp = $('inp-sbp');
   if (inpSbp) inpSbp.addEventListener('keydown', function(e) {
     if (e.key === 'Enter') { e.preventDefault(); var d = $('inp-dbp'); if (d) d.focus(); }
   });

   // Event: 受診時血圧表示トグル
   var chkVisit = $('chk-show-visit');
   if (chkVisit) chkVisit.addEventListener('change', function() {
     if (currentPatientId && currentView === 'all') renderView();
   });

   // Event: Resize
   window.addEventListener('resize', function() {
     if (currentPatientId && currentView === 'all') renderView();
   });

   // Event: Paste view
   var btnParse = $('btn-parse-visit');
   if (btnParse) btnParse.addEventListener('click', handleParseVisit);
   var btnSaveVisit = $('btn-save-visit');
   if (btnSaveVisit) btnSaveVisit.addEventListener('click', handleSaveVisit);

   // Event: Global Enter in memo field
   document.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.target && e.target.id === 'inp-memo') {
        e.preventDefault();
        registerReading();
      }
});

  // Event: Data management buttons
  var btnExp = $('btn-export-csv'), btnImp = $('btn-import-csv');
  var btnBak = $('btn-backup'), btnRes = $('btn-restore'), btnDel = $('btn-delete-patient');
  if (btnExp) btnExp.addEventListener('click', exportCSV);
  if (btnImp) btnImp.addEventListener('click', handleImportCSV);
  if (btnBak) btnBak.addEventListener('click', handleBackup);
  if (btnRes) btnRes.addEventListener('click', handleRestore);
  if (btnDel) btnDel.addEventListener('click', handleDeletePatient);

  // Event: Modals
  var mOk = $('modal-ok'), mCancel = $('modal-cancel');
  if (mOk) mOk.addEventListener('click', handleNewPatient);
  if (mCancel) mCancel.addEventListener('click', function() { hideModal('new-patient'); });

  var cYes = $('confirm-yes'), cNo = $('confirm-no');
  if (cYes) cYes.addEventListener('click', function() { handleConfirm(true); });
  if (cNo) cNo.addEventListener('click', function() { handleConfirm(false); });

  // Init screen: check if patients exist and auto-navigate
  try {
    var patients = await getAllPatients();
    if (patients && patients.length > 0) {
      var first = patients[0];
      currentPatientId = first.id;
      await renderPatientPage();
    } else {
      initIdScreen();
    }
  } catch (e) {
    console.error('init patient check error:', e);
    initIdScreen();
  }

  $('header-info').textContent = 'v1.3.0 | ' + new Date().toLocaleDateString('ja-JP');
  $('app-version').textContent = '1.3.0';
  $('app-build-date').textContent = new Date().toLocaleDateString('ja-JP');
  $('app-version-footer').textContent = '1.3.0';
}

// Synchronous DB open wrapper (runs inside async init)
function openDBSync() {
   var opened = null, error = null;
   var req = indexedDB.open('BloodPressureDB', 2);
req.onupgradeneeded = function(e) {
      var d = e.target.result;
      if (!d.objectStoreNames.contains('patients')) {
        var ps = d.createObjectStore('patients', { keyPath: 'id' });
        ps.createIndex('name', 'name');
      }
      if (!d.objectStoreNames.contains('readings')) {
        var rs = d.createObjectStore('readings', { keyPath: 'id', autoIncrement: true });
        rs.createIndex('byPatient', 'patientId');
        rs.createIndex('byPatientDate', ['patientId', 'date'], { unique: true });
        rs.createIndex('byDate', 'date');
      }
      if (!d.objectStoreNames.contains('monthly_summaries')) {
        var ms = d.createObjectStore('monthly_summaries', { keyPath: ['patientId', 'year', 'month'] });
        ms.createIndex('byPatient', 'patientId');
      }
    };
    req.onsuccess = function(e) { opened = e.target.result; };
    req.onerror = function(e) { error = e.target.error; };
   return new Promise(function(resolve, reject) {
     var r = indexedDB.open('BloodPressureDB', 2);
r.onupgradeneeded = function(e) {
      var d = e.target.result;
      if (!d.objectStoreNames.contains('patients')) {
        var ps = d.createObjectStore('patients', { keyPath: 'id' });
        ps.createIndex('name', 'name');
      }
      if (!d.objectStoreNames.contains('readings')) {
        var rs = d.createObjectStore('readings', { keyPath: 'id', autoIncrement: true });
        rs.createIndex('byPatient', 'patientId');
        rs.createIndex('byPatientDate', ['patientId', 'date'], { unique: true });
        rs.createIndex('byDate', 'date');
      }
      if (!d.objectStoreNames.contains('monthly_summaries')) {
        var ms = d.createObjectStore('monthly_summaries', { keyPath: ['patientId', 'year', 'month'] });
        ms.createIndex('byPatient', 'patientId');
      }
    };
     r.onsuccess = function(e) { resolve(e.target.result); };
     r.onerror = function(e) { reject(e.target.error); };
   });
 }

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ═══════════════════════════════════════════════════════════
//  DB FUNCTIONS (from db.js)
// ═══════════════════════════════════════════════════════════

async function getPatient(id) { return prom(tx('patients', 'readonly').get(id)); }
async function getAllPatients() { return prom(tx('patients', 'readonly').getAll()); }
async function putPatient(p) {
  p.updatedAt = new Date().toISOString();
  if (!p.createdAt) p.createdAt = p.updatedAt;
  return prom(tx('patients', 'readwrite').put(p));
}
async function deletePatient(id) {
  await prom(tx('patients', 'readwrite').delete(id));
  var rs = await getReadingsByPatient(id);
  for (var i = 0; i < rs.length; i++) await deleteReading(rs[i].id);
}
async function getReadingsByPatient(pid) { return prom(tx('readings', 'readonly').index('byPatient').getAll(pid)); }
async function getReadingsByPatientInMonth(pid, y, m) {
   var pad = function(n) { return String(n).padStart(2, '0'); };
   var start = [pid, y + '-' + pad(m) + '-01'];
   var end = [pid, y + '-' + pad(m) + '-32'];
   return prom(tx('readings', 'readonly').index('byPatientDate').getAll(IDBKeyRange.bound(start, end, false, false)));
}
async function getReadingByDate(pid, date) { return prom(tx('readings', 'readonly').index('byPatientDate').get([pid, date])); }
async function putReading(r) {
  r.updatedAt = new Date().toISOString();
  if (!r.createdAt) r.createdAt = r.updatedAt;
  return prom(tx('readings', 'readwrite').put(r));
}
async function deleteReading(id) { return prom(tx('readings', 'readwrite').delete(id)); }
async function getAllReadings() { return prom(tx('readings', 'readonly').getAll()); }

// ═══════════════════════════════════════════════════════════
//  ID INPUT
// ═══════════════════════════════════════════════════════════

async function initIdScreen() {
  try {
    var readings = await getAllReadings();
    if (readings.length > 0) {
      readings.sort(function(a, b) { return b.date.localeCompare(a.date); });
      var last = readings[0];
      var pat = await getPatient(last.patientId);
      var hi = $('header-info');
      if (hi) hi.textContent = '最終: ' + (pat ? pat.name : last.patientId) + ' / ' + last.date;
    }
  } catch (e) { console.error(e); }
  await renderRecentPatients();
}

async function renderRecentPatients() {
  var patients = await getAllPatients();
  var entries = [];
  for (var i = 0; i < patients.length; i++) {
    var p = patients[i];
    var readings = await getReadingsByPatient(p.id);
    var latest = readings.reduce(function(a, b) { return a.date > b.date ? a : b; }, null);
    entries.push({ patient: p, latest: latest ? latest.date : '' });
  }
  entries.sort(function(a, b) { return (b.latest || '').localeCompare(a.latest || ''); });

  var div = $('recent-patients');
  if (!div) return;
if (entries.length === 0) {
     div.innerHTML = '<span style="color:#bdc3c7">まだ患者が登録されていません</span>';
     return;
   }
   div.innerHTML = entries.map(function(e) {
     return '<div style="padding:5px 0;cursor:pointer;border-bottom:1px solid #f0f0f0" data-pid="' + e.patient.id + '">' +
       '<strong>' + esc(e.patient.id) + '</strong> ' + esc(e.patient.name) +
       '<span style="color:#95a5a6;margin-left:8px;font-size:.82em">' + (e.latest || 'データなし') + '</span></div>';
   }).join('');

   div.querySelectorAll('[data-pid]').forEach(function(el) {
     el.addEventListener('click', function() { navigateToPatient(el.dataset.pid); });
   });
}

async function handleIdEnter() {
  var inp = $('inp-patient-id');
  if (!inp) return;
  var id = inp.value.trim();
  if (!id) { toast('患者IDを入力してください'); return; }
  await navigateToPatient(id);
}

async function navigateToPatient(id) {
  try {
    var patient = await getPatient(id);
    if (!patient) {
      currentPatientId = id;
      var el;
      el = $('modal-pid'); if (el) el.textContent = id;
      el = $('modal-name'); if (el) el.value = '';
      el = $('modal-gender'); if (el) el.value = '';
      el = $('modal-birth'); if (el) el.value = '';
      el = $('modal-memo'); if (el) el.value = '';
      showModal('new-patient');
      setTimeout(function() { el = $('modal-name'); if (el) el.focus(); }, 100);
      return;
    }
    currentPatientId = id;
    currentView = 'all';
    showScreen('patient');
    await renderPatientPage();
  } catch (e) {
    console.error('navigateToPatient error:', e);
    toast('エラー: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  NEW PATIENT MODAL
// ═══════════════════════════════════════════════════════════

async function handleNewPatient() {
  var el = $('modal-name');
  var name = el ? el.value.trim() : '';
  if (!name) { toast('氏名を入力してください'); return; }
  var g = $('modal-gender'), b = $('modal-birth'), m = $('modal-memo');
  await putPatient({
    id: currentPatientId, name: name,
    gender: g ? g.value : '',
    birthDate: b ? b.value : '',
    memo: m ? m.value.trim() : '',
    createdAt: new Date().toISOString()
  });
  hideModal('new-patient');
  await renderPatientPage();
  toast('患者 ' + name + ' を登録しました');
}

// ═══════════════════════════════════════════════════════════
//  CONFIRM MODAL
// ═══════════════════════════════════════════════════════════

function confirmAsync(title, body) {
  return new Promise(function(resolve) {
    _confirmResolve = resolve;
    var el;
    el = $('confirm-title'); if (el) el.textContent = title;
    el = $('confirm-body'); if (el) el.textContent = body;
    showModal('confirm');
  });
}

function handleConfirm(yes) {
  if (_confirmResolve) { _confirmResolve(yes); _confirmResolve = null; }
  hideModal('confirm');
}

// ═══════════════════════════════════════════════════════════
//  PATIENT PAGE
// ═══════════════════════════════════════════════════════════

async function renderPatientPage() {
   showScreen('patient');
   try {
     var patient = await getPatient(currentPatientId);
     var name = patient ? patient.name : currentPatientId;
     var el = $('patient-header-info'); if (el) el.textContent = currentPatientId + ' ' + name;
     renderNav();
     renderView();
     // 日付フォームが空の場合、本日の日付をデフォルト設定
     var inpDate = $('inp-date');
     if (inpDate && !inpDate.value) {
       inpDate.value = fmtDate(new Date());
     }
   } catch (e) {
     console.error('renderPatientPage error:', e);
     toast('ページ表示エラー');
   }
 }

function renderView() {
  if (currentView === 'paste') { showPasteView(); renderPasteView(); }
  else { hidePasteView(); renderAllPeriodView(); }
}

function showPasteView() {
  showEl('graph-container', false);
  showEl('legend', false);
  showEl('section-bp-input', false);
  showEl('section-daily-list', false);
  showEl('data-bar', false);
  showEl('section-paste', true);
}

function hidePasteView() {
  showEl('graph-container', true);
  showEl('legend', true);
  showEl('section-bp-input', true);
  showEl('section-daily-list', true);
  showEl('data-bar', true);
  showEl('section-paste', false);
}

function showEl(id, show) {
  var el = $(id);
  if (el) el.style.display = show ? '' : 'none';
}

function setViewTabs() {
  var a = $('view-all'), p = $('view-paste');
  if (a) a.classList.toggle('active', currentView === 'all');
  if (p) p.classList.toggle('active', currentView === 'paste');
}

// ─── ALL PERIOD VIEW ───

async function renderAllPeriodView() {
   setViewTabs();

   try {
     var readings = await getReadingsByPatient(currentPatientId);
     readings.sort(function(a, b) { return a.date.localeCompare(b.date); });
     var canvas = $('graph');
     if (canvas) { drawAllPeriodGraph(canvas, readings); setupTooltip(canvas); }
   } catch (e) { console.error('renderAllPeriodView:', e); }

   // 凡例（チェックボックス状態に応じて受診時血圧を表示/非表示）
   var legendEl = $('legend');
   if (legendEl) {
     var showVisit = !$('chk-show-visit') || $('chk-show-visit').checked;
     var items = [
       { show: showVisit, color: '#c0392b', label: '受診SBP' },
       { show: true,      color: '#e67e22', label: '家庭SBP平均' },
       { show: true,      color: '#f39c12', label: '家庭SBP最小' },
       { show: true,      color: '#e74c3c', label: '家庭SBP最大' },
       { show: showVisit, color: '#2980b9', label: '受診DBP' },
       { show: true,      color: '#27ae60', label: '家庭DBP平均' },
       { show: true,      color: '#1abc9c', label: '家庭DBP最小' },
       { show: true,      color: '#8e44ad', label: '家庭DBP最大' },
     ];
     legendEl.innerHTML = items.filter(function(i) { return i.show; }).map(function(i) {
       return '<div class="legend-item"><div class="legend-color" style="background:' + i.color + '"></div>' + i.label + '</div>';
     }).join('');
   }

   var readings2 = await getReadingsByPatient(currentPatientId);
   renderDailyListFromData(readings2);
   updateDataStat();
 }



function renderDailyListFromData(readings) {
  var body = $('daily-body');
  if (!body) return;
  if (!readings || readings.length === 0) {
    body.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#95a5a6;padding:20px">データがありません</td></tr>';
    return;
  }
  readings.sort(function(a, b) { return b.date.localeCompare(a.date); });
  var html = '';
  for (var i = 0; i < readings.length; i++) {
    var r = readings[i];
    function n(v) { return v > 0 ? v : '-'; }
    html += '<tr>' +
      '<td>' + r.date + '</td>' +
      '<td class="bp-val">' + n(r.systolic) + '</td>' +
      '<td class="bp-val">' + n(r.diastolic) + '</td>' +
      '<td class="bp-val">' + n(r.avgSbp) + '</td>' +
      '<td class="bp-val">' + n(r.avgDbp) + '</td>' +
      '<td class="bp-val">' + n(r.minSbp) + '</td>' +
      '<td class="bp-val">' + n(r.minDbp) + '</td>' +
      '<td class="bp-val">' + n(r.maxSbp) + '</td>' +
      '<td class="bp-val">' + n(r.maxDbp) + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' +
      '<button class="btn btn-sm btn-secondary" data-edit="' + r.id + '">編集</button> ' +
      '<button class="btn btn-sm btn-danger" data-del="' + r.id + '">削除</button>' +
      '</td></tr>';
  }
  body.innerHTML = html;

  body.querySelectorAll('[data-edit]').forEach(function(btn) {
    btn.addEventListener('click', function() { editReading(Number(this.dataset.edit)); });
  });
  body.querySelectorAll('[data-del]').forEach(function(btn) {
    btn.addEventListener('click', function() { deleteReadingConfirm(Number(this.dataset.del)); });
  });
}



// ── Nav ──
async function renderNav() {
  var sel = $('sel-patient'); if (!sel) return;
  sel.innerHTML = '';
  var patients = await getAllPatients();
  var html = '';
  for (var i = 0; i < patients.length; i++) {
    var p = patients[i];
    html += '<option value="' + esc(p.id) + '"' + (p.id === currentPatientId ? ' selected' : '') + '>' +
      esc(p.id) + ' ' + esc(p.name || '') + '</option>';
  }
  sel.innerHTML = html;
}

function goBack() {
   showScreen('id');
   $('inp-patient-id').value = '';
   renderRecentPatients();
   $('inp-patient-id').focus();
}

// ═══════════════════════════════════════════════════════════
//  REGISTRATION
// ═══════════════════════════════════════════════════════════

async function registerReading() {
   var d = $('inp-date'), sb = $('inp-sbp'), db = $('inp-dbp');
   var as = $('inp-avg-sbp'), ad = $('inp-avg-dbp');
   var ns = $('inp-min-sbp'), nd = $('inp-min-dbp');
   var xs = $('inp-max-sbp'), xd = $('inp-max-dbp');
   var m = $('inp-memo');
   if (!d || !sb || !db) return;
   var date = d.value, sbp = Number(sb.value), dbp = Number(db.value);
   var memo = m ? m.value.trim() : '';
   if (!date) { toast('日付は必須です'); return; }
   if (sbp > 0 && (sbp < 50 || sbp > 300)) { toast('収縮期血圧の範囲が不正です'); return; }
   if (dbp > 0 && (dbp < 30 || dbp > 200)) { toast('拡張期血圧の範囲が不正です'); return; }

   var reading = {
     patientId: currentPatientId, date: date,
     systolic: sbp || 0, diastolic: dbp || 0,
     meanArterial: sbp && dbp ? Math.round((sbp + dbp * 2) / 3) : 0,
     note: memo,
     avgSbp: Number(as ? as.value : 0) || 0,
     avgDbp: Number(ad ? ad.value : 0) || 0,
     minSbp: Number(ns ? ns.value : 0) || 0,
     minDbp: Number(nd ? nd.value : 0) || 0,
     maxSbp: Number(xs ? xs.value : 0) || 0,
     maxDbp: Number(xd ? xd.value : 0) || 0
   };

   try {
     var existing = await getReadingByDate(currentPatientId, date);
     if (existing && existing.id !== editingId) {
       var ok = await confirmAsync('上書き確認', date + ' のデータは既に存在します。上書きしますか？');
       if (!ok) return;
       reading.id = existing.id;
       reading.createdAt = existing.createdAt;
     } else if (existing) {
       reading.id = existing.id;
       reading.createdAt = existing.createdAt;
     }
     await putReading(reading);
     toast(date + ' のデータを保存しました');

     var ndate = new Date(date + 'T00:00:00');
     ndate.setDate(ndate.getDate() + 1);
     if (d) d.value = fmtDate(ndate);
     if (sb) sb.value = '';
     if (db) db.value = '';
     if (as) as.value = ''; if (ad) ad.value = '';
     if (ns) ns.value = ''; if (nd) nd.value = '';
     if (xs) xs.value = ''; if (xd) xd.value = '';
     if (m) m.value = '';
     editingId = null;
     var rs = $('register-status'); if (rs) rs.textContent = '';
     if (sb) sb.focus();
     renderView();
   } catch (e) {
     console.error('registerReading error:', e);
     toast('登録エラー: ' + e.message);
   }
 }

// ═══════════════════════════════════════════════════════════
//  EDIT / DELETE
// ═══════════════════════════════════════════════════════════

async function editReading(id) {
  try {
    var readings = await getReadingsByPatient(currentPatientId);
    var r = readings.find(function(x) { return x.id === id; });
    if (!r) return;
    editingId = id;
    var d = $('inp-date'), sb = $('inp-sbp'), db = $('inp-dbp'), m = $('inp-memo');
    var as = $('inp-avg-sbp'), ad = $('inp-avg-dbp');
    var ns = $('inp-min-sbp'), nd = $('inp-min-dbp');
    var xs = $('inp-max-sbp'), xd = $('inp-max-dbp');
    if (d) d.value = r.date;
    if (sb) sb.value = r.systolic || '';
    if (db) db.value = r.diastolic || '';
    if (as) as.value = r.avgSbp || '';
    if (ad) ad.value = r.avgDbp || '';
    if (ns) ns.value = r.minSbp || '';
    if (nd) nd.value = r.minDbp || '';
    if (xs) xs.value = r.maxSbp || '';
    if (xd) xd.value = r.maxDbp || '';
    if (m) m.value = r.note || '';
    var rs = $('register-status'); if (rs) rs.textContent = '📝 編集中';
    if (sb) { sb.focus(); sb.select(); sb.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  } catch (e) { console.error('editReading:', e); }
}

function deleteReadingConfirm(id) {
  confirmAsync('削除確認', 'この測定データを削除しますか？').then(function(ok) {
    if (!ok) return;
    deleteReading(id).then(function() {
      toast('データを削除しました');
      renderView();
    }).catch(function(e) { console.error(e); });
  });
}

// ═══════════════════════════════════════════════════════════
//  DATA MANAGEMENT
// ═══════════════════════════════════════════════════════════

async function exportCSV() {
  var readings = await getReadingsByPatient(currentPatientId);
  var patient = await getPatient(currentPatientId);
  if (readings.length === 0) { toast('データがありません'); return; }
  readings.sort(function(a, b) { return a.date.localeCompare(b.date); });
  var csv = '\ufeff患者ID,患者氏名,測定日,受診SBP,受診DBP,家庭SBP平均,家庭DBP平均,家庭SBP最小,家庭DBP最小,家庭SBP最大,家庭DBP最大,メモ\n';
  for (var i = 0; i < readings.length; i++) {
    var r = readings[i];
    var name = patient ? patient.name.replace(/"/g, '""') : '';
    csv += currentPatientId + ',"' + name + '",' + r.date + ',' +
      (r.systolic || 0) + ',' + (r.diastolic || 0) + ',' +
      (r.avgSbp || 0) + ',' + (r.avgDbp || 0) + ',' +
      (r.minSbp || 0) + ',' + (r.minDbp || 0) + ',' +
      (r.maxSbp || 0) + ',' + (r.maxDbp || 0) + ',' +
      '"' + (r.note || '').replace(/"/g, '""') + '"\n';
  }
  var today = fmtDate(new Date());
  downloadFile(csv, 'bp_' + currentPatientId + '_' + today + '.csv');
  toast('CSVエクスポート完了');
}

function handleImportCSV() {
  var fi = $('file-import'); if (!fi) return;
  fi.value = ''; fi.accept = '.csv';
  fi.onchange = function(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = async function(evt) {
      var text = evt.target.result;
      var records = parseCSV(text);
      if (records.length === 0) { toast('CSVデータがありません'); return; }
      var imported = 0, skipped = 0;
      for (var idx = 0; idx < records.length; idx++) {
        (function(rec, lastIdx) {
          (async function() {
            try {
              var existing = await getReadingByDate(rec.patientId, rec.date);
              if (existing) {
                existing.systolic = rec.systolic; existing.diastolic = rec.diastolic;
                existing.meanArterial = Math.round((rec.systolic + rec.diastolic * 2) / 3);
                existing.note = rec.note; existing.updatedAt = new Date().toISOString();
                await putReading(existing);
              } else {
                var pat = await getPatient(rec.patientId);
                if (!pat) await putPatient({ id: rec.patientId, name: rec.name, createdAt: new Date().toISOString() });
                await putReading({
                  patientId: rec.patientId, date: rec.date,
                  systolic: rec.systolic, diastolic: rec.diastolic,
                  meanArterial: Math.round((rec.systolic + rec.diastolic * 2) / 3),
                  note: rec.note, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
                });
              }
              imported++;
            } catch { skipped++; }
            if (lastIdx === records.length - 1) {
              toast('CSV取り込み完了: ' + imported + '件, ' + skipped + '件スキップ');
              if (currentPatientId) renderView();
            }
          })();
        })(records[idx], idx);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };
  fi.click();
}

async function handleBackup() {
  var patients = await getAllPatients();
  var readings = await getAllReadings();
  downloadFile(backupToJSON({ patients: patients, readings: readings }),
    'bp_backup_' + fmtDate(new Date()) + '.json', 'application/json');
  toast('バックアップ完了');
}

function handleRestore() {
  var fi = $('file-import'); if (!fi) return;
  fi.value = ''; fi.accept = '.json';
  fi.onchange = function(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = async function(evt) {
      try {
        var data = parseBackupJSON(evt.target.result);
        if (!data) { toast('無効なバックアップファイル'); return; }
        var ok = await confirmAsync('復元確認', '全データをバックアップから復元します。既存データは上書きされます。');
        if (!ok) return;
        if (data.patients) for (var i = 0; i < data.patients.length; i++) await putPatient(data.patients[i]);
        if (data.readings) for (var j = 0; j < data.readings.length; j++) await putReading(data.readings[j]);
        toast('復元完了');
        currentPatientId = null;
        showScreen('id');
        var inp = $('inp-patient-id'); if (inp) inp.value = '';
        await renderRecentPatients();
        if (inp) inp.focus();
      } catch (e) { console.error(e); toast('復元失敗'); }
    };
    reader.readAsText(file, 'UTF-8');
  };
  fi.click();
}

async function handleDeletePatient() {
  var ok = await confirmAsync('患者削除', '患者 ' + currentPatientId + ' の全データを削除します。本当によろしいですか？');
  if (!ok) return;
  try {
    await deletePatient(currentPatientId);
    toast('患者を削除しました');
    currentPatientId = null;
    showScreen('id');
    var inp = $('inp-patient-id'); if (inp) inp.value = '';
    await renderRecentPatients();
    if (inp) inp.focus();
  } catch (e) { console.error(e); }
}

function downloadFile(content, filename, mime) {
  mime = mime || 'text/csv';
  var blob = new Blob([content], { type: mime + ';charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function updateDataStat() {
   var stat = $('data-stat'); if (!stat) return;
   getReadingsByPatient(currentPatientId).then(function(r) {
     stat.textContent = 'データ: ' + r.length + '件 | 最終更新: ' + new Date().toLocaleString('ja-JP');
   });
}



// ═══════════════════════════════════════════════════════════
//  PASTE VIEW
// ═══════════════════════════════════════════════════════════

var _parsedVisitRecords = null;

function renderPasteView() {
  setViewTabs();

  var yearInp = $('inp-visit-year');
  if (yearInp && !yearInp.value) yearInp.value = new Date().getFullYear();

  _parsedVisitRecords = null;
  var preview = $('visit-preview');
  if (preview) preview.style.display = 'none';
  var body = $('visit-preview-body');
  if (body) body.innerHTML = '';
  var status = $('visit-save-status');
  if (status) status.textContent = '';

  var ta = $('inp-visit-data');
  if (ta) ta.focus();
}

function handleParseVisit() {
  var ta = $('inp-visit-data');
  if (!ta) return;
  var text = ta.value.trim();
  if (!text) { toast('データを貼り付けてから解析してください'); return; }

  var baseYear = Number($('inp-visit-year').value) || new Date().getFullYear();
  var records = parseVisitData(text, baseYear);

  if (records.length === 0) { toast('有効なデータが見つかりませんでした'); return; }

  _parsedVisitRecords = records;
  renderVisitPreview(records);
  toast(records.length + '件のデータを解析しました');
}

function parseVisitData(text, baseYear) {
  var lines = text.split(/\r?\n/);
  var records = [];
  var now = new Date();
  var currentMonth = now.getMonth() + 1;
  var currentYear = now.getFullYear();

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line.trim()) continue;

    var dateMatch = line.match(/^(\d{1,2})\/(\d{1,2})(?:\s|　)/);
    if (!dateMatch) continue;
    var month = parseInt(dateMatch[1], 10);
    var day = parseInt(dateMatch[2], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;

    var rest = line.substring(dateMatch[0].length);
    var avgSbp = 0, avgDbp = 0, minSbp = 0, minDbp = 0, maxSbp = 0, maxDbp = 0;
    var minSbpPm = 0, maxSbpPm = 0;
    var memo = '';
    var bpEnd = 0;
    var parsed = false;

    // Format A: avgSBP/avgDBP [minSBP/minDBP-maxSBP/maxDBP] memo
    // "130/80 110/50-160/90　変わりない"
    var m = rest.match(/^(\d{1,3})\/(\d{1,3})\s+(\d{1,3})\/(\d{1,3})-(\d{1,3})\/(\d{1,3})(?:\s|　|$)/);
    if (m) {
      avgSbp = parseInt(m[1], 10);
      avgDbp = parseInt(m[2], 10);
      minSbp = parseInt(m[3], 10);
      minDbp = parseInt(m[4], 10);
      maxSbp = parseInt(m[5], 10);
      maxDbp = parseInt(m[6], 10);
      bpEnd = dateMatch[0].length + m[0].length;
      parsed = true;
    }

    // Format B: avgSBP/avgDBP memo  (original variant, no range)
    if (!parsed) {
      m = rest.match(/^(\d{1,3})\/(\d{1,3})(?:\s|　|$)/);
      if (m) {
        avgSbp = parseInt(m[1], 10);
        avgDbp = parseInt(m[2], 10);
        bpEnd = dateMatch[0].length + m[0].length;
        parsed = true;
      }
    }

    // Format C: [朝]min-max  朝の最低-最高 (systolic only)
    // "130-160" / "朝130-160"
    if (!parsed) {
      m = rest.match(/^(?:朝)?(\d{1,3})-(\d{1,3})/);
      if (m) {
        minSbp = parseInt(m[1], 10);
        maxSbp = parseInt(m[2], 10);
        bpEnd = dateMatch[0].length + m[0].length;

        // Format D: 朝min-max [夕min-max]  朝に続けて夕方の最低-最高
        // "130-160　100-150" / "朝130-160　夕100-150"
        var afterFirst = rest.substring(m[0].length);
        var m2 = afterFirst.match(/^[　\s]+(?:夕)?(\d{1,3})-(\d{1,3})/);
        if (m2) {
          minSbpPm = parseInt(m2[1], 10);
          maxSbpPm = parseInt(m2[2], 10);
          bpEnd = dateMatch[0].length + m[0].length + m2[0].length;
        }
        parsed = true;
      }
    }

    if (!parsed) continue;

    memo = line.substring(bpEnd).trim();

    if (avgSbp === 0 && avgDbp === 0 && minSbp === 0 && maxSbp === 0 && minSbpPm === 0 && maxSbpPm === 0) continue;

    var year = baseYear || currentYear;
    if (month > currentMonth + 1 && year === currentYear) {
      year = currentYear - 1;
    }

    var yyyy = String(year);
    var mm = String(month).padStart(2, '0');
    var dd = String(day).padStart(2, '0');
    var fullDate = yyyy + '-' + mm + '-' + dd;

    records.push({
      date: fullDate,
      year: year, month: month, day: day,
      avgSbp: avgSbp, avgDbp: avgDbp,
      minSbp: minSbp, minDbp: minDbp,
      maxSbp: maxSbp, maxDbp: maxDbp,
      minSbpPm: minSbpPm, maxSbpPm: maxSbpPm,
      memo: memo
    });
  }

  return records;
}

function renderVisitPreview(records) {
  var body = $('visit-preview-body');
  var preview = $('visit-preview');
  var count = $('visit-preview-count');
  if (!body || !preview) return;

  var html = '';
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    html += '<tr class="preview-row">' +
      '<td><input type="date" class="preview-date" value="' + r.date + '" data-idx="' + i + '"></td>' +
      '<td><input type="number" class="preview-avg-sbp" value="' + r.avgSbp + '" min="50" max="300" data-idx="' + i + '"></td>' +
      '<td><input type="number" class="preview-avg-dbp" value="' + r.avgDbp + '" min="30" max="200" data-idx="' + i + '"></td>' +
      '<td><input type="number" class="preview-min-sbp" value="' + (r.minSbp || '') + '" min="50" max="300" data-idx="' + i + '"></td>' +
      '<td><input type="number" class="preview-max-sbp" value="' + (r.maxSbp || '') + '" min="50" max="300" data-idx="' + i + '"></td>' +
      '<td><input type="number" class="preview-min-sbp-pm" value="' + (r.minSbpPm || '') + '" min="50" max="300" data-idx="' + i + '"></td>' +
      '<td><input type="number" class="preview-max-sbp-pm" value="' + (r.maxSbpPm || '') + '" min="50" max="300" data-idx="' + i + '"></td>' +
      '<td><input type="text" class="preview-memo memo-input" value="' + esc(r.memo) + '" data-idx="' + i + '"></td>' +
      '</tr>';
  }
  body.innerHTML = html;
  preview.style.display = '';
  if (count) count.textContent = '全 ' + records.length + ' 件';

  var inputs = preview.querySelectorAll('input, select');
  for (var j = 0; j < inputs.length; j++) {
    inputs[j].addEventListener('change', syncPreviewEdit);
    inputs[j].addEventListener('input', syncPreviewEdit);
  }
}

function syncPreviewEdit() {
  if (!_parsedVisitRecords) return;
  var idx = Number(this.dataset.idx);
  if (isNaN(idx) || idx < 0 || idx >= _parsedVisitRecords.length) return;
  var r = _parsedVisitRecords[idx];
  var cls = this.className;

  if (cls === 'preview-date' || cls.indexOf('preview-date') !== -1) {
    r.date = this.value;
    var parts = this.value.split('-');
    if (parts.length === 3) {
      r.year = parseInt(parts[0], 10);
      r.month = parseInt(parts[1], 10);
      r.day = parseInt(parts[2], 10);
    }
  } else if (cls.indexOf('preview-avg-sbp') !== -1) { r.avgSbp = Number(this.value) || 0;
  } else if (cls.indexOf('preview-avg-dbp') !== -1) { r.avgDbp = Number(this.value) || 0;
  } else if (cls.indexOf('preview-min-sbp') !== -1) { r.minSbp = Number(this.value) || 0;
  } else if (cls.indexOf('preview-min-dbp') !== -1) { r.minDbp = Number(this.value) || 0;
  } else if (cls.indexOf('preview-max-sbp') !== -1) { r.maxSbp = Number(this.value) || 0;
  } else if (cls.indexOf('preview-max-dbp') !== -1) { r.maxDbp = Number(this.value) || 0;
  } else if (cls.indexOf('preview-min-sbp-pm') !== -1) { r.minSbpPm = Number(this.value) || 0;
  } else if (cls.indexOf('preview-max-sbp-pm') !== -1) { r.maxSbpPm = Number(this.value) || 0;
  } else if (cls.indexOf('preview-memo') !== -1) { r.memo = this.value; }
}

async function handleSaveVisit() {
  if (!_parsedVisitRecords || _parsedVisitRecords.length === 0) {
    toast('解析データがありません。先に「解析する」を実行してください');
    return;
  }

  var saved = 0, skipped = 0, overwritten = 0;
  var status = $('visit-save-status');

  for (var i = 0; i < _parsedVisitRecords.length; i++) {
    var r = _parsedVisitRecords[i];
    try {
      if (!r.date) { skipped++; continue; }
      if (!r.avgSbp && !r.avgDbp && !r.minSbp && !r.maxSbp) { skipped++; continue; }

      var existing = await getReadingByDate(currentPatientId, r.date);

      var reading = {
        patientId: currentPatientId,
        date: r.date,
        systolic: 0,
        diastolic: 0,
        meanArterial: 0,
        note: r.memo || '',
        avgSbp: r.avgSbp || 0,
        avgDbp: r.avgDbp || 0,
        minSbp: r.minSbp || 0,
        minDbp: r.minDbp || 0,
        maxSbp: r.maxSbp || 0,
        maxDbp: r.maxDbp || 0,
        minSbpPm: r.minSbpPm || 0,
        maxSbpPm: r.maxSbpPm || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (existing) {
        if (existing.systolic && existing.systolic > 0) {
          var ok = await confirmAsync(
            '上書き確認',
            r.date + ' には日次測定データが存在します。受診間サマリーで上書きしますか？'
          );
          if (!ok) { skipped++; continue; }
        }
        reading.id = existing.id;
        reading.createdAt = existing.createdAt;
        overwritten++;
      }

      await putReading(reading);
      saved++;
      if (status) status.textContent = '保存中… ' + saved + '/' + _parsedVisitRecords.length;
    } catch (e) {
      console.error('saveVisit error:', r.date, e);
      skipped++;
    }
  }

  var msg = '保存完了: ' + saved + '件';
  if (overwritten > 0) msg += ' (' + overwritten + '件上書き)';
  if (skipped > 0) msg += ', ' + skipped + '件スキップ';
  toast(msg);
  if (status) status.textContent = '✅ ' + msg;

  _parsedVisitRecords = null;
}

// ═══════════════════════════════════════════════════════════
//  CSV FUNCTIONS (from csv.js)
// ═══════════════════════════════════════════════════════════

function parseCSVLine(line) {
  var result = [], current = '', inQuote = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = false;
      } else { current += c; }
    } else {
      if (c === '"') { inQuote = true; }
      else if (c === ',') { result.push(current.trim()); current = ''; }
      else { current += c; }
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
  if (lines.length < 2) return [];
  var records = [];
  for (var i = 1; i < lines.length; i++) {
    var cols = parseCSVLine(lines[i]);
    if (cols.length < 5) continue;
    var patientId = cols[0], name = cols[1] || '', date = cols[2];
    var systolic = Number(cols[3]), diastolic = Number(cols[4]);
    var note = cols[5] || '';
    if (!patientId || !date || isNaN(systolic) || isNaN(diastolic)) continue;
    records.push({ patientId: patientId, name: name, date: date, systolic: systolic, diastolic: diastolic, note: note });
  }
  return records;
}

function backupToJSON(data) { return JSON.stringify(data, null, 2); }

function parseBackupJSON(text) {
  try {
    var data = JSON.parse(text);
    if (data && (Array.isArray(data.patients) || Array.isArray(data.readings))) return data;
    return null;
  } catch { return null; }
}