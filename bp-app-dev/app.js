/* =================================================================
   app.js — メインアプリケーションロジック v2.0.0
   ================================================================= */

currentPatientId = null;
var currentView = 'all';
var editingId = null;
var _confirmResolve = null;
var _calYear = 0;
var _calMonth = 0;
var _calAppointments = [];

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

// Clipboard copy (file://対応 execCommand フォールバック)
function copyToClipboard(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { console.error('clipboard copy error:', e); }
  document.body.removeChild(ta);
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
  var a = $('screen-id'), b = $('screen-patient'), c = $('screen-calendar');
  if (a) a.style.display = id === 'id' ? '' : 'none';
  if (b) b.style.display = id === 'patient' ? '' : 'none';
  if (c) c.style.display = id === 'calendar' ? '' : 'none';
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

  // Event: Appointment
  var btnSaveAppt = $('btn-save-appointment');
  if (btnSaveAppt) btnSaveAppt.addEventListener('click', handleSaveAppointment);
  var btnMarkDone = $('btn-mark-done');
  if (btnMarkDone) btnMarkDone.addEventListener('click', handleMarkDone);

  var inpNextDate = $('inp-next-date');
  if (inpNextDate) inpNextDate.addEventListener('change', updateAppointmentCountdown);
  var inpMedDays = $('inp-medication-days');
  if (inpMedDays) inpMedDays.addEventListener('input', updateAppointmentCountdown);

  // Event: Calendar
  var calTop = $('btn-calendar-top');
  if (calTop) calTop.addEventListener('click', openCalendar);
  var vCal = $('view-calendar');
  if (vCal) vCal.addEventListener('click', function() { currentView = 'calendar'; if (currentPatientId) renderView(); });
  var calPrev = $('cal-prev');
  if (calPrev) calPrev.addEventListener('click', function() { calNavigate(-1); });
  var calNext = $('cal-next');
  if (calNext) calNext.addEventListener('click', function() { calNavigate(1); });
  var calToday = $('cal-today');
  if (calToday) calToday.addEventListener('click', function() { openCalendar(); });
  var calBack = $('cal-back');
  if (calBack) calBack.addEventListener('click', closeCalendar);
  var calDetailClose = $('appt-detail-close');
  if (calDetailClose) calDetailClose.addEventListener('click', function() { hideModal('appt-detail'); });
  var btnExportAppt = $('btn-export-appt-csv');
  if (btnExportAppt) btnExportAppt.addEventListener('click', exportAppointmentsCSV);

  // Event: Demo data
  var btnDemo = $('btn-demo-data');
  if (btnDemo) btnDemo.addEventListener('click', initDemoData);

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

  $('header-info').textContent = 'v2.0.0 | ' + new Date().toLocaleDateString('ja-JP');
  $('app-version').textContent = '2.0.0';
  $('app-build-date').textContent = new Date().toLocaleDateString('ja-JP');
  $('app-version-footer').textContent = '2.0.0';
  startEmrFollow();
}

// Synchronous DB open wrapper (runs inside async init)
function openDBSync() {
   return new Promise(function(resolve, reject) {
     var r = indexedDB.open('BloodPressureDB', 4);
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
       if (!d.objectStoreNames.contains('appointments')) {
         var as3 = d.createObjectStore('appointments', { keyPath: 'id', autoIncrement: true });
         as3.createIndex('byPatient', 'patientId');
         as3.createIndex('byDate', 'appointmentDate');
         as3.createIndex('byPatientDate', ['patientId', 'appointmentDate'], { unique: true });
       }
       if (!d.objectStoreNames.contains('daySettings')) {
         d.createObjectStore('daySettings', { keyPath: 'date' });
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

// ── 予約 ──
async function getAppointment(id) { return prom(tx('appointments', 'readonly').get(id)); }
async function getAppointmentsByPatient(pid) { return prom(tx('appointments', 'readonly').index('byPatient').getAll(pid)); }
async function getAppointmentsByDate(date) { return prom(tx('appointments', 'readonly').index('byDate').getAll(date)); }
async function putAppointment(a) {
  a.updatedAt = new Date().toISOString();
  if (!a.createdAt) a.createdAt = a.updatedAt;
  return prom(tx('appointments', 'readwrite').put(a));
}
async function deleteAppointment(id) { return prom(tx('appointments', 'readwrite').delete(id)); }
async function getAllAppointments() { return prom(tx('appointments', 'readonly').getAll()); }
async function markAppointmentDone(id) {
  var a = await getAppointment(id);
  if (!a) return;
  a.status = 'done';
  a.updatedAt = new Date().toISOString();
  return prom(tx('appointments', 'readwrite').put(a));
}
async function getUpcomingAppointment(pid) {
  var apps = await getAppointmentsByPatient(pid);
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  var upcoming = apps.filter(function(a) { return a.status === 'scheduled' && a.appointmentDate >= todayStr; });
  upcoming.sort(function(a, b) { return a.appointmentDate.localeCompare(b.appointmentDate); });
  return upcoming.length > 0 ? upcoming[0] : null;
}
async function getAppointmentsByDateRange(start, end) {
  return prom(tx('appointments', 'readonly').index('byDate').getAll(IDBKeyRange.bound(start, end, false, false)));
}

// ── 日付設定 ──
async function getDaySetting(date) {
  try { return await prom(tx('daySettings', 'readonly').get(date)); } catch { return null; }
}
async function putDaySetting(ds) {
  ds.updatedAt = new Date().toISOString();
  return prom(tx('daySettings', 'readwrite').put(ds));
}
async function getDaySettingsByDateRange(start, end) {
  return prom(tx('daySettings', 'readonly').getAll(IDBKeyRange.bound(start, end, false, false)));
}
async function deleteDaySetting(date) {
  return prom(tx('daySettings', 'readwrite').delete(date));
}

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
      // 予約セクション表示
      await renderAppointmentSection();
    } catch (e) {
      console.error('renderPatientPage error:', e);
      toast('ページ表示エラー');
    }
  }

function renderView() {
  if (currentView === 'paste') { showPasteView(); renderPasteView(); }
  else if (currentView === 'calendar') { showCalendarView(); }
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
  var a = $('view-all'), p = $('view-paste'), c = $('view-calendar');
  if (a) a.classList.toggle('active', currentView === 'all');
  if (p) p.classList.toggle('active', currentView === 'paste');
  if (c) c.classList.toggle('active', currentView === 'calendar');
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

      // 同じ日付に予約があれば自動で来院済に
      try {
        var apptsOnDate = await getAppointmentsByPatient(currentPatientId);
        var apptToday = apptsOnDate.find(function(a) {
          return a.appointmentDate === date && a.status === 'scheduled';
        });
        if (apptToday) {
          await markAppointmentDone(apptToday.id);
          toast(date + ' のデータを保存しました（予約を来院済に更新）');
        } else {
          toast(date + ' のデータを保存しました');
        }
      } catch (e2) {
        toast(date + ' のデータを保存しました');
      }

      // クリップボードにコピー
      var clipDate = reading.date.replace(/-/g, '/');
      var clipSbp = reading.systolic || 0;
      var clipDbp = reading.diastolic || 0;
      var clipAvgSbp = reading.avgSbp || 0;
      var clipAvgDbp = reading.avgDbp || 0;
      var clipMinSbp = reading.minSbp || 0;
      var clipMinDbp = reading.minDbp || 0;
      var clipMaxSbp = reading.maxSbp || 0;
      var clipMaxDbp = reading.maxDbp || 0;
      var clipText = clipDate + '\n' +
        '受診時血圧' + clipSbp + '/' + clipDbp + 'mmHg\n' +
        '家庭血圧平均' + clipAvgSbp + '/' + clipAvgDbp + 'mmHg、最低' + clipMinSbp + '/' + clipMinDbp + 'mmHg、最高' + clipMaxSbp + '/' + clipMaxDbp + 'mmHg';
      copyToClipboard(clipText);

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
  var appointments = await getAllAppointments();
  downloadFile(backupToJSON({ patients: patients, readings: readings, appointments: appointments }),
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
        if (data.appointments) for (var k = 0; k < data.appointments.length; k++) await putAppointment(data.appointments[k]);
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
//  APPOINTMENT
// ═══════════════════════════════════════════════════════════

async function renderAppointmentSection() {
  var statusArea = $('appointment-status-area');
  var formArea = $('appointment-form-area');
  if (!statusArea || !formArea) return;
  var nd = $('inp-next-date'), md = $('inp-medication-days');
  var memo = $('inp-appointment-memo'), cd = $('appointment-countdown');
  var btnDone = $('btn-mark-done'), btnSave = $('btn-save-appointment');
  var statusEl = $('appointment-status');

  var upcoming = await getUpcomingAppointment(currentPatientId);

  if (upcoming) {
    statusArea.innerHTML = '<div class="appointment-badge scheduled">📅 予約済 | ' + upcoming.appointmentDate + ' | 処方: ' + (upcoming.medicationDays || '?') + '日分</div>';
    if (nd) nd.value = upcoming.appointmentDate;
    if (md) md.value = upcoming.medicationDays || '';
    if (memo) memo.value = upcoming.medicationNote || '';
    if (cd) cd.textContent = calcCountdown(upcoming.appointmentDate);
    if (btnDone) btnDone.style.display = '';
    if (btnSave) btnSave.textContent = '📅 予約更新';
    if (statusEl) statusEl.textContent = '前回設定: ' + (upcoming.updatedAt ? new Date(upcoming.updatedAt).toLocaleDateString('ja-JP') : '');
  } else {
    statusArea.innerHTML = '';
    if (nd) nd.value = '';
    if (md) md.value = '';
    if (memo) memo.value = '';
    if (cd) cd.textContent = '';
    if (btnDone) btnDone.style.display = 'none';
    if (btnSave) btnSave.textContent = '📅 予約登録';
    if (statusEl) statusEl.textContent = '';
  }
}

function calcCountdown(dateStr) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var target = new Date(dateStr + 'T00:00:00');
  var diff = Math.round((target - today) / 86400000);
  if (diff < 0) return '⚠ ' + (-diff) + '日前（期限切れ）';
  if (diff === 0) return '🟢 今日';
  if (diff === 1) return '🔵 明日';
  return '🔵 ' + diff + '日後（' + dateStr + '）';
}

function updateAppointmentCountdown() {
  var nd = $('inp-next-date');
  var cd = $('appointment-countdown');
  if (!nd || !cd) return;
  if (nd.value) {
    cd.textContent = calcCountdown(nd.value);
  } else {
    cd.textContent = '';
  }
}

async function handleSaveAppointment() {
  var nd = $('inp-next-date'), md = $('inp-medication-days');
  var memo = $('inp-appointment-memo');
  if (!nd) return;
  var date = nd.value;
  if (!date) { toast('次回来院日を入力してください'); return; }

  try {
    // 既存の予約をチェック
    var upcoming = await getUpcomingAppointment(currentPatientId);
    var appointment = {
      patientId: currentPatientId,
      appointmentDate: date,
      medicationDays: md ? Number(md.value) || 0 : 0,
      medicationNote: memo ? memo.value.trim() : '',
      status: 'scheduled',
      createdAt: upcoming ? upcoming.createdAt : new Date().toISOString()
    };

    // 同一患者・同一天の既存予約があれば上書き
    var allPatientApps = await getAppointmentsByPatient(currentPatientId);
    var existingOnDate = allPatientApps.find(function(a) {
      return a.appointmentDate === date && a.status === 'scheduled';
    });
    if (existingOnDate) {
      appointment.id = existingOnDate.id;
    } else if (upcoming) {
      // 既存の未来予約があればキャンセルして新しいものを作る
      if (upcoming.appointmentDate !== date) {
        await cancelAppointment(upcoming.id);
      } else {
        appointment.id = upcoming.id;
      }
    }

    await putAppointment(appointment);
    toast('予約を保存しました: ' + date + (md && md.value ? ' (' + md.value + '日分)' : ''));
    await renderAppointmentSection();
  } catch (e) {
    console.error('handleSaveAppointment error:', e);
    toast('予約保存エラー: ' + e.message);
  }
}

async function handleMarkDone() {
  var upcoming = await getUpcomingAppointment(currentPatientId);
  if (!upcoming) { toast('予約がありません'); return; }
  var ok = await confirmAsync('来院済確認', upcoming.appointmentDate + ' の予約を「来院済」にしますか？' + (upcoming.medicationDays ? '\n処方: ' + upcoming.medicationDays + '日分' : ''));
  if (!ok) return;
  try {
    await markAppointmentDone(upcoming.id);
    toast(upcoming.appointmentDate + ' の予約を来院済にしました');
    await renderAppointmentSection();
  } catch (e) {
    console.error(e);
    toast('エラー: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  CALENDAR
// ═══════════════════════════════════════════════════════════

// 日本の祝日データ（2025-2027年）
var JP_HOLIDAYS = {
  '2025-01-01': '元日', '2025-01-13': '成人の日', '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日', '2025-02-24': '振替休日', '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日', '2025-05-03': '憲法記念日', '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日', '2025-05-06': '振替休日', '2025-07-21': '海の日',
  '2025-08-11': '山の日', '2025-09-15': '敬老の日', '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日', '2025-11-03': '文化の日', '2025-11-23': '勤労感謝の日',
  '2025-11-24': '振替休日',
  '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日', '2026-03-20': '春分の日', '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日', '2026-05-05': 'こどもの日',
  '2026-05-06': '振替休日', '2026-07-20': '海の日', '2026-08-11': '山の日',
  '2026-09-21': '敬老の日', '2026-09-22': '秋分の日', '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
  '2027-01-01': '元日', '2027-01-11': '成人の日', '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日', '2027-03-20': '春分の日', '2027-03-22': '振替休日',
  '2027-04-29': '昭和の日', '2027-05-03': '憲法記念日', '2027-05-04': 'みどりの日',
  '2027-05-05': 'こどもの日', '2027-07-19': '海の日', '2027-08-11': '山の日',
  '2027-09-20': '敬老の日', '2027-09-23': '秋分の日', '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日', '2027-11-23': '勤労感謝の日'
};

var _busyLevelLabels = ['空き', '通常', '混雑', '激混み'];

function openCalendar() {
  var now = new Date();
  _calYear = now.getFullYear();
  _calMonth = now.getMonth() + 1;
  showScreen('calendar');
  renderCalendar(_calYear, _calMonth);
}

function showCalendarView() {
  setViewTabs();
  openCalendar();
}

function closeCalendar() {
  currentView = 'all';
  if (currentPatientId) {
    showScreen('patient');
    renderPatientPage();
  } else {
    showScreen('id');
    initIdScreen();
  }
}

function calNavigate(delta) {
  _calMonth += delta * 2;
  if (_calMonth < 1) { _calMonth += 12; _calYear--; }
  if (_calMonth > 12) { _calMonth -= 12; _calYear++; }
  renderCalendar(_calYear, _calMonth);
}

function _busyLabel(level) {
  return level >= -1 && level <= 2 ? _busyLevelLabels[level + 1] : '';
}

function _predictionMapKey(dsMap, startDate, endDate) {
  // 28日後予測マップを作成
  var pred = {};
  for (var dateStr in dsMap) {
    if (dateStr < startDate || dateStr > endDate) continue;
    var ds = dsMap[dateStr];
    if (!ds.isManual) continue;
    var triggerBusy = (ds.busyLevel === 2 || ds.busyLevel === -1) || ds.flags.isHoliday;
    if (!triggerBusy) continue;
    var d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 28);
    var pd = fmtDate(d);
    if (pd >= startDate && pd <= endDate && (!dsMap[pd] || !dsMap[pd].isManual)) {
      pred[pd] = { fromDate: dateStr, busyLevel: ds.flags.isHoliday ? -1 : ds.busyLevel };
    }
  }
  return pred;
}

function _buildMonthTable(y, m, pad, patientCache, todayStr, daySettingMap, predMap) {
  var firstDay = new Date(y, m - 1, 1).getDay();
  var daysInMonth = new Date(y, m, 0).getDate();
  var todayDate = new Date(todayStr + 'T00:00:00');

  var html = '<table class="cal-table"><caption class="cal-month-title">' + y + '年' + m + '月</caption>';
  html += '<thead><tr><th>日</th><th>月</th><th>火</th><th>水</th><th>木</th><th>金</th><th>土</th></tr></thead><tbody>';

  var day = 1;
  for (var row = 0; row < 6; row++) {
    if (day > daysInMonth) break;
    html += '<tr>';
    for (var col = 0; col < 7; col++) {
      if ((row === 0 && col < firstDay) || day > daysInMonth) {
        html += '<td class="cal-empty"></td>';
      } else {
        var dateStr = y + '-' + pad(m) + '-' + pad(day);
        var isToday = dateStr === todayStr;
        var dayAppts = _calAppointments.filter(function(a) {
          return a.appointmentDate === dateStr && a.status === 'scheduled';
        });
        var isSun = col === 0;
        var isSat = col === 6;

        var cls = 'cal-day';
        if (isToday) cls += ' cal-today';
        if (isSun) cls += ' cal-sun';
        if (isSat) cls += ' cal-sat';
        if (dayAppts.length > 0) cls += ' cal-has-appt';

        // 日付設定を参照
        var ds = daySettingMap ? daySettingMap[dateStr] : null;
        if (ds) {
          if (ds.flags && ds.flags.isHoliday) cls += ' cal-holiday';
          if (ds.flags && ds.flags.isClosed) cls += ' cal-closed';
          if (ds.flags && ds.flags.isBusinessTrip) cls += ' cal-businesstrip';
          if (ds.flags && ds.flags.isLimited) cls += ' cal-limited';
          if (ds.busyLevel === 2) cls += ' cal-busy-2';
          else if (ds.busyLevel === 1) cls += ' cal-busy-1';
          else if (ds.busyLevel === -1) cls += ' cal-busy-m1';
        }

        // 今日からの日数
        var cellDate = new Date(dateStr + 'T00:00:00');
        var offset = Math.round((cellDate - todayDate) / 86400000);
        var offsetLabel = '';
        if (offset === 0) {
          offsetLabel = '<span class="cal-offset cal-offset-today">今日</span>';
        } else if (offset > 0) {
          offsetLabel = '<span class="cal-offset">+' + offset + '</span>';
        } else {
          offsetLabel = '<span class="cal-offset cal-offset-past">' + offset + '</span>';
        }

        var label = '' + day + '<br>' + offsetLabel;

        // 混雑度バッジ
        if (ds) {
          var busyBadge = '';
          if (ds.flags && ds.flags.isHoliday) {
            busyBadge = '<span class="cal-badge cal-badge-holiday">祝日</span>';
          } else if (ds.flags && ds.flags.isClosed) {
            busyBadge = '<span class="cal-badge cal-badge-closed">休診</span>';
          } else if (ds.flags && ds.flags.isBusinessTrip) {
            busyBadge = '<span class="cal-badge cal-badge-trip">出張</span>';
          } else if (ds.busyLevel === 2) {
            busyBadge = '<span class="cal-badge cal-badge-busy2">激混み</span>';
          } else if (ds.busyLevel === 1) {
            busyBadge = '<span class="cal-badge cal-badge-busy1">混雑</span>';
          } else if (ds.busyLevel === -1) {
            busyBadge = '<span class="cal-badge cal-badge-empty">余裕</span>';
          }
          if (busyBadge) label += '<br>' + busyBadge;
          if (ds.flags && ds.flags.isLimited) {
            label += '<br><span class="cal-badge cal-badge-limited">制限</span>';
          }
        }

        // 患者名
        if (dayAppts.length > 0) {
          var names = dayAppts.map(function(a) { return patientCache[a.patientId] || a.patientId; });
          var displayNames = names.slice(0, 2);
          if (names.length > 2) displayNames.push('+' + (names.length - 2));
          label += '<br><span class="cal-appt-names">' + displayNames.join('<br>') + '</span>';
        }

        // 28日後予測
        var pred = predMap ? predMap[dateStr] : null;
        if (pred) {
          var predLabel = pred.busyLevel === -1
            ? '<span class="cal-pred cal-pred-empty">🟢←28日予測</span>'
            : '<span class="cal-pred cal-pred-busy">🔴←28日予測</span>';
          label += '<br>' + predLabel;
        }

        html += '<td class="' + cls + '" data-date="' + dateStr + '">' + label + '</td>';
        day++;
      }
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

async function renderCalendar(year, month) {
  var title = $('cal-title');
  var body = $('cal-body');
  var info = $('cal-header-info');
  if (!title || !body) return;

  // 次月を計算
  var nextMonth = month + 1;
  var nextYear = year;
  if (nextMonth > 12) { nextMonth = 1; nextYear++; }

  title.textContent = year + '年' + month + '月 - ' + nextYear + '年' + nextMonth + '月';
  if (info) {
    var today = new Date();
    info.textContent = '今日: ' + fmtDate(today);
  }

  var pad = function(n) { return String(n).padStart(2, '0'); };
  var startDate = year + '-' + pad(month) + '-01';
  var endDate = nextYear + '-' + pad(nextMonth) + '-31';
  try {
    _calAppointments = await getAppointmentsByDateRange(startDate, endDate);
  } catch (e) {
    _calAppointments = [];
  }

  // 患者名をキャッシュ
  var patientCache = {};
  for (var i = 0; i < _calAppointments.length; i++) {
    var pid = _calAppointments[i].patientId;
    if (!patientCache[pid]) {
      try {
        var pat = await getPatient(pid);
        patientCache[pid] = pat ? pat.name : pid;
      } catch (e) {
        patientCache[pid] = pid;
      }
    }
  }

  // daySettings を取得
  var daySettingMap = {};
  try {
    var daySettings = await getDaySettingsByDateRange(startDate, endDate);
    for (var i = 0; i < daySettings.length; i++) {
      daySettingMap[daySettings[i].date] = daySettings[i];
    }
  } catch (e) { /* ignore */ }

  // 祝日を自動セット（手動設定済みの日は上書きしない）
  for (var dateStr in JP_HOLIDAYS) {
    if (dateStr >= startDate && dateStr <= endDate) {
      if (!daySettingMap[dateStr] || !daySettingMap[dateStr].isManual) {
        daySettingMap[dateStr] = {
          date: dateStr,
          flags: { isHoliday: true, isBusinessTrip: false, isLimited: false, isClosed: false },
          busyLevel: -1,
          note: JP_HOLIDAYS[dateStr],
          isManual: false
        };
      }
    }
  }

  // 28日後予測マップ
  var predMap = _predictionMapKey(daySettingMap, startDate, endDate);

  var todayStr = fmtDate(new Date());

  var html = '<div class="cal-two-month">';
  html += _buildMonthTable(year, month, pad, patientCache, todayStr, daySettingMap, predMap);
  html += _buildMonthTable(nextYear, nextMonth, pad, patientCache, todayStr, daySettingMap, predMap);
  html += '</div>';
  body.innerHTML = html;

  body.querySelectorAll('.cal-day[data-date]').forEach(function(td) {
    td.addEventListener('click', function() {
      var date = this.dataset.date;
      var dayAppts = _calAppointments.filter(function(a) { return a.appointmentDate === date && a.status === 'scheduled'; });
      showAppointmentDetail(date, dayAppts);
    });
    td.style.cursor = 'pointer';
  });
}

async function showAppointmentDetail(date, appts) {
  var title = $('appt-detail-title');
  var body = $('appt-detail-body');
  if (!title || !body) return;

  title.textContent = '📅 ' + date + ' の予約（' + (appts ? appts.length : 0) + '件）';

  var html = '';

  // 既存予約一覧
  if (appts && appts.length > 0) {
    var nameCache = {};
    for (var i = 0; i < appts.length; i++) {
      var pid = appts[i].patientId;
      if (!nameCache[pid]) {
        try {
          var p = await getPatient(pid);
          nameCache[pid] = p ? p.name : pid;
        } catch (e) { nameCache[pid] = pid; }
      }
    }

    html += '<table class="summary-table"><thead><tr><th>患者ID</th><th>氏名</th><th>処方日数</th><th>操作</th></tr></thead><tbody>';
    for (var i = 0; i < appts.length; i++) {
      var a = appts[i];
      var pid = esc(a.patientId);
      var pname = esc(nameCache[a.patientId] || a.patientId);
      html += '<tr>' +
        '<td>' + pid + '</td>' +
        '<td>' + pname + '</td>' +
        '<td>' + (a.medicationDays ? a.medicationDays + '日分' : '-') + '</td>' +
        '<td><button class="btn btn-sm btn-primary" data-nav-pid="' + esc(a.patientId) + '">📊 血圧</button></td>' +
        '</tr>';
    }
    html += '</tbody></table>';
  }

  // 新規予約フォーム
  html += '<div style="margin-top:' + (appts && appts.length > 0 ? '16px;padding-top:16px;border-top:2px solid #e0e4e8' : '0') + '">';
  html += '<h4 style="font-size:.9em;margin-bottom:10px;color:#2c3e50">📅 新規予約</h4>';
  html += '<div class="form-row"><label>患者</label><select id="cal-new-patient" style="flex:1;padding:6px 8px;border:1px solid #bdc3c7;border-radius:4px;font-size:.9em;background:#fff"></select></div>';
  html += '<div class="form-row"><label>処方日数</label><input type="number" id="cal-new-days" min="1" max="365" placeholder="28" style="padding:6px 8px;border:1px solid #bdc3c7;border-radius:4px;width:70px;font-size:.9em"><span class="unit" style="font-size:.82em;color:#7f8c8d">日分</span></div>';
  html += '<div class="form-row"><label>メモ</label><input type="text" id="cal-new-memo" placeholder="任意" style="flex:1;padding:6px 8px;border:1px solid #bdc3c7;border-radius:4px;font-size:.9em"></div>';
  html += '<div class="btn-group" style="margin-top:10px;justify-content:flex-start"><button class="btn btn-primary" id="btn-cal-create-appt" style="padding:8px 20px;font-size:.88em">📅 予約作成</button></div>';
  html += '</div>';

  body.innerHTML = html;

  // 患者ドロップダウンを設定
  try {
    var patients = await getAllPatients();
    var sel = $('cal-new-patient');
    if (sel) {
      sel.innerHTML = '<option value="">-- 患者を選択 --</option>';
      for (var i = 0; i < patients.length; i++) {
        var selected = patients[i].id === currentPatientId ? ' selected' : '';
        sel.innerHTML += '<option value="' + esc(patients[i].id) + '"' + selected + '>' + esc(patients[i].id) + ' ' + esc(patients[i].name || '') + '</option>';
      }
    }
  } catch (e) { console.error(e); }

  // 作成ボタン
  var btnCreate = $('btn-cal-create-appt');
  if (btnCreate) {
    btnCreate.addEventListener('click', function() {
      handleCalendarCreateAppointment(date);
    });
  }

  // 血圧遷移ボタン
  body.querySelectorAll('[data-nav-pid]').forEach(function(btn) {
    var pid = btn.dataset.navPid;
    btn.addEventListener('click', function() {
      hideModal('appt-detail');
      navigateToPatient(pid);
    });
  });

  // 📌 日付設定
  _renderDaySettingSection(date);

  showModal('appt-detail');
}

// ── 日付設定 ──

async function _renderDaySettingSection(date) {
  var container = $('appt-detail-body');
  if (!container) return;

  // 既存設定を取得
  var ds = null;
  try { ds = await getDaySetting(date); } catch (e) { /* ignore */ }
  var flags = ds && ds.flags ? ds.flags : {};
  var busyLevel = ds ? ds.busyLevel : 0;
  var note = ds ? (ds.note || '') : '';

  var sec = document.createElement('div');
  sec.style.cssText = 'margin-top:16px;padding-top:16px;border-top:2px solid #e0e4e8';
  sec.innerHTML =
    '<h4 style="font-size:.9em;margin-bottom:10px;color:#2c3e50">📌 日付設定</h4>' +
    '<div class="form-row" style="gap:8px">' +
      '<label style="min-width:60px">種別</label>' +
      '<label style="font-size:.82em;font-weight:400"><input type="checkbox" id="cal-flag-holiday"' + (flags.isHoliday ? ' checked' : '') + '> 祝日</label>' +
      '<label style="font-size:.82em;font-weight:400"><input type="checkbox" id="cal-flag-trip"' + (flags.isBusinessTrip ? ' checked' : '') + '> 出張</label>' +
      '<label style="font-size:.82em;font-weight:400"><input type="checkbox" id="cal-flag-limited"' + (flags.isLimited ? ' checked' : '') + '> 制限</label>' +
      '<label style="font-size:.82em;font-weight:400"><input type="checkbox" id="cal-flag-closed"' + (flags.isClosed ? ' checked' : '') + '> 休診</label>' +
    '</div>' +
    '<div class="form-row"><label style="min-width:60px">混雑</label>' +
      '<select id="cal-busy-level" style="padding:6px 8px;border:1px solid #bdc3c7;border-radius:4px;font-size:.88em;background:#fff">' +
        '<option value="-1"' + (busyLevel === -1 ? ' selected' : '') + '>空き</option>' +
        '<option value="0"' + (busyLevel === 0 ? ' selected' : '') + '>通常</option>' +
        '<option value="1"' + (busyLevel === 1 ? ' selected' : '') + '>混雑</option>' +
        '<option value="2"' + (busyLevel === 2 ? ' selected' : '') + '>激混み</option>' +
      '</select>' +
    '</div>' +
    '<div class="form-row"><label style="min-width:60px">メモ</label>' +
      '<input type="text" id="cal-setting-note" value="' + esc(note) + '" placeholder="任意" style="flex:1;padding:6px 8px;border:1px solid #bdc3c7;border-radius:4px;font-size:.9em">' +
    '</div>' +
    '<div class="btn-group" style="margin-top:10px;justify-content:flex-start">' +
      '<button class="btn btn-primary" id="btn-cal-save-setting" style="padding:8px 20px;font-size:.88em">💾 設定保存</button>' +
      (ds ? '<span style="font-size:.78em;color:#95a5a6;margin-left:8px">最終更新: ' + new Date(ds.updatedAt).toLocaleDateString('ja-JP') + '</span>' : '') +
    '</div>';

  container.appendChild(sec);

  var btnSave = $('btn-cal-save-setting');
  if (btnSave) {
    btnSave.addEventListener('click', function() { handleSaveDaySetting(date); });
  }
}

async function handleSaveDaySetting(date) {
  var getChk = function(id) { var e = $(id); return e ? e.checked : false; };
  var busyEl = $('cal-busy-level');
  var noteEl = $('cal-setting-note');

  var ds = {
    date: date,
    flags: {
      isHoliday: getChk('cal-flag-holiday'),
      isBusinessTrip: getChk('cal-flag-trip'),
      isLimited: getChk('cal-flag-limited'),
      isClosed: getChk('cal-flag-closed')
    },
    busyLevel: busyEl ? Number(busyEl.value) : 0,
    note: noteEl ? noteEl.value.trim() : '',
    isManual: true
  };

  try {
    await putDaySetting(ds);
    toast('日付設定を保存しました');
    hideModal('appt-detail');
    renderCalendar(_calYear, _calMonth);
  } catch (e) {
    console.error('handleSaveDaySetting error:', e);
    toast('保存エラー: ' + e.message);
  }
}

async function handleCalendarCreateAppointment(date) {
  var sel = $('cal-new-patient');
  var days = $('cal-new-days');
  var memo = $('cal-new-memo');
  if (!sel) return;

  var pid = sel.value;
  if (!pid) { toast('患者を選択してください'); return; }

  // 過去日チェック
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var targetDate = new Date(date + 'T00:00:00');
  if (targetDate < today) {
    toast('過去の日付には予約できません');
    return;
  }

  try {
    // 既存予約チェック（患者1人につき未来の予約1件のみ）
    var allApps = await getAppointmentsByPatient(pid);
    var existing = allApps.find(function(a) { return a.status === 'scheduled'; });
    if (existing) {
      var ok = await confirmAsync('予約重複',
        'この患者さんには ' + existing.appointmentDate + ' の予約があります。\n新しい日付に変更しますか？');
      if (!ok) return;
      // 既存予約をキャンセル
      await cancelAppointment(existing.id);
    }

    var appointment = {
      patientId: pid,
      appointmentDate: date,
      medicationDays: days ? Number(days.value) || 0 : 0,
      medicationNote: memo ? memo.value.trim() : '',
      status: 'scheduled',
      createdAt: new Date().toISOString()
    };

    await putAppointment(appointment);
    toast('予約を作成しました: ' + date + ' ' + (appointment.medicationDays ? '(' + appointment.medicationDays + '日分)' : ''));
    hideModal('appt-detail');
    renderCalendar(_calYear, _calMonth);
  } catch (e) {
    console.error('handleCalendarCreateAppointment error:', e);
    toast('予約作成エラー: ' + e.message);
  }
}

// ── デモデータ ──

async function initDemoData() {
  var ok = await confirmAsync('デモデータ投入',
    '患者DEMO-001〜003、カレンダー用の日付設定・予約データを作成します。\n続行しますか？');
  if (!ok) return;

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var pad2 = function(n) { return String(n).padStart(2, '0'); };
  var fmtYMD = function(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  };

  function addDays(d, n) {
    var r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  try {
    // ---- Patients ----
    var demoPats = [
      { id: 'DEMO-001', name: '山田太郎', gender: '男', birthDate: '1965-03-15', memo: '高血圧' },
      { id: 'DEMO-002', name: '鈴木花子', gender: '女', birthDate: '1978-07-22', memo: '経過観察' },
      { id: 'DEMO-003', name: '佐藤健一', gender: '男', birthDate: '1955-11-08', memo: '糖尿病合併' }
    ];
    for (var pi = 0; pi < demoPats.length; pi++) {
      await putPatient(demoPats[pi]);
    }

    // ---- DaySettings ----
    var dsList = [
      { offset: 1,  flags: { isHoliday: false, isBusinessTrip: false, isLimited: false, isClosed: false }, busyLevel: 1, note: '混雑見込み' },
      { offset: 3,  flags: { isHoliday: false, isBusinessTrip: false, isLimited: true, isClosed: false }, busyLevel: 2, note: '激混み＋予約制限' },
      { offset: 5,  flags: { isHoliday: false, isBusinessTrip: true, isLimited: false, isClosed: false }, busyLevel: 0, note: '午後出張' },
      { offset: 7,  flags: { isHoliday: false, isBusinessTrip: false, isLimited: false, isClosed: true }, busyLevel: 0, note: '休診日' },
      { offset: 10, flags: { isHoliday: false, isBusinessTrip: false, isLimited: false, isClosed: false }, busyLevel: -1, note: '空き' },
      { offset: 14, flags: { isHoliday: false, isBusinessTrip: false, isLimited: false, isClosed: false }, busyLevel: 2, note: '混雑予想' },
      { offset: 21, flags: { isHoliday: false, isBusinessTrip: true, isLimited: false, isClosed: false }, busyLevel: 0, note: '終日出張' },
      { offset: 28, flags: { isHoliday: false, isBusinessTrip: false, isLimited: true, isClosed: false }, busyLevel: 1, note: '午前制限' },
    ];

    // 来月もいくつか設定
    var nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    var nmDsList = [
      { offset: 5,  flags: { isHoliday: false, isBusinessTrip: false, isLimited: false, isClosed: false }, busyLevel: -1, note: '空き' },
      { offset: 10, flags: { isHoliday: false, isBusinessTrip: true, isLimited: false, isClosed: false }, busyLevel: 0, note: '出張' },
      { offset: 15, flags: { isHoliday: false, isBusinessTrip: false, isLimited: true, isClosed: false }, busyLevel: 2, note: '激混み' },
      { offset: 20, flags: { isHoliday: false, isBusinessTrip: false, isLimited: false, isClosed: true }, busyLevel: 0, note: '休診' },
    ];

    for (var di = 0; di < dsList.length; di++) {
      var d = addDays(today, dsList[di].offset);
      await putDaySetting({
        date: fmtYMD(d),
        flags: dsList[di].flags,
        busyLevel: dsList[di].busyLevel,
        note: dsList[di].note,
        isManual: true
      });
    }
    for (var di = 0; di < nmDsList.length; di++) {
      var d = addDays(nextMonth, nmDsList[di].offset);
      await putDaySetting({
        date: fmtYMD(d),
        flags: nmDsList[di].flags,
        busyLevel: nmDsList[di].busyLevel,
        note: nmDsList[di].note,
        isManual: true
      });
    }

    // ---- Appointments ----
    var apptData = [
      { pid: 'DEMO-001', offset: -7,  days: 28, note: '定期処方', status: 'done' },
      { pid: 'DEMO-002', offset: -14, days: 14, note: '経過観察', status: 'done' },
      { pid: 'DEMO-001', offset: 3,   days: 28, note: '定期処方', status: 'scheduled' },
      { pid: 'DEMO-002', offset: 7,   days: 14, note: '経過観察', status: 'scheduled' },
      { pid: 'DEMO-003', offset: 14,  days: 30, note: '糖尿病定期', status: 'scheduled' },
    ];

    for (var ai = 0; ai < apptData.length; ai++) {
      var ap = apptData[ai];
      var ad = addDays(today, ap.offset);
      var now = new Date();
      await putAppointment({
        patientId: ap.pid,
        appointmentDate: fmtYMD(ad),
        medicationDays: ap.days,
        medicationNote: ap.note,
        status: ap.status,
        createdAt: now.toISOString()
      });
    }

    toast('デモデータを投入しました: 患者3件, 日付設定12件, 予約5件');
  } catch (e) {
    console.error('initDemoData error:', e);
    toast('デモデータ投入エラー: ' + e.message);
  }
}

async function exportAppointmentsCSV() {
  var appointments = await getAllAppointments();
  if (appointments.length === 0) { toast('予約データがありません'); return; }

  // 患者名を一括取得
  var nameCache = {};
  for (var i = 0; i < appointments.length; i++) {
    var pid = appointments[i].patientId;
    if (!nameCache[pid]) {
      try {
        var p = await getPatient(pid);
        nameCache[pid] = p ? p.name : pid;
      } catch (e) { nameCache[pid] = pid; }
    }
  }

  var csv = '\ufeff予約日,患者ID,患者氏名,処方日数,処方メモ,ステータス\n';
  appointments.sort(function(a, b) { return a.appointmentDate.localeCompare(b.appointmentDate); });
  for (var i = 0; i < appointments.length; i++) {
    var a = appointments[i];
    var name = (nameCache[a.patientId] || a.patientId).replace(/"/g, '""');
    csv += a.appointmentDate + ',' +
      a.patientId + ',"' + name + '",' +
      (a.medicationDays || 0) + ',"' + (a.medicationNote || '').replace(/"/g, '""') + '",' +
      (a.status || 'scheduled') + '\n';
  }
  var today = fmtDate(new Date());
  downloadFile(csv, 'appointments_' + today + '.csv');
  toast('予約CSV出力完了');
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
    if (data && (Array.isArray(data.patients) || Array.isArray(data.readings) || Array.isArray(data.appointments))) return data;
    return null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════
//  EMR AUTO-FOLLOW
// ═══════════════════════════════════════════════════════════

var _emrLastId = null;
var _emrPollTimer = null;
var _emrConnected = false;

function startEmrFollow() {
  pollEmr();
}

async function pollEmr() {
  try {
    var resp = await fetch('emr-patient.json?t=' + Date.now());
    if (!resp.ok) {
      updateEmrStatus(false);
      _emrPollTimer = setTimeout(pollEmr, 1500);
      return;
    }
    var data = await resp.json();
    if (!data || !data.patientId) {
      updateEmrStatus(false);
      _emrPollTimer = setTimeout(pollEmr, 1500);
      return;
    }
    updateEmrStatus(true);
    var id = String(data.patientId).trim();
    if (id && id !== _emrLastId) {
      _emrLastId = id;
      navigateToPatientAuto(id);
    }
  } catch (e) {
    updateEmrStatus(false);
  }
  _emrPollTimer = setTimeout(pollEmr, 1500);
}

async function navigateToPatientAuto(id) {
  if (!/^\d{8}$/.test(id)) {
    toast('EMR患者IDの形式が不正です: ' + id);
    return;
  }
  try {
    var patient = await getPatient(id);
    if (!patient) {
      await putPatient({
        id: id,
        name: '',
        gender: '',
        birthDate: '',
        memo: '（EMR連携 自動作成）',
        createdAt: new Date().toISOString()
      });
    }
    currentPatientId = id;
    currentView = 'all';
    showScreen('patient');
    await renderPatientPage();
    toast('EMR連携: 患者 ' + id + ' を開きました');
  } catch (e) {
    console.error('navigateToPatientAuto error:', e);
  }
}

function updateEmrStatus(connected) {
  var ids = ['emr-status', 'emr-status-patient', 'emr-status-calendar'];
  var text = connected ? '● EMR連携中' : '○ EMR未接続';
  var cls = connected ? 'emr-status connected' : 'emr-status disconnected';
  for (var i = 0; i < ids.length; i++) {
    var el = $(ids[i]);
    if (el) { el.textContent = text; el.className = cls; }
  }
  _emrConnected = connected;
}