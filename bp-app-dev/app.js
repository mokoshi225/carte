/* =================================================================
   app.js — メインアプリケーションロジック v3.0.0
   初期化・イベント配線・画面遷移・ビジネスロジック
   ================================================================= */

BPApp.App = (function () {

  /* ═══════════════════════════════════════════════════════
      DB オープン（delegates to db.js openDB）
     ═══════════════════════════════════════════════════════ */

  function openDBSync() {
    return openDB();
  }

  /* ═══════════════════════════════════════════════════════
      INIT
     ═══════════════════════════════════════════════════════ */

  async function init() {
    // Open DB
    try { await openDBSync(); } catch (e) { alert('DB open failed: ' + e.message); return; }

    // Event: ID input
    var inpId = $('inp-patient-id');
    if (inpId) inpId.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); handleIdEnter(); }
    });
    var btnStart = $('btn-id-enter');
    if (btnStart) btnStart.addEventListener('click', handleIdEnter);

    // Event: View tabs
    var vAll = $('view-all'), vPaste = $('view-paste');
    if (vAll) vAll.addEventListener('click', function () { currentView = 'all'; if (currentPatientId) renderView(); });
    if (vPaste) vPaste.addEventListener('click', function () { currentView = 'paste'; if (currentPatientId) renderView(); });

    // Event: Back to top
    var bb = $('btn-back');
    if (bb) bb.addEventListener('click', goBack);

    // Event: Patient select
    var sel = $('sel-patient');
    if (sel) sel.addEventListener('change', function () {
      currentPatientId = sel.value;
      if (currentPatientId) renderPatientPage();
    });

    // Event: Registration
    var btnReg = $('btn-register');
    if (btnReg) btnReg.addEventListener('click', registerReading);

    // Event: EMR copy
    var btnEmr = $('btn-emr-copy');
    if (btnEmr) btnEmr.addEventListener('click', generateEMRText);

    var inpDbp = $('inp-dbp');
    if (inpDbp) inpDbp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var w = $('inp-weight'); if (w) w.focus(); }
    });
    var inpWeight = $('inp-weight');
    if (inpWeight) inpWeight.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var m = $('inp-memo'); if (m) m.focus(); }
    });
    var inpMemo = $('inp-memo');
    if (inpMemo) inpMemo.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); registerReading(); }
    });
    var inpDate = $('inp-date');
    if (inpDate) inpDate.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var s = $('inp-sbp'); if (s) s.focus(); }
    });
    var inpSbp = $('inp-sbp');
    if (inpSbp) inpSbp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var d = $('inp-dbp'); if (d) d.focus(); }
    });

    // Event: 受診時血圧表示トグル
    var chkVisit = $('chk-show-visit');
    if (chkVisit) chkVisit.addEventListener('change', function () {
      if (currentPatientId && currentView === 'all') renderView();
    });

    // Event: 基準線トグル
    ['chk-threshold-12575', 'chk-threshold-13585'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', function () {
        if (currentPatientId && currentView === 'all') renderView();
      });
    });

    // Event: Resize
    window.addEventListener('resize', function () {
      if (currentPatientId && currentView === 'all') renderView();
    });

    // Event: Paste view
    var btnParse = $('btn-parse-visit');
    if (btnParse) btnParse.addEventListener('click', handleParseVisit);
    var btnSaveVisit = $('btn-save-visit');
    if (btnSaveVisit) btnSaveVisit.addEventListener('click', handleSaveVisit);

    // Event: Global Enter in memo field
    document.addEventListener('keydown', function (e) {
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
    if (mCancel) mCancel.addEventListener('click', function () { hideModal('new-patient'); });

    var cYes = $('confirm-yes'), cNo = $('confirm-no');
    if (cYes) cYes.addEventListener('click', function () { handleConfirm(true); });
    if (cNo) cNo.addEventListener('click', function () { handleConfirm(false); });

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
    if (vCal) vCal.addEventListener('click', function () { currentView = 'calendar'; if (currentPatientId) renderView(); });
    var calPrev = $('cal-prev');
    if (calPrev) calPrev.addEventListener('click', function () { calNavigate(-1); });
    var calNext = $('cal-next');
    if (calNext) calNext.addEventListener('click', function () { calNavigate(1); });
    var calToday = $('cal-today');
    if (calToday) calToday.addEventListener('click', function () { openCalendar(); });
    var calBack = $('cal-back');
    if (calBack) calBack.addEventListener('click', closeCalendar);
    var calDetailClose = $('appt-detail-close');
    if (calDetailClose) calDetailClose.addEventListener('click', function () { hideModal('appt-detail'); });
    var btnExportAppt = $('btn-export-appt-csv');
    if (btnExportAppt) btnExportAppt.addEventListener('click', exportAppointmentsCSV);

    // Event: Medication
    var btnAddMed = $('btn-add-medication');
    if (btnAddMed) btnAddMed.addEventListener('click', handleAddMedication);

    // Enter key in medication fields saves
    ['med-drug-name', 'med-dosage', 'med-start-date', 'med-end-date'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); handleAddMedication(); }
      });
    });

    // Event: Summary update
    var btnUpdSum = $('btn-update-summary');
    if (btnUpdSum) btnUpdSum.addEventListener('click', handleUpdateSummary);

    var summaryTa = $('inp-summary-current');
    if (summaryTa) summaryTa.addEventListener('input', function () { autoResizeTextarea(this); });

    // Event: SOAP copy
    var btnCopySoap = $('btn-copy-soap');
    if (btnCopySoap) btnCopySoap.addEventListener('click', copySoapOutput);

    // Event: Demo data
    var btnDemo = $('btn-demo-data');
    if (btnDemo) btnDemo.addEventListener('click', initDemoData);

    // Event: Excel Import
    var btnExcelImport = $('btn-excel-import');
    if (btnExcelImport) btnExcelImport.addEventListener('click', openExcelImport);
    var btnExcelPreview = $('btn-excel-preview');
    if (btnExcelPreview) btnExcelPreview.addEventListener('click', handleExcelPreview);
    var btnExcelCommit = $('btn-excel-commit');
    if (btnExcelCommit) btnExcelCommit.addEventListener('click', handleExcelCommit);
    var btnExcelClose = $('excel-import-close');
    if (btnExcelClose) btnExcelClose.addEventListener('click', closeExcelImport);

    // Event: EMR Match modal
    var btnEmrMatchConfirm = $('emr-match-confirm');
    if (btnEmrMatchConfirm) btnEmrMatchConfirm.addEventListener('click', handleEmrMatchConfirm);
    var btnEmrMatchSkip = $('emr-match-skip');
    if (btnEmrMatchSkip) btnEmrMatchSkip.addEventListener('click', handleEmrMatchSkip);

    // Event: Data Cleanup
    var btnCleanup = $('btn-data-cleanup');
    if (btnCleanup) btnCleanup.addEventListener('click', openDataCleanup);
    var btnCleanupBack = $('btn-cleanup-back');
    if (btnCleanupBack) btnCleanupBack.addEventListener('click', closeCleanup);
    var btnCleanupRefresh = $('btn-cleanup-refresh');
    if (btnCleanupRefresh) btnCleanupRefresh.addEventListener('click', runCleanupCheck);

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

    // Version info
    $('header-info').textContent = 'v3.3.1 | ' + new Date().toLocaleDateString('ja-JP');
    $('app-version').textContent = '3.3.1';
    $('app-build-date').textContent = new Date().toLocaleDateString('ja-JP');
    $('app-version-footer').textContent = '3.3.1';

    var emrBtns = ['emr-btn-id', 'emr-btn-patient', 'emr-btn-calendar'];
    for (var i = 0; i < emrBtns.length; i++) {
      var btn = $(emrBtns[i]);
      if (btn) btn.addEventListener('click', readEmrPatient);
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ═══════════════════════════════════════════════════════
      ID INPUT
     ═══════════════════════════════════════════════════════ */

  async function initIdScreen() {
    try {
      var readings = await getAllReadings();
      if (readings.length > 0) {
        readings.sort(function (a, b) { return b.date.localeCompare(a.date); });
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
      var latest = readings.reduce(function (a, b) { return a.date > b.date ? a : b; }, null);
      entries.push({ patient: p, latest: latest ? latest.date : '' });
    }
    entries.sort(function (a, b) { return (b.latest || '').localeCompare(a.latest || ''); });

    var div = $('recent-patients');
    if (!div) return;
    if (entries.length === 0) {
      div.innerHTML = '<span style="color:#bdc3c7">まだ患者が登録されていません</span>';
      return;
    }
    div.innerHTML = entries.map(function (e) {
      return '<div style="padding:5px 0;cursor:pointer;border-bottom:1px solid #f0f0f0" data-pid="' + e.patient.id + '">' +
        '<strong>' + esc(e.patient.id) + '</strong> ' + esc(e.patient.name) +
        '<span style="color:#95a5a6;margin-left:8px;font-size:.82em">' + (e.latest || 'データなし') + '</span></div>';
    }).join('');

    div.querySelectorAll('[data-pid]').forEach(function (el) {
      el.addEventListener('click', function () { navigateToPatient(el.dataset.pid); });
    });
  }

  async function handleIdEnter() {
    var inp = $('inp-patient-id');
    if (!inp) return;
    var id = inp.value.trim();
    if (!id) { toast('患者IDを入力してください'); return; }
    await navigateToPatient(id);
  }

  /* ═══════════════════════════════════════════════════════
      NAVIGATION
     ═══════════════════════════════════════════════════════ */

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
        setTimeout(function () { el = $('modal-name'); if (el) el.focus(); }, 100);
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

  /* ═══════════════════════════════════════════════════════
      NEW PATIENT MODAL
     ═══════════════════════════════════════════════════════ */

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

  /* ═══════════════════════════════════════════════════════
      CONFIRM MODAL
     ═══════════════════════════════════════════════════════ */

  function confirmAsync(title, body) {
    return new Promise(function (resolve) {
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

  /* ═══════════════════════════════════════════════════════
      PATIENT PAGE
     ═══════════════════════════════════════════════════════ */

  async function renderPatientPage() {
    showScreen('patient');
    try {
      var patient = await getPatient(currentPatientId);
      var name = patient ? patient.name : currentPatientId;
      var el = $('patient-header-info'); if (el) el.textContent = currentPatientId + ' ' + name;
      renderNav();
      renderView();
      var inpDate = $('inp-date');
      if (inpDate && !inpDate.value) {
        inpDate.value = fmtDate(new Date());
      }
      await renderAppointmentSection();
      await renderMedicationSection();
      await renderAssessmentSection();
      updateSoapOutput();
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

  function setViewTabs() {
    var a = $('view-all'), p = $('view-paste'), c = $('view-calendar');
    if (a) a.classList.toggle('active', currentView === 'all');
    if (p) p.classList.toggle('active', currentView === 'paste');
    if (c) c.classList.toggle('active', currentView === 'calendar');
  }

  /* ─── ALL PERIOD VIEW ─── */

  async function renderAllPeriodView() {
    setViewTabs();

    try {
      var readings = await getReadingsByPatient(currentPatientId);
      readings.sort(function (a, b) { return a.date.localeCompare(b.date); });
      var medications = await getMedicationsByPatient(currentPatientId);
      var canvas = $('graph');
      if (canvas) { drawAllPeriodGraph(canvas, readings, medications); setupTooltip(canvas); }
    } catch (e) { console.error('renderAllPeriodView:', e); }

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
      legendEl.innerHTML = items.filter(function (i) { return i.show; }).map(function (i) {
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
      body.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#95a5a6;padding:20px">データがありません</td></tr>';
      return;
    }
    readings.sort(function (a, b) { return b.date.localeCompare(a.date); });
    var html = '';
    for (var i = 0; i < readings.length; i++) {
      var r = readings[i];
      function n(v) { return v > 0 ? v : '-'; }
      function w(v) { return v > 0 ? v : '-'; }
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
        '<td class="bp-val">' + w(r.weight) + '</td>' +
        '<td style="text-align:right;white-space:nowrap">' +
        '<button class="btn btn-sm btn-secondary" data-edit="' + r.id + '">編集</button> ' +
        '<button class="btn btn-sm btn-danger" data-del="' + r.id + '">削除</button>' +
        '</td></tr>';
    }
    body.innerHTML = html;

    body.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { editReading(Number(this.dataset.edit)); });
    });
    body.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteReadingConfirm(Number(this.dataset.del)); });
    });
  }

  /* ── Nav ── */

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

  /* ═══════════════════════════════════════════════════════
      REGISTRATION
     ═══════════════════════════════════════════════════════ */

  async function registerReading() {
    var d = $('inp-date'), sb = $('inp-sbp'), db = $('inp-dbp');
    var as = $('inp-avg-sbp'), ad = $('inp-avg-dbp');
    var ns = $('inp-min-sbp'), nd = $('inp-min-dbp');
    var xs = $('inp-max-sbp'), xd = $('inp-max-dbp');
    var wt = $('inp-weight');
    var m = $('inp-memo');
    if (!d || !sb || !db) return;
    var date = d.value, sbp = Number(sb.value), dbp = Number(db.value);
    var weight = wt ? Number(wt.value) : 0;
    var memo = m ? m.value.trim() : '';
    if (!date) { toast('日付は必須です'); return; }
    if (sbp > 0 && (sbp < 50 || sbp > 300)) { toast('収縮期血圧の範囲が不正です'); return; }
    if (dbp > 0 && (dbp < 30 || dbp > 200)) { toast('拡張期血圧の範囲が不正です'); return; }

    var subjEl = $('inp-subjective');

    var reading = {
      patientId: currentPatientId, date: date,
      systolic: sbp || 0, diastolic: dbp || 0,
      meanArterial: sbp && dbp ? Math.round((sbp + dbp * 2) / 3) : 0,
      note: memo,
      subjective: subjEl ? subjEl.value.trim() : '',
      avgSbp: Number(as ? as.value : 0) || 0,
      avgDbp: Number(ad ? ad.value : 0) || 0,
      minSbp: Number(ns ? ns.value : 0) || 0,
      minDbp: Number(nd ? nd.value : 0) || 0,
      maxSbp: Number(xs ? xs.value : 0) || 0,
      maxDbp: Number(xd ? xd.value : 0) || 0,
      weight: weight || 0
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
        var apptToday = apptsOnDate.find(function (a) {
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

      if (sb) sb.value = '';
      if (db) db.value = '';
      if (as) as.value = ''; if (ad) ad.value = '';
      if (ns) ns.value = ''; if (nd) nd.value = '';
      if (xs) xs.value = ''; if (xd) xd.value = '';
      if (wt) wt.value = '';
      if (m) m.value = '';
      editingId = null;
      var rs = $('register-status'); if (rs) rs.textContent = '';
      if (sb) sb.focus();
      renderView();
      updateSoapOutput();
    } catch (e) {
      console.error('registerReading error:', e);
      toast('登録エラー: ' + e.message);
    }
  }

  /* ═══════════════════════════════════════════════════════
      EDIT / DELETE
     ═══════════════════════════════════════════════════════ */

  async function editReading(id) {
    try {
      var readings = await getReadingsByPatient(currentPatientId);
      var r = readings.find(function (x) { return x.id === id; });
      if (!r) return;
      editingId = id;
      var d = $('inp-date'), sb = $('inp-sbp'), db = $('inp-dbp'), m = $('inp-memo');
      var as = $('inp-avg-sbp'), ad = $('inp-avg-dbp');
      var ns = $('inp-min-sbp'), nd = $('inp-min-dbp');
      var xs = $('inp-max-sbp'), xd = $('inp-max-dbp');
      var sj = $('inp-subjective');
      var wt = $('inp-weight');
      if (d) d.value = r.date;
      if (sb) sb.value = r.systolic || '';
      if (db) db.value = r.diastolic || '';
      if (as) as.value = r.avgSbp || '';
      if (ad) ad.value = r.avgDbp || '';
      if (ns) ns.value = r.minSbp || '';
      if (nd) nd.value = r.minDbp || '';
      if (xs) xs.value = r.maxSbp || '';
      if (xd) xd.value = r.maxDbp || '';
      if (wt) wt.value = r.weight || '';
      if (m) m.value = r.note || '';
      if (sj) sj.value = r.subjective || '';
      var rs = $('register-status'); if (rs) rs.textContent = '📝 編集中';
      if (sb) { sb.focus(); sb.select(); sb.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    } catch (e) { console.error('editReading:', e); }
  }

  function deleteReadingConfirm(id) {
    confirmAsync('削除確認', 'この測定データを削除しますか？').then(function (ok) {
      if (!ok) return;
      deleteReading(id).then(function () {
        toast('データを削除しました');
        renderView();
      }).catch(function (e) { console.error(e); });
    });
  }

  /* ═══════════════════════════════════════════════════════
      DATA MANAGEMENT
     ═══════════════════════════════════════════════════════ */

  async function exportCSV() {
    var readings = await getReadingsByPatient(currentPatientId);
    var patient = await getPatient(currentPatientId);
    if (readings.length === 0) { toast('データがありません'); return; }
    readings.sort(function (a, b) { return a.date.localeCompare(b.date); });
    var csv = '\ufeff患者ID,患者氏名,測定日,受診SBP,受診DBP,家庭SBP平均,家庭DBP平均,家庭SBP最小,家庭DBP最小,家庭SBP最大,家庭DBP最大,体重,メモ\n';
    for (var i = 0; i < readings.length; i++) {
      var r = readings[i];
      var name = patient ? patient.name.replace(/"/g, '""') : '';
      csv += currentPatientId + ',"' + name + '",' + r.date + ',' +
        (r.systolic || 0) + ',' + (r.diastolic || 0) + ',' +
        (r.avgSbp || 0) + ',' + (r.avgDbp || 0) + ',' +
        (r.minSbp || 0) + ',' + (r.minDbp || 0) + ',' +
        (r.maxSbp || 0) + ',' + (r.maxDbp || 0) + ',' +
        (r.weight || 0) + ',' +
        '"' + (r.note || '').replace(/"/g, '""') + '"\n';
    }
    // 降圧薬データを追記
    var meds = await getMedicationsByPatient(currentPatientId);
    if (meds && meds.length > 0) {
      csv += '\n降圧薬\n';
      csv += '薬剤名,用量,単位,タイミング,開始日,中止日\n';
      meds.sort(function (a, b) { return a.startDate.localeCompare(b.startDate); });
      for (var mi = 0; mi < meds.length; mi++) {
        var m = meds[mi];
        csv += '"' + (m.drugName || '').replace(/"/g, '""') + '",' +
          (m.dosage || 0) + ',' +
          (m.dosageUnit || 'mg') + ',' +
          '"' + (m.timing || '').replace(/"/g, '""') + '",' +
          (m.startDate || '') + ',' +
          (m.endDate || '') + '\n';
      }
    }
    var today = fmtDate(new Date());
    downloadFile(csv, 'bp_' + currentPatientId + '_' + today + '.csv');
    toast('CSVエクスポート完了');
  }

  function handleImportCSV() {
    var fi = $('file-import'); if (!fi) return;
    fi.value = ''; fi.accept = '.csv';
    fi.onchange = function (e) {
      var file = e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = async function (evt) {
        var text = evt.target.result;
        var records = parseCSV(text);
        if (records.length === 0) { toast('CSVデータがありません'); return; }
        var imported = 0, skipped = 0;
        for (var idx = 0; idx < records.length; idx++) {
          (function (rec, lastIdx) {
            (async function () {
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
    var medications = await getAllMedications();
    downloadFile(backupToJSON({ patients: patients, readings: readings, appointments: appointments, medications: medications }),
      'bp_backup_' + fmtDate(new Date()) + '.json', 'application/json');
    toast('バックアップ完了');
  }

  function handleRestore() {
    var fi = $('file-import'); if (!fi) return;
    fi.value = ''; fi.accept = '.json';
    fi.onchange = function (e) {
      var file = e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = async function (evt) {
        try {
          var data = parseBackupJSON(evt.target.result);
          if (!data) { toast('無効なバックアップファイル'); return; }
          var ok = await confirmAsync('復元確認', '全データをバックアップから復元します。既存データは上書きされます。');
          if (!ok) return;
          if (data.patients) for (var i = 0; i < data.patients.length; i++) await putPatient(data.patients[i]);
          if (data.readings) for (var j = 0; j < data.readings.length; j++) await putReading(data.readings[j]);
          if (data.appointments) for (var k = 0; k < data.appointments.length; k++) await putAppointment(data.appointments[k]);
          if (data.medications) for (var l = 0; l < data.medications.length; l++) await putMedication(data.medications[l]);
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

  function updateDataStat() {
    var stat = $('data-stat'); if (!stat) return;
    getReadingsByPatient(currentPatientId).then(function (r) {
      stat.textContent = 'データ: ' + r.length + '件 | 最終更新: ' + new Date().toLocaleString('ja-JP');
    });
  }

  /* ═══════════════════════════════════════════════════════
      EMR TEXT GENERATION
     ═══════════════════════════════════════════════════════ */

  function generateEMRText() {
    var d = $('inp-date'), sb = $('inp-sbp'), db = $('inp-dbp');
    var as = $('inp-avg-sbp'), ad = $('inp-avg-dbp');
    var ns = $('inp-min-sbp'), nd = $('inp-min-dbp');
    var xs = $('inp-max-sbp'), xd = $('inp-max-dbp');
    var wt = $('inp-weight');
    if (!d) { toast('日付が入力されていません'); return; }
    var date = d.value;
    if (!date) { toast('日付が入力されていません'); return; }

    var parts = date.split('-');
    var dateStr = parts.join('/');

    function v(el) { return el && el.value && Number(el.value) > 0 ? el.value : '-'; }
    function bpPair(s, d) {
      var sv = v(s), dv = v(d);
      return sv + '/' + dv;
    }

    var clinicBP = bpPair(sb, db);
    var homeAvg = '家庭' + bpPair(as, ad);
    var homeMin = bpPair(ns, nd);
    var homeMax = bpPair(xs, xd);
    var homeRange = homeMin + '-' + homeMax;
    var weight = v(wt);

    var line1 = dateStr;
    var line2 = clinicBP + ',' + homeAvg + ',' + homeRange + ',' + weight;

    var text = line1 + '\n' + line2;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('所見をクリップボードにコピーしました');
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('所見をクリップボードにコピーしました');
    } catch (e) {
      toast('コピーに失敗しました。手動でコピーしてください。\n' + text);
    }
    document.body.removeChild(ta);
  }

  /* ═══════════════════════════════════════════════════════
      EMR MANUAL READ (button-triggered, no auto-polling)
     ═══════════════════════════════════════════════════════ */

  function readEmrPatient() {
    var old = document.getElementById('emr-script');
    if (old) old.parentNode.removeChild(old);

    var s = document.createElement('script');
    s.id = 'emr-script';
    s.src = 'emr-patient.js?t=' + Date.now();
    s.onload = function () {
      var data = window.EMR_PATIENT;
      if (data && data.patientId) {
        updateEmrStatus(true);
        var id = String(data.patientId).trim();
        var name = data.patientName || '';
        navigateToPatientAuto(id, name);
      } else {
        updateEmrStatus(false);
        toast('EMRデータが見つかりません');
      }
    };
    s.onerror = function () {
      updateEmrStatus(false);
      toast('EMR接続エラー（emr-watcherが起動していません）');
    };
    document.body.appendChild(s);
  }

  async function navigateToPatientAuto(id, name) {
    if (!/^\d{8}$/.test(id)) {
      toast('EMR患者IDの形式が不正です: ' + id);
      return;
    }
    try {
      var patient = await getPatient(id);
      if (!patient) {
        await putPatient({
          id: id,
          name: name || '',
          gender: '',
          birthDate: '',
          memo: '（EMR連携 自動作成）',
          createdAt: new Date().toISOString()
        });
        patient = await getPatient(id);
      }

      // Check for matching Excel-imported patients
      var patName = patient.name || name || '';
      if (patName) {
        try {
          var excelPats = await getPatientsBySource('excel');
          var matches = [];
          for (var i = 0; i < excelPats.length; i++) {
            var score = _matchScore(patName, excelPats[i].name);
            if (score >= 70) {
              var appts = await getAppointmentsByPatient(excelPats[i].id);
              matches.push({ patient: excelPats[i], score: score, apptCount: appts.length });
            }
          }
          if (matches.length > 0) {
            matches.sort(function (a, b) { return b.score - a.score; });
            _emrMatchState = { excelPatients: matches, emrId: id, emrName: patName };
            showEmrMatchModal(matches, id, patName);
            return; // Wait for user decision in modal
          }
        } catch (e2) {
          console.error('Excel matching check error:', e2);
        }
      }

      _finishEmrNavigation(id, name);
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

  /* ═══════════════════════════════════════════════════════
      EXCEL IMPORT — helpers
     ═══════════════════════════════════════════════════════ */

  var _emrMatchState = null;

  function _excelPatientId(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash |= 0;
    }
    return '_x_' + Math.abs(hash).toString(36).padStart(6, '0');
  }

  function _normalizeNameForMatch(name) {
    return (name || '').replace(/[\s　]/g, '');
  }

  function _levenshtein(a, b) {
    var m = [], i, j;
    for (i = 0; i <= b.length; i++) m[i] = [i];
    for (j = 0; j <= a.length; j++) m[0][j] = j;
    for (i = 1; i <= b.length; i++) {
      for (j = 1; j <= a.length; j++) {
        m[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
          ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j - 1] + 1, Math.min(m[i][j - 1] + 1, m[i - 1][j] + 1));
      }
    }
    return m[b.length][a.length];
  }

  function _matchScore(name1, name2) {
    var n1 = _normalizeNameForMatch(name1);
    var n2 = _normalizeNameForMatch(name2);
    if (!n1 || !n2) return 0;
    if (n1 === n2) return 100;
    if (n1.indexOf(n2) !== -1 || n2.indexOf(n1) !== -1) return 85;
    var dist = _levenshtein(n1, n2);
    if (dist <= 1) return 90;
    if (dist <= 2) return 75;
    return 0;
  }

  /* ═══════════════════════════════════════════════════════
      EXCEL IMPORT — TSV Parser
     ═══════════════════════════════════════════════════════ */

  function _parseDateFlexible(str) {
    // YYYY-MM-DD or YYYY/MM/DD
    var m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) {
      var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
      if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      }
    }
    // M/D/YYYY or M/D
    m = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (m) {
      var mo = parseInt(m[1], 10), d = parseInt(m[2], 10);
      var y = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
      if (y < 100) y += 2000;
      if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      }
    }
    return null;
  }

  function parseExcelTSV(text) {
    if (!text || !text.trim()) return null;
    var lines = text.split(/\r?\n/);
    var rows = [];
    var nameSet = {};

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (/^日数/.test(line)) continue; // skip header

      var cols = line.split('\t');
      if (cols.length < 4) continue;

      var dateStr = cols[1].trim();
      var date = _parseDateFlexible(dateStr);
      if (!date) continue;

      var names = [];
      for (var j = 3; j < cols.length; j++) {
        var name = cols[j].trim();
        if (name) names.push(name);
      }
      if (names.length === 0) continue;

      for (var k = 0; k < names.length; k++) nameSet[names[k]] = true;
      rows.push({ date: date, names: names });
    }

    if (rows.length === 0) return null;

    var uniqueNames = Object.keys(nameSet);
    var patients = [];
    var patientMap = {};
    for (var i = 0; i < uniqueNames.length; i++) {
      var pid = _excelPatientId(uniqueNames[i]);
      patients.push({ id: pid, name: uniqueNames[i] });
      patientMap[uniqueNames[i]] = pid;
    }

    var appointments = [];
    for (var i = 0; i < rows.length; i++) {
      for (var k = 0; k < rows[i].names.length; k++) {
        var name = rows[i].names[k];
        appointments.push({
          date: rows[i].date,
          patientId: patientMap[name],
          patientName: name
        });
      }
    }

    return { patients: patients, appointments: appointments, rows: rows.length };
  }

  /* ═══════════════════════════════════════════════════════
      EXCEL IMPORT — UI
     ═══════════════════════════════════════════════════════ */

  function openExcelImport() {
    _excelImportData = null;
    var ta = $('inp-excel-tsv');
    if (ta) ta.value = '';
    var preview = $('excel-preview-area');
    if (preview) preview.style.display = 'none';
    var status = $('excel-parse-status');
    if (status) status.textContent = '';
    var commitStatus = $('excel-commit-status');
    if (commitStatus) commitStatus.textContent = '';
    showModal('excel-import');
    setTimeout(function () { if (ta) ta.focus(); }, 100);
  }

  function closeExcelImport() {
    hideModal('excel-import');
  }

  function renderExcelPreview(parsed) {
    var body = $('excel-preview-body');
    var preview = $('excel-preview-area');
    var summary = $('excel-preview-summary');
    var status = $('excel-parse-status');
    if (!body || !preview) return;

    var appts = parsed.appointments.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });

    var html = '';
    for (var i = 0; i < appts.length; i++) {
      html += '<tr><td>' + esc(appts[i].date) + '</td><td>' + esc(appts[i].patientName) + '</td></tr>';
    }
    body.innerHTML = html;
    preview.style.display = '';

    if (status) status.textContent = parsed.appointments.length + '件のデータを検出';
    if (summary) {
      summary.textContent = '患者 ' + parsed.patients.length + '人、予約 ' + parsed.appointments.length + '件（' + parsed.rows + '日分）を取込予定';
    }
  }

  function handleExcelPreview() {
    var ta = $('inp-excel-tsv');
    if (!ta) return;
    var text = ta.value;
    if (!text.trim()) { toast('Excelデータを貼り付けてください'); return; }

    var parsed = parseExcelTSV(text);
    if (!parsed || parsed.appointments.length === 0) {
      toast('有効な予約データが見つかりませんでした');
      return;
    }

    _excelImportData = parsed;
    renderExcelPreview(parsed);
  }

  async function handleExcelCommit() {
    if (!_excelImportData) { toast('先にプレビューを実行してください'); return; }

    var commitStatus = $('excel-commit-status');
    if (commitStatus) commitStatus.textContent = '取込中...';

    try {
      var created = 0;
      for (var i = 0; i < _excelImportData.patients.length; i++) {
        var p = _excelImportData.patients[i];
        var existing = await getPatient(p.id);
        if (!existing) {
          await putPatient({
            id: p.id,
            name: p.name,
            source: 'excel',
            memo: '（Excel取込: 要EMRマッチング）',
            createdAt: new Date().toISOString()
          });
          created++;
        }
      }

      var apptCreated = 0, skipped = 0;
      for (var i = 0; i < _excelImportData.appointments.length; i++) {
        var a = _excelImportData.appointments[i];
        var existingApps = await getAppointmentsByDate(a.date);
        var dup = false;
        for (var j = 0; j < existingApps.length; j++) {
          if (existingApps[j].patientId === a.patientId && existingApps[j].status === 'scheduled') {
            dup = true;
            break;
          }
        }
        if (!dup) {
          await putAppointment({
            patientId: a.patientId,
            appointmentDate: a.date,
            status: 'scheduled',
            medicationDays: 0,
            medicationNote: '（Excel取込）',
            createdAt: new Date().toISOString()
          });
          apptCreated++;
        } else {
          skipped++;
        }
      }

      var msg = '取込完了: 患者' + created + '人（新規） / 予約' + apptCreated + '件登録';
      if (skipped > 0) msg += ' / ' + skipped + '件スキップ';
      if (commitStatus) commitStatus.textContent = '✅ ' + msg;
      toast(msg);
      _excelImportData = null;
    } catch (e) {
      console.error('handleExcelCommit error:', e);
      if (commitStatus) commitStatus.textContent = '❌ エラー: ' + e.message;
      toast('取込エラー: ' + e.message);
    }
  }

  /* ═══════════════════════════════════════════════════════
      EXCEL IMPORT — EMR Matching
     ═══════════════════════════════════════════════════════ */

  function showEmrMatchModal(matches, emrId, emrName) {
    var body = $('emr-match-body');
    if (!body) return;

    var html = '<p>EMRで読み込んだ患者 <strong>' + esc(emrId) + ' ' + esc(emrName) + '</strong> に、以下のExcel取込データがマッチしました。</p>';
    html += '<table class="summary-table" style="margin-top:12px"><thead><tr><th>Excelの名前</th><th>一致度</th><th>予約件数</th></tr></thead><tbody>';
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      html += '<tr><td>' + esc(m.patient.name) + '</td><td>' + m.score + '%</td><td>' + (m.apptCount || 0) + '件</td></tr>';
    }
    html += '</tbody></table>';
    html += '<p style="font-size:.82em;color:#7f8c8d;margin-top:8px">紐付けると、Excelからの予約がこの患者さんに移行されます。</p>';

    body.innerHTML = html;
    showModal('emr-match');
  }

  async function handleEmrMatchConfirm() {
    if (!_emrMatchState) return;
    var state = _emrMatchState;
    _emrMatchState = null;
    hideModal('emr-match');

    try {
      for (var i = 0; i < state.excelPatients.length; i++) {
        var ep = state.excelPatients[i].patient;
        await reassignPatientAppointments(ep.id, state.emrId);
        await deletePatient(ep.id);
      }
      toast('Excel取込データをEMR患者に紐付けました');
    } catch (e) {
      console.error('handleEmrMatchConfirm error:', e);
      toast('マッチングエラー: ' + e.message);
    }

    _finishEmrNavigation(state.emrId, state.emrName);
  }

  function handleEmrMatchSkip() {
    if (!_emrMatchState) return;
    var id = _emrMatchState.emrId;
    var name = _emrMatchState.emrName;
    _emrMatchState = null;
    hideModal('emr-match');
    _finishEmrNavigation(id, name);
  }

  function _finishEmrNavigation(id, name) {
    currentPatientId = id;
    currentView = 'all';
    showScreen('patient');
    renderPatientPage();
    var label = id;
    if (name) label += ' ' + name;
    toast('EMR連携: 患者 ' + label + ' を開きました');
  }

  /* ═══════════════════════════════════════════════════════
      APPOINTMENT
     ═══════════════════════════════════════════════════════ */

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
      var upcoming = await getUpcomingAppointment(currentPatientId);
      var appointment = {
        patientId: currentPatientId,
        appointmentDate: date,
        medicationDays: md ? Number(md.value) || 0 : 0,
        medicationNote: memo ? memo.value.trim() : '',
        status: 'scheduled',
        createdAt: upcoming ? upcoming.createdAt : new Date().toISOString()
      };

      var allPatientApps = await getAppointmentsByPatient(currentPatientId);
      var existingOnDate = allPatientApps.find(function (a) {
        return a.appointmentDate === date && a.status === 'scheduled';
      });
      if (existingOnDate) {
        appointment.id = existingOnDate.id;
      } else if (upcoming) {
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

  /* ═══════════════════════════════════════════════════════
      降圧薬
     ═══════════════════════════════════════════════════════ */

  var _editingMedId = null;

  async function renderMedicationSection() {
    var container = $('medication-list');
    if (!container) return;
    try {
      var meds = await getMedicationsByPatient(currentPatientId);
    } catch (e) { return; }
    if (!meds || meds.length === 0) {
      container.innerHTML = '<span style="color:#bdc3c7;font-size:.85em">登録された降圧薬はありません</span>';
      return;
    }
    // 開始日順にソート
    meds.sort(function (a, b) { return a.startDate.localeCompare(b.startDate); });

    var MED_COLORS = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
    function nameColor(name) {
      var hash = 0;
      for (var i = 0; i < name.length; i++) hash += name.charCodeAt(i);
      return MED_COLORS[hash % MED_COLORS.length];
    }

    var html = '<table class="med-table"><thead><tr>' +
      '<th></th><th>薬剤名</th><th>用量</th><th>タイミング</th><th>開始日</th><th>中止日</th><th>操作</th></tr></thead><tbody>';
    for (var i = 0; i < meds.length; i++) {
      var m = meds[i];
      var color = nameColor(m.drugName);
      var endLabel = m.endDate ? esc(m.endDate) : '<span class="med-active">→ 継続中</span>';
      html += '<tr>' +
        '<td><span class="med-color-dot" style="background:' + color + '"></span></td>' +
        '<td>' + esc(m.drugName) + '</td>' +
        '<td>' + (m.dosage || '') + m.dosageUnit + '</td>' +
        '<td>' + esc(m.timing || '') + '</td>' +
        '<td>' + esc(m.startDate) + '</td>' +
        '<td>' + endLabel + '</td>' +
        '<td>' +
        '<button class="btn btn-sm btn-secondary" data-med-edit="' + m.id + '" style="margin-right:4px">編集</button>' +
        '<button class="btn btn-sm btn-danger" data-med-del="' + m.id + '">削除</button>' +
        '</td></tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('[data-med-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { editMedication(Number(this.dataset.medEdit)); });
    });
    container.querySelectorAll('[data-med-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteMedicationConfirm(Number(this.dataset.medDel)); });
    });
  }

  function getMedFormData() {
    var drugName = $('med-drug-name'); var dosage = $('med-dosage');
    var unit = $('med-dosage-unit'); var timing = $('med-timing');
    var startDate = $('med-start-date'); var endDate = $('med-end-date');
    if (!drugName || !dosage || !startDate) return null;
    var name = drugName.value.trim();
    if (!name) { toast('薬剤名を入力してください'); return null; }
    var sd = startDate.value;
    if (!sd) { toast('開始日を入力してください'); return null; }
    return {
      drugName: name,
      dosage: Number(dosage.value) || 0,
      dosageUnit: unit ? unit.value : 'mg',
      timing: timing ? timing.value : '朝',
      startDate: sd,
      endDate: endDate ? endDate.value || null : null
    };
  }

  function clearMedForm() {
    var drugName = $('med-drug-name'); var dosage = $('med-dosage');
    var startDate = $('med-start-date'); var endDate = $('med-end-date');
    if (drugName) drugName.value = '';
    if (dosage) dosage.value = '';
    if (startDate) startDate.value = '';
    if (endDate) endDate.value = '';
    _editingMedId = null;
    var btn = $('btn-add-medication');
    if (btn) btn.textContent = '＋ 追加';
    var status = $('medication-status');
    if (status) status.textContent = '';
  }

  async function handleAddMedication() {
    var data = getMedFormData();
    if (!data) return;

    var med = {
      patientId: currentPatientId,
      drugName: data.drugName,
      dosage: data.dosage,
      dosageUnit: data.dosageUnit,
      timing: data.timing,
      startDate: data.startDate,
      endDate: data.endDate,
      createdAt: new Date().toISOString()
    };

    try {
      if (_editingMedId) {
        var existing = await getMedication(_editingMedId);
        if (existing) {
          med.id = _editingMedId;
          med.createdAt = existing.createdAt;
        }
      }
      await putMedication(med);
      toast(_editingMedId ? '降圧薬を更新しました' : '降圧薬を追加しました');
      clearMedForm();
      await renderMedicationSection();
      renderView();
    } catch (e) {
      console.error('handleAddMedication error:', e);
      toast('保存エラー: ' + e.message);
    }
  }

  async function editMedication(id) {
    try {
      var m = await getMedication(id);
      if (!m) return;
      _editingMedId = id;
      var drugName = $('med-drug-name'); var dosage = $('med-dosage');
      var unit = $('med-dosage-unit'); var timing = $('med-timing');
      var startDate = $('med-start-date'); var endDate = $('med-end-date');
      if (drugName) drugName.value = m.drugName;
      if (dosage) dosage.value = m.dosage || '';
      if (unit) unit.value = m.dosageUnit || 'mg';
      if (timing) timing.value = m.timing || '朝';
      if (startDate) startDate.value = m.startDate;
      if (endDate) endDate.value = m.endDate || '';
      var btn = $('btn-add-medication');
      if (btn) btn.textContent = '📝 更新';
      var status = $('medication-status');
      if (status) status.textContent = '編集中…';
      if (drugName) { drugName.focus(); drugName.select(); drugName.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    } catch (e) {
      console.error('editMedication:', e);
    }
  }

  function deleteMedicationConfirm(id) {
    confirmAsync('削除確認', 'この降圧薬を削除しますか？').then(function (ok) {
      if (!ok) return;
      deleteMedication(id).then(function () {
        toast('降圧薬を削除しました');
        clearMedForm();
        renderMedicationSection();
        renderView();
      }).catch(function (e) { console.error(e); });
    });
  }

  /* ═══════════════════════════════════════════════════════
      CALENDAR
     ═══════════════════════════════════════════════════════ */

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
          var dayAppts = _calAppointments.filter(function (a) {
            return a.appointmentDate === dateStr && a.status === 'scheduled';
          });
          var isSun = col === 0;
          var isSat = col === 6;

          var cls = 'cal-day';
          if (isToday) cls += ' cal-today';
          if (isSun) cls += ' cal-sun';
          if (isSat) cls += ' cal-sat';
          if (dayAppts.length > 0) cls += ' cal-has-appt';

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

          // 患者名（全表示、truncation廃止）
          if (dayAppts.length > 0) {
            var names = dayAppts.map(function (a) { return patientCache[a.patientId] || a.patientId; });
            label += '<br><span class="cal-appt-names">' + names.join('<br>') + '</span>';
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

    var nextMonth = month + 1;
    var nextYear = year;
    if (nextMonth > 12) { nextMonth = 1; nextYear++; }

    title.textContent = year + '年' + month + '月 - ' + nextYear + '年' + nextMonth + '月';
    if (info) {
      var today = new Date();
      info.textContent = '今日: ' + fmtDate(today);
    }

    var pad = function (n) { return String(n).padStart(2, '0'); };
    var startDate = year + '-' + pad(month) + '-01';
    var endDate = nextYear + '-' + pad(nextMonth) + '-31';
    try {
      _calAppointments = await getAppointmentsByDateRange(startDate, endDate);
    } catch (e) {
      _calAppointments = [];
    }

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

    var daySettingMap = {};
    try {
      var daySettings = await getDaySettingsByDateRange(startDate, endDate);
      for (var i = 0; i < daySettings.length; i++) {
        daySettingMap[daySettings[i].date] = daySettings[i];
      }
    } catch (e) { /* ignore */ }

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

    var predMap = _predictionMapKey(daySettingMap, startDate, endDate);
    var todayStr = fmtDate(new Date());

    var html = '<div class="cal-two-month">';
    html += _buildMonthTable(year, month, pad, patientCache, todayStr, daySettingMap, predMap);
    html += _buildMonthTable(nextYear, nextMonth, pad, patientCache, todayStr, daySettingMap, predMap);
    html += '</div>';
    body.innerHTML = html;

    body.querySelectorAll('.cal-day[data-date]').forEach(function (td) {
      td.addEventListener('click', function () {
        var date = this.dataset.date;
        var dayAppts = _calAppointments.filter(function (a) { return a.appointmentDate === date && a.status === 'scheduled'; });
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

      html += '<div class="appt-list-scroll"><table class="summary-table"><thead><tr><th>患者ID</th><th>氏名</th><th>処方日数</th><th>操作</th></tr></thead><tbody>';
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
      html += '</tbody></table></div>';
    }

    html += '<div style="margin-top:' + (appts && appts.length > 0 ? '16px;padding-top:16px;border-top:2px solid #e0e4e8' : '0') + '">';
    html += '<h4 style="font-size:.9em;margin-bottom:10px;color:#2c3e50">📅 新規予約</h4>';
    html += '<div class="form-row"><label>患者</label><select id="cal-new-patient" style="flex:1;padding:6px 8px;border:1px solid #bdc3c7;border-radius:4px;font-size:.9em;background:#fff"></select></div>';
    html += '<div class="form-row"><label>処方日数</label><input type="number" id="cal-new-days" min="1" max="365" placeholder="28" style="padding:6px 8px;border:1px solid #bdc3c7;border-radius:4px;width:70px;font-size:.9em"><span class="unit" style="font-size:.82em;color:#7f8c8d">日分</span></div>';
    html += '<div class="form-row"><label>メモ</label><input type="text" id="cal-new-memo" placeholder="任意" style="flex:1;padding:6px 8px;border:1px solid #bdc3c7;border-radius:4px;font-size:.9em"></div>';
    html += '<div class="btn-group" style="margin-top:10px;justify-content:flex-start"><button class="btn btn-primary" id="btn-cal-create-appt" style="padding:8px 20px;font-size:.88em">📅 予約作成</button></div>';
    html += '</div>';

    body.innerHTML = html;

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

    var btnCreate = $('btn-cal-create-appt');
    if (btnCreate) {
      btnCreate.addEventListener('click', function () {
        handleCalendarCreateAppointment(date);
      });
    }

    body.querySelectorAll('[data-nav-pid]').forEach(function (btn) {
      var pid = btn.dataset.navPid;
      btn.addEventListener('click', function () {
        hideModal('appt-detail');
        navigateToPatient(pid);
      });
    });

    _renderDaySettingSection(date);
    showModal('appt-detail');
  }

  /* ── 日付設定 ── */

  async function _renderDaySettingSection(date) {
    var container = $('appt-detail-body');
    if (!container) return;

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
      btnSave.addEventListener('click', function () { handleSaveDaySetting(date); });
    }
  }

  async function handleSaveDaySetting(date) {
    var getChk = function (id) { var e = $(id); return e ? e.checked : false; };
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


    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var targetDate = new Date(date + 'T00:00:00');
    if (targetDate < today) {
      toast('過去の日付には予約できません');
      return;
    }

    try {
      var allApps = await getAppointmentsByPatient(pid);
      var existing = allApps.find(function (a) { return a.status === 'scheduled'; });
      if (existing) {
        var ok = await confirmAsync('予約重複',
          'この患者さんには ' + existing.appointmentDate + ' の予約があります。\n新しい日付に変更しますか？');
        if (!ok) return;
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

  /* ═══════════════════════════════════════════════════════
      デモデータ
     ═══════════════════════════════════════════════════════ */

  async function initDemoData() {
    var ok = await confirmAsync('デモデータ投入',
      '患者DEMO-001〜003を作成し、3年分の月次血圧データ（36件/患者）・降圧薬データを生成します。\n続行しますか？');
    if (!ok) return;

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var pad2 = function (n) { return String(n).padStart(2, '0'); };
    var fmtYMD = function (d) {
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    };

    function addDays(d, n) {
      var r = new Date(d);
      r.setDate(r.getDate() + n);
      return r;
    }

    function addMonths(d, n) {
      var r = new Date(d);
      r.setMonth(r.getMonth() + n);
      return r;
    }

    // Deterministic pseudo-random noise (0-1)
    function noise(seed) {
      var x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    }

    try {
      // ── Patient master ──
      var demoPats = [
        { id: 'DEMO-001', name: '山田太郎', gender: '男', birthDate: '1965-03-15', memo: '高血圧' },
        { id: 'DEMO-002', name: '鈴木花子', gender: '女', birthDate: '1978-07-22', memo: '経過観察' },
        { id: 'DEMO-003', name: '佐藤健一', gender: '男', birthDate: '1955-11-08', memo: '糖尿病合併' }
      ];

      // 既存デモデータがあれば削除して再作成
      for (var pi = 0; pi < demoPats.length; pi++) {
        var exist = await getPatient(demoPats[pi].id);
        if (exist) {
          await deletePatient(demoPats[pi].id);
        }
      }

      for (var pi = 0; pi < demoPats.length; pi++) {
        await putPatient(demoPats[pi]);
      }

      // ── 患者プロファイル（ベース血圧・季節変動・治療傾向） ──
      var profiles = {
        'DEMO-001': {
          // 高血圧、治療で徐々に改善
          homeSbp: function (m) {
            var base = 145 + m * (-20 / 35); // 145→125
            var seas = 3 * Math.cos((m + 3) * Math.PI / 6);
            return Math.round(base + seas + (noise(m * 7 + 1) - 0.5) * 6);
          },
          homeDbp: function (m) {
            var base = 90 + m * (-12 / 35); // 90→78
            var seas = 2 * Math.cos((m + 3) * Math.PI / 6);
            return Math.round(base + seas + (noise(m * 7 + 2) - 0.5) * 4);
          },
          weight: 75, coatSbp: 8, coatDbp: 5
        },
        'DEMO-002': {
          // 軽度高血圧、安定
          homeSbp: function (m) {
            var base = 132 + m * (-4 / 35);
            var seas = 2 * Math.cos((m + 3) * Math.PI / 6);
            return Math.round(base + seas + (noise(m * 7 + 10) - 0.5) * 5);
          },
          homeDbp: function (m) {
            var base = 84 + m * (-3 / 35);
            var seas = 1.5 * Math.cos((m + 3) * Math.PI / 6);
            return Math.round(base + seas + (noise(m * 7 + 11) - 0.5) * 3);
          },
          weight: 58, coatSbp: 5, coatDbp: 3
        },
        'DEMO-003': {
          // 糖尿病合併、変動大
          homeSbp: function (m) {
            var base = 140 + m * (-10 / 35);
            var seas = 3 * Math.cos((m + 3) * Math.PI / 6);
            return Math.round(base + seas + (noise(m * 7 + 20) - 0.5) * 8);
          },
          homeDbp: function (m) {
            var base = 87 + m * (-5 / 35);
            var seas = 2 * Math.cos((m + 3) * Math.PI / 6);
            return Math.round(base + seas + (noise(m * 7 + 21) - 0.5) * 5);
          },
          weight: 68, coatSbp: 7, coatDbp: 4
        }
      };

      // ── 降圧薬スケジュール ──
      var medSchedules = {
        'DEMO-001': [
          { start: -35, end: -18, drugs: [
            { name: 'アムロジピン', dose: 5, unit: 'mg', timing: '朝' }
          ]},
          { start: -18, end: -6, drugs: [
            { name: 'アムロジピン', dose: 5, unit: 'mg', timing: '朝' },
            { name: 'オルメサルタン', dose: 20, unit: 'mg', timing: '朝' }
          ]},
          { start: -6, end: 0, drugs: [
            { name: 'シルニジピン', dose: 10, unit: 'mg', timing: '朝' },
            { name: 'オルメサルタン', dose: 20, unit: 'mg', timing: '夕' },
            { name: 'インダパミド', dose: 1, unit: 'mg', timing: '朝' }
          ]}
        ],
        'DEMO-002': [
          { start: -35, end: -12, drugs: [
            { name: 'テルミサルタン', dose: 40, unit: 'mg', timing: '朝' }
          ]},
          { start: -12, end: 0, drugs: [
            { name: 'テルミサルタン', dose: 40, unit: 'mg', timing: '朝' },
            { name: 'アムロジピン', dose: 2.5, unit: 'mg', timing: '朝' }
          ]}
        ],
        'DEMO-003': [
          { start: -35, end: -18, drugs: [
            { name: 'アジルサルタン', dose: 20, unit: 'mg', timing: '朝' }
          ]},
          { start: -18, end: -6, drugs: [
            { name: 'アジルサルタン', dose: 20, unit: 'mg', timing: '朝' },
            { name: 'アムロジピン', dose: 5, unit: 'mg', timing: '朝' }
          ]},
          { start: -6, end: 0, drugs: [
            { name: 'ユニシア（アジルサルタン/アムロジピン）', dose: 1, unit: '錠', timing: '朝' },
            { name: 'ビソプロロール', dose: 2.5, unit: 'mg', timing: '朝' }
          ]}
        ]
      };

      // ── 36ヶ月分の月次血圧データを生成 ──
      var readingCount = 0;
      for (var pi = 0; pi < demoPats.length; pi++) {
        var pid = demoPats[pi].id;
        var prof = profiles[pid];
        for (var m = -35; m <= 0; m++) {
          var ym = today.getMonth() + m;
          var yy = today.getFullYear() + Math.floor(ym / 12);
          var mm = ((ym % 12) + 12) % 12;
          var dayOffset = Math.floor(noise(m * 13 + pi * 100) * 18);
          var dd = Math.min(10 + dayOffset, 28);
          var dateStr = yy + '-' + pad2(mm + 1) + '-' + pad2(dd);

          var haSbp = prof.homeSbp(m);
          var haDbp = prof.homeDbp(m);
          var loSbp = Math.max(80, Math.round(haSbp - 8 - noise(m * 3 + pi * 100 + 1) * 8));
          var loDbp = Math.max(50, Math.round(haDbp - 5 - noise(m * 3 + pi * 100 + 2) * 5));
          var hiSbp = Math.round(haSbp + 8 + noise(m * 3 + pi * 100 + 3) * 8);
          var hiDbp = Math.round(haDbp + 5 + noise(m * 3 + pi * 100 + 4) * 5);
          var vSbp = Math.round(haSbp + prof.coatSbp + (noise(m * 3 + pi * 100 + 5) - 0.5) * 6);
          var vDbp = Math.round(haDbp + prof.coatDbp + (noise(m * 3 + pi * 100 + 6) - 0.5) * 4);
          var wt = Math.round((prof.weight + (noise(m * 3 + pi * 100 + 7) - 0.5) * 2) * 10) / 10;

          // 既存の同日データがあれば削除（安全策）
          var existRead = await getReadingByDate(pid, dateStr);
          if (existRead) {
            await deleteReading(existRead.id);
          }

          await putReading({
            patientId: pid,
            date: dateStr,
            systolic: vSbp,
            diastolic: vDbp,
            meanArterial: Math.round((vSbp + vDbp * 2) / 3),
            avgSbp: haSbp,
            avgDbp: haDbp,
            minSbp: loSbp,
            minDbp: loDbp,
            maxSbp: hiSbp,
            maxDbp: hiDbp,
            weight: wt,
            createdAt: new Date().toISOString()
          });
          readingCount++;
        }
      }

      // ── 降圧薬データを生成 ──
      var medCount = 0;
      for (var pi = 0; pi < demoPats.length; pi++) {
        var pid = demoPats[pi].id;
        var sched = medSchedules[pid];
        for (var si = 0; si < sched.length; si++) {
          var period = sched[si];
          var sd = addMonths(today, period.start);
          sd.setDate(1);
          var ed = null;
          if (period.end < 0) {
            ed = addMonths(today, period.end);
            ed.setDate(0); // 前月末日
          }
          for (var di = 0; di < period.drugs.length; di++) {
            var drug = period.drugs[di];
            await putMedication({
              patientId: pid,
              drugName: drug.name,
              dosage: drug.dose,
              dosageUnit: drug.unit,
              timing: drug.timing,
              startDate: fmtYMD(sd),
              endDate: ed ? fmtYMD(ed) : null,
              createdAt: new Date().toISOString()
            });
            medCount++;
          }
        }
      }

      // ── 日付設定（カレンダー表示用） ──
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

      // ── 予約データ ──
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

      toast('デモデータを投入しました: 患者3件, 血圧データ' + readingCount + '件, 降圧薬' + medCount + '件, 日付設定' + (dsList.length + nmDsList.length) + '件, 予約' + apptData.length + '件');
    } catch (e) {
      console.error('initDemoData error:', e);
      toast('デモデータ投入エラー: ' + e.message);
    }
  }

  async function exportAppointmentsCSV() {
    var appointments = await getAllAppointments();
    if (appointments.length === 0) { toast('予約データがありません'); return; }

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
    appointments.sort(function (a, b) { return a.appointmentDate.localeCompare(b.appointmentDate); });
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

  /* ═══════════════════════════════════════════════════════
      PASTE VIEW
     ═══════════════════════════════════════════════════════ */

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
    var entries = [];
    var now = new Date();
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

      // Format B: avgSBP/avgDBP memo
      if (!parsed) {
        m = rest.match(/^(\d{1,3})\/(\d{1,3})(?:\s|　|$)/);
        if (m) {
          avgSbp = parseInt(m[1], 10);
          avgDbp = parseInt(m[2], 10);
          bpEnd = dateMatch[0].length + m[0].length;
          parsed = true;
        }
      }

      // Format C: [朝]min-max  (systolic only)
      if (!parsed) {
        m = rest.match(/^(?:朝)?(\d{1,3})-(\d{1,3})/);
        if (m) {
          minSbp = parseInt(m[1], 10);
          maxSbp = parseInt(m[2], 10);
          bpEnd = dateMatch[0].length + m[0].length;

          // Format D: 朝min-max [夕min-max]
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

      entries.push({
        month: month, day: day,
        avgSbp: avgSbp, avgDbp: avgDbp,
        minSbp: minSbp, minDbp: minDbp,
        maxSbp: maxSbp, maxDbp: maxDbp,
        minSbpPm: minSbpPm, maxSbpPm: maxSbpPm,
        memo: memo
      });
    }

    if (entries.length === 0) return [];

    var records = new Array(entries.length);
    var lastDate = null;

    for (var i = entries.length - 1; i >= 0; i--) {
      var e = entries[i];
      var year = currentYear;

      while (true) {
        var candidate = new Date(year, e.month - 1, e.day);
        if (candidate <= now && (!lastDate || candidate < lastDate)) {
          break;
        }
        year--;
        if (year < 1970) break;
      }

      var yyyy = String(year);
      var mm = String(e.month).padStart(2, '0');
      var dd = String(e.day).padStart(2, '0');
      var fullDate = yyyy + '-' + mm + '-' + dd;

      records[i] = {
        date: fullDate,
        year: year, month: e.month, day: e.day,
        avgSbp: e.avgSbp, avgDbp: e.avgDbp,
        minSbp: e.minSbp, minDbp: e.minDbp,
        maxSbp: e.maxSbp, maxDbp: e.maxDbp,
        minSbpPm: e.minSbpPm, maxSbpPm: e.maxSbpPm,
        memo: e.memo
      };

      lastDate = new Date(year, e.month - 1, e.day);
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

  /* ---- グローバル公開（後方互換性） ---- */

  window.init = init;
  window.openDBSync = openDBSync;
  window.initIdScreen = initIdScreen;
  window.renderRecentPatients = renderRecentPatients;
  window.handleIdEnter = handleIdEnter;
  window.navigateToPatient = navigateToPatient;
  window.handleNewPatient = handleNewPatient;
  window.confirmAsync = confirmAsync;
  window.handleConfirm = handleConfirm;
  window.renderPatientPage = renderPatientPage;
  window.renderView = renderView;
  window.showPasteView = showPasteView;
  window.hidePasteView = hidePasteView;
  window.setViewTabs = setViewTabs;
  window.renderAllPeriodView = renderAllPeriodView;
  window.renderDailyListFromData = renderDailyListFromData;
  window.renderNav = renderNav;
  window.goBack = goBack;
  window.registerReading = registerReading;
  window.editReading = editReading;
  window.deleteReadingConfirm = deleteReadingConfirm;
  window.exportCSV = exportCSV;
  window.handleImportCSV = handleImportCSV;
  window.handleBackup = handleBackup;
  window.handleRestore = handleRestore;
  window.handleDeletePatient = handleDeletePatient;
  window.updateDataStat = updateDataStat;
  window.generateEMRText = generateEMRText;
  window.fallbackCopy = fallbackCopy;
  window.readEmrPatient = readEmrPatient;
  window.navigateToPatientAuto = navigateToPatientAuto;
  window.updateEmrStatus = updateEmrStatus;
  window.renderAppointmentSection = renderAppointmentSection;
  window.calcCountdown = calcCountdown;
  window.updateAppointmentCountdown = updateAppointmentCountdown;
  window.handleSaveAppointment = handleSaveAppointment;
  window.handleMarkDone = handleMarkDone;
  window.openCalendar = openCalendar;
  window.showCalendarView = showCalendarView;
  window.closeCalendar = closeCalendar;
  window.calNavigate = calNavigate;
  window._busyLabel = _busyLabel;
  window._predictionMapKey = _predictionMapKey;
  window._buildMonthTable = _buildMonthTable;
  window.renderCalendar = renderCalendar;
  window.showAppointmentDetail = showAppointmentDetail;
  window._renderDaySettingSection = _renderDaySettingSection;
  window.handleSaveDaySetting = handleSaveDaySetting;
  window.handleCalendarCreateAppointment = handleCalendarCreateAppointment;
  window.renderMedicationSection = renderMedicationSection;
  window.handleAddMedication = handleAddMedication;
  window.editMedication = editMedication;
  window.deleteMedicationConfirm = deleteMedicationConfirm;
  window.clearMedForm = clearMedForm;
  window.initDemoData = initDemoData;
  window.exportAppointmentsCSV = exportAppointmentsCSV;
  window.renderPasteView = renderPasteView;
  window.parseExcelTSV = parseExcelTSV;
  window.openExcelImport = openExcelImport;
  window.closeExcelImport = closeExcelImport;
  window.handleExcelPreview = handleExcelPreview;
  window.renderExcelPreview = renderExcelPreview;
  window.handleExcelCommit = handleExcelCommit;
  window.showEmrMatchModal = showEmrMatchModal;
  window.handleEmrMatchConfirm = handleEmrMatchConfirm;
  window.handleEmrMatchSkip = handleEmrMatchSkip;
  window._matchScore = _matchScore;
  window._excelPatientId = _excelPatientId;
  window.handleParseVisit = handleParseVisit;
  window.parseVisitData = parseVisitData;
  window.renderVisitPreview = renderVisitPreview;
  window.syncPreviewEdit = syncPreviewEdit;
  window.handleSaveVisit = handleSaveVisit;

  /* ---- 公開API ---- */

  return {
    init: init,
    initIdScreen: initIdScreen,
    renderPatientPage: renderPatientPage,
    renderView: renderView,
    navigateToPatient: navigateToPatient,
    registerReading: registerReading,
    openDBSync: openDBSync
  };

})();
