/* =================================================================
   cleanup.js — データクレンジングモジュール v3.0.0
   患者データの不整合（IDフォーマット混在・名前不一致・名前なし）を
   検出し、編集するUI
   ================================================================= */

BPApp.Cleanup = (function () {

  /* ---- エントリポイント ---- */

  function openDataCleanup() {
    showScreen('cleanup');
    runCleanupCheck();
  }

  function closeCleanup() {
    showScreen('id');
    var inp = $('inp-patient-id');
    if (inp) { inp.value = ''; inp.focus(); }
    renderRecentPatients();
  }

  /* ---- 分析実行 ---- */

  async function runCleanupCheck() {
    var statusEl = $('cleanup-status');
    if (statusEl) statusEl.textContent = '患者データを分析中...';

    try {
      var patients = await getAllPatients();
      var readings = await getAllReadings();

      // 数値IDでグループ化
      var groups = {};
      var nonNumericIds = [];

      for (var i = 0; i < patients.length; i++) {
        var p = patients[i];
        var numId = parseInt(p.id, 10);
        if (isNaN(numId)) {
          nonNumericIds.push(p);
          continue;
        }
        if (!groups[numId]) groups[numId] = [];
        groups[numId].push(p);
      }

      // 検出1: IDフォーマット混在
      var fmtIssues = [];
      for (var numId in groups) {
        var g = groups[numId];
        if (g.length < 2) continue;
        var ids = {};
        for (var j = 0; j < g.length; j++) {
          ids[g[j].id] = true;
        }
        var uniqueIds = Object.keys(ids);
        if (uniqueIds.length > 1) {
          var sorted = uniqueIds.slice().sort(function (a, b) { return b.length - a.length; });
          var targetId = sorted[0];
          fmtIssues.push({
            numId: Number(numId),
            patients: g,
            ids: uniqueIds,
            targetId: targetId
          });
        }
      }

      // 検出2: 名前不一致
      var nameConflicts = [];
      for (var numId in groups) {
        var g = groups[numId];
        if (g.length < 2) continue;
        var nameMap = {};
        for (var j = 0; j < g.length; j++) {
          var n = (g[j].name || '').trim();
          if (n) nameMap[n] = (nameMap[n] || 0) + 1;
        }
        var names = Object.keys(nameMap);
        if (names.length > 1) {
          var bestName = names[0];
          var bestCount = nameMap[names[0]];
          for (var k = 1; k < names.length; k++) {
            if (nameMap[names[k]] > bestCount) {
              bestCount = nameMap[names[k]];
              bestName = names[k];
            }
          }
          nameConflicts.push({
            numId: Number(numId),
            patients: g,
            names: names,
            bestName: bestName
          });
        }
      }

      // 検出3: 名前なし患者
      var noNamePats = [];
      for (var i = 0; i < patients.length; i++) {
        var p = patients[i];
        if (!p.name || !p.name.trim()) {
          var cnt = 0;
          for (var j = 0; j < readings.length; j++) {
            if (readings[j].patientId === p.id) cnt++;
          }
          noNamePats.push({
            patient: p,
            readingCount: cnt
          });
        }
      }

      // 検出4: Excel取込未マッチ患者
      var excelPats = [];
      for (var i = 0; i < patients.length; i++) {
        if (patients[i].source === 'excel') {
          var appts = await getAppointmentsByPatient(patients[i].id);
          excelPats.push({
            patient: patients[i],
            appointmentCount: appts.length
          });
        }
      }

      renderCleanupResults(fmtIssues, nameConflicts, noNamePats, excelPats);

      if (statusEl) statusEl.textContent = '';
    } catch (e) {
      console.error('runCleanupCheck error:', e);
      if (statusEl) statusEl.textContent = 'エラー: ' + e.message;
    }
  }

  /* ---- 結果表示 ---- */

  function renderCleanupResults(fmtIssues, nameConflicts, noNamePats, excelPats) {
    var summaryEl = $('cleanup-summary');
    var fmtEl = $('cleanup-fmt-issues');
    var nameEl = $('cleanup-name-conflicts');
    var nonameEl = $('cleanup-noname');
    if (!summaryEl || !fmtEl || !nameEl || !nonameEl) return;

    if (!excelPats) excelPats = [];

    var total = fmtIssues.length + nameConflicts.length + noNamePats.length + excelPats.length;

    summaryEl.innerHTML =
      '<strong>検出結果</strong>: ' +
      'IDフォーマット混在 ' + fmtIssues.length + '件 / ' +
      '名前不一致 ' + nameConflicts.length + '件 / ' +
      '名前なし ' + noNamePats.length + '件 / ' +
      'Excel未マッチ ' + excelPats.length + '件';

    if (total === 0) {
      fmtEl.innerHTML = '<div class="cleanup-empty">✅ 問題は見つかりませんでした</div>';
      nameEl.innerHTML = '';
      nonameEl.innerHTML = '';
      return;
    }

    // セクション1: IDフォーマット混在
    if (fmtIssues.length > 0) {
      var fmtHtml = '';
      for (var i = 0; i < fmtIssues.length; i++) {
        (function (issue) {
          var patRows = '';
          for (var j = 0; j < issue.patients.length; j++) {
            var p = issue.patients[j];
            var pname = esc(p.name || '');
            patRows += '<div class="cleanup-pat-row">' +
              '<code>' + esc(p.id) + '</code> ' +
              '<span class="cleanup-pat-name">' + pname + '</span>' +
              (p.id === issue.targetId ? ' <span class="cleanup-badge-target">ターゲット</span>' : '') +
              '</div>';
          }
          fmtHtml +=
            '<div class="cleanup-card">' +
            '<div class="cleanup-card-header">🔗 数値ID: <strong>' + issue.numId + '</strong> — ' +
            issue.ids.length + '種類のID表記</div>' +
            '<div class="cleanup-card-body">' +
            patRows +
            '<div class="cleanup-card-action">' +
            '<button class="btn btn-primary btn-sm" data-merge-group="' + issue.numId + '">' +
            '🔗 統合: ' + esc(issue.targetId) + ' に統一</button> ' +
            '<span class="cleanup-hint">測定データ・予約を全て ' + esc(issue.targetId) + ' に移行します</span>' +
            '</div></div></div>';
        })(fmtIssues[i]);
      }
      fmtEl.innerHTML =
        '<h3 class="cleanup-section-title">📛 IDフォーマット混在 <span class="cleanup-count">' + fmtIssues.length + '</span></h3>' +
        '<p class="cleanup-desc">同じ患者なのにIDの桁数（ゼロ埋め）が異なります。ボタンをクリックして統一してください。</p>' +
        fmtHtml;
    } else {
      fmtEl.innerHTML = '<div class="cleanup-empty">✅ IDフォーマット混在はありません</div>';
    }

    fmtEl.querySelectorAll('[data-merge-group]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var numId = Number(this.dataset.mergeGroup);
        var issue = null;
        for (var i = 0; i < fmtIssues.length; i++) {
          if (fmtIssues[i].numId === numId) { issue = fmtIssues[i]; break; }
        }
        if (issue) confirmMergeGroup(issue);
      });
    });

    // セクション2: 名前不一致
    if (nameConflicts.length > 0) {
      var ncHtml = '';
      for (var i = 0; i < nameConflicts.length; i++) {
        (function (issue) {
          var patRows = '';
          for (var j = 0; j < issue.patients.length; j++) {
            var p = issue.patients[j];
            var pname = esc(p.name || '(なし)');
            patRows += '<div class="cleanup-pat-row">' +
              '<code>' + esc(p.id) + '</code> ' +
              '<span class="cleanup-pat-name">' + pname + '</span>' +
              '</div>';
          }

          var selectHtml = '<select class="cleanup-name-select" data-namefix-group="' + issue.numId + '">';
          for (var j = 0; j < issue.names.length; j++) {
            var selected = issue.names[j] === issue.bestName ? ' selected' : '';
            selectHtml += '<option value="' + esc(issue.names[j]) + '"' + selected + '>' + esc(issue.names[j]) + '</option>';
          }
          selectHtml += '</select>';

          ncHtml +=
            '<div class="cleanup-card">' +
            '<div class="cleanup-card-header">❓ 数値ID: <strong>' + issue.numId + '</strong> — 名前に不一致</div>' +
            '<div class="cleanup-card-body">' +
            patRows +
            '<div class="cleanup-card-action">' +
            '正しい名前を選択: ' + selectHtml + ' ' +
            '<button class="btn btn-primary btn-sm" data-fix-name-group="' + issue.numId + '">' +
            '✅ 適用</button>' +
            '</div></div></div>';
        })(nameConflicts[i]);
      }
      nameEl.innerHTML =
        '<h3 class="cleanup-section-title">❓ 名前不一致 <span class="cleanup-count">' + nameConflicts.length + '</span></h3>' +
        '<p class="cleanup-desc">同じ患者のグループ内で氏名の登録が異なります。正しい名前を選んで統一してください。</p>' +
        ncHtml;
    } else {
      nameEl.innerHTML = '<div class="cleanup-empty">✅ 名前不一致はありません</div>';
    }

    nameEl.querySelectorAll('[data-fix-name-group]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var numId = Number(this.dataset.fixNameGroup);
        var issue = null;
        for (var i = 0; i < nameConflicts.length; i++) {
          if (nameConflicts[i].numId === numId) { issue = nameConflicts[i]; break; }
        }
        if (!issue) return;
        var select = btn.parentElement.querySelector('.cleanup-name-select');
        if (!select) return;
        var correctName = select.value;
        confirmApplyName(issue, correctName);
      });
    });

    // セクション3: 名前なし患者
    if (noNamePats.length > 0) {
      var nnHtml = '';
      for (var i = 0; i < noNamePats.length; i++) {
        (function (item) {
          var p = item.patient;
          nnHtml +=
            '<div class="cleanup-card">' +
            '<div class="cleanup-card-header">⚠ ID: <code>' + esc(p.id) + '</code>' +
            '（測定' + item.readingCount + '件）' +
            '</div>' +
            '<div class="cleanup-card-body">' +
            '<div class="cleanup-card-action">' +
            '<input type="text" class="cleanup-name-input" data-patient-id="' + esc(p.id) + '" placeholder="氏名を入力" value=""> ' +
            '<button class="btn btn-primary btn-sm" data-assign-name="' + esc(p.id) + '">💾 保存</button> ' +
            (item.readingCount === 0 ? '<button class="btn btn-danger btn-sm" data-del-noname="' + esc(p.id) + '">🗑 削除</button>' : '') +
            '</div></div></div>';
        })(noNamePats[i]);
      }
      nonameEl.innerHTML =
        '<h3 class="cleanup-section-title">⚠ 名前なし患者 <span class="cleanup-count">' + noNamePats.length + '</span></h3>' +
        '<p class="cleanup-desc">氏名が登録されていない患者です。名前を入力するか、不要な患者を削除してください。</p>' +
        nnHtml;
    } else {
      nonameEl.innerHTML = '<div class="cleanup-empty">✅ 名前なし患者はいません</div>';
    }

    nonameEl.querySelectorAll('[data-assign-name]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pid = this.dataset.assignName;
        var inp = document.querySelector('.cleanup-name-input[data-patient-id="' + pid.replace(/[."\\\/\[\]]/g, '\\$&') + '"]');
        var name = inp ? inp.value.trim() : '';
        if (!name) { toast('氏名を入力してください'); return; }
        handleAssignName(pid, name);
      });
    });

    nonameEl.querySelectorAll('[data-del-noname]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pid = this.dataset.delNoname;
        confirmDeletePatient(pid);
      });
    });

    // セクション4: Excel取込未マッチ患者
    var excelEl = $('cleanup-noname'); // reuse noname container sibling or separate
    // We'll append after noname using a different approach: add a new div
    var existingExcelSection = document.getElementById('cleanup-excel-section');
    if (existingExcelSection) existingExcelSection.parentNode.removeChild(existingExcelSection);

    if (excelPats.length > 0) {
      var exHtml = '';
      for (var i = 0; i < excelPats.length; i++) {
        (function (item) {
          var p = item.patient;
          var apptCount = item.appointmentCount;
          exHtml +=
            '<div class="cleanup-card">' +
            '<div class="cleanup-card-header">📥 ID: <code>' + esc(p.id) + '</code> — ' + esc(p.name) +
            '（予約' + apptCount + '件）</div>' +
            '<div class="cleanup-card-body">' +
            '<div class="cleanup-card-action">' +
            '<span style="font-size:.82em;color:#7f8c8d">EMR読込時に自動マッチングを試みます。手動で紐付ける場合は患者IDを入力：</span>' +
            '<div style="margin-top:6px;display:flex;gap:8px;align-items:center">' +
            '<input type="text" class="cleanup-excel-target-id" data-excel-pid="' + esc(p.id) + '" placeholder="EMR患者ID（8桁）" style="padding:6px 8px;border:1px solid #bdc3c7;border-radius:4px;font-size:.88em;width:160px"> ' +
            '<button class="btn btn-primary btn-sm" data-excel-merge="' + esc(p.id) + '">🔄 紐付け</button> ' +
            '<button class="btn btn-danger btn-sm" data-excel-delete="' + esc(p.id) + '">🗑 削除</button>' +
            '</div></div></div></div>';
        })(excelPats[i]);
      }
      var excelSection = document.createElement('div');
      excelSection.id = 'cleanup-excel-section';
      excelSection.innerHTML =
        '<h3 class="cleanup-section-title" style="margin-top:16px">📥 Excel取込未マッチ患者 <span class="cleanup-count">' + excelPats.length + '</span></h3>' +
        '<p class="cleanup-desc">Excelから取り込んだ仮患者です。EMR読込時に自動マッチングを提案します。手動でEMR患者に紐付けるか、削除してください。</p>' +
        exHtml;
      nonameEl.parentNode.appendChild(excelSection);

      excelSection.querySelectorAll('[data-excel-merge]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var excelPid = this.dataset.excelMerge;
          var inp = document.querySelector('.cleanup-excel-target-id[data-excel-pid="' + excelPid.replace(/[."\\\/\[\]]/g, '\\$&') + '"]');
          var targetId = inp ? inp.value.trim() : '';
          if (!targetId) { toast('EMR患者IDを入力してください'); return; }
          confirmExcelMerge(excelPid, targetId);
        });
      });

      excelSection.querySelectorAll('[data-excel-delete]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var pid = this.dataset.excelDelete;
          confirmDeletePatient(pid);
        });
      });
    }
  }

  /* ---- ID統合の確認 ---- */

  function confirmMergeGroup(issue) {
    var msg = '以下のID表記を統合します:\n';
    for (var i = 0; i < issue.ids.length; i++) {
      var mark = issue.ids[i] === issue.targetId ? ' ★(ターゲット)' : '';
      msg += '  ' + issue.ids[i] + mark + '\n';
    }
    msg += '\n全ての測定データ・予約を ' + issue.targetId + ' に移行します。\nよろしいですか？';

    confirmAsync('ID統合確認', msg).then(function (ok) {
      if (!ok) return;
      doMergeGroup(issue);
    });
  }

  /* ---- 統合実行 ---- */

  async function doMergeGroup(issue) {
    var sourceIds = [];
    for (var i = 0; i < issue.ids.length; i++) {
      if (issue.ids[i] !== issue.targetId) {
        sourceIds.push(issue.ids[i]);
      }
    }

    var merged = 0;
    var errors = 0;

    for (var si = 0; si < sourceIds.length; si++) {
      try {
        await mergePatientInto(sourceIds[si], issue.targetId);
        merged++;
      } catch (e) {
        console.error('merge error:', sourceIds[si], e);
        errors++;
      }
    }

    if (errors > 0) {
      toast('統合完了: ' + merged + '件, エラー: ' + errors + '件');
    } else {
      toast('統合完了: ' + merged + '件の患者を ' + issue.targetId + ' に統合しました');
    }

    await runCleanupCheck();
  }

  async function mergePatientInto(sourceId, targetId) {
    var sourceReadings = await getReadingsByPatient(sourceId);
    for (var i = 0; i < sourceReadings.length; i++) {
      var r = sourceReadings[i];
      var existingTarget = await getReadingByDate(targetId, r.date);
      if (existingTarget) {
        await deleteReading(r.id);
        continue;
      }
      var newReading = {
        patientId: targetId,
        date: r.date,
        systolic: r.systolic || 0,
        diastolic: r.diastolic || 0,
        meanArterial: r.meanArterial || 0,
        note: r.note || '',
        avgSbp: r.avgSbp || 0,
        avgDbp: r.avgDbp || 0,
        minSbp: r.minSbp || 0,
        minDbp: r.minDbp || 0,
        maxSbp: r.maxSbp || 0,
        maxDbp: r.maxDbp || 0,
        minPulse: r.minPulse || 0,
        maxPulse: r.maxPulse || 0,
        createdAt: r.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await deleteReading(r.id);
      await putReading(newReading);
    }

    var summaries = await getMonthlySummariesByPatient(sourceId);
    for (var i = 0; i < summaries.length; i++) {
      var s = summaries[i];
      var existing = await getMonthlySummary(targetId, s.year, s.month);
      if (!existing) {
        s.patientId = targetId;
        await putMonthlySummary(s);
      }
      await deleteMonthlySummary(sourceId, s.year, s.month);
    }

    var appointments = await getAppointmentsByPatient(sourceId);
    for (var i = 0; i < appointments.length; i++) {
      var a = appointments[i];
      a.patientId = targetId;
      var allTargetApps = await getAppointmentsByPatient(targetId);
      var dup = false;
      for (var j = 0; j < allTargetApps.length; j++) {
        if (allTargetApps[j].appointmentDate === a.appointmentDate && allTargetApps[j].status === a.status) {
          dup = true;
          break;
        }
      }
      if (!dup) {
        a.updatedAt = new Date().toISOString();
        await putAppointment(a);
      } else {
        await deleteAppointment(a.id);
      }
    }

    var sourcePat = await getPatient(sourceId);
    var targetPat = await getPatient(targetId);
    if (!targetPat) {
      if (sourcePat) {
        sourcePat.id = targetId;
        sourcePat.updatedAt = new Date().toISOString();
        await putPatient(sourcePat);
      }
    } else if (sourcePat && sourcePat.name && sourcePat.name.trim() && (!targetPat.name || !targetPat.name.trim())) {
      targetPat.name = sourcePat.name;
      targetPat.updatedAt = new Date().toISOString();
      await putPatient(targetPat);
    }

    await prom(tx('patients', 'readwrite').delete(sourceId));
  }

  /* ---- Excel取込患者の手動紐付け ---- */

  function confirmExcelMerge(excelPid, targetId) {
    confirmAsync('Excel患者紐付け確認',
      'Excel取込患者 ' + excelPid + ' を EMR患者 ' + targetId + ' に紐付けます。\n' +
      '予約データが全て移行されます。よろしいですか？'
    ).then(function (ok) {
      if (!ok) return;
      doExcelMerge(excelPid, targetId);
    });
  }

  async function doExcelMerge(excelPid, targetId) {
    try {
      await reassignPatientAppointments(excelPid, targetId);
      await deletePatient(excelPid);
      toast('患者 ' + excelPid + ' を ' + targetId + ' に紐付けました');
      await runCleanupCheck();
    } catch (e) {
      console.error('doExcelMerge error:', e);
      toast('紐付けエラー: ' + e.message);
    }
  }

  /* ---- 名前の一括適用 ---- */

  function confirmApplyName(issue, correctName) {
    var msg = '以下の患者の名前を「' + correctName + '」に統一します:\n';
    for (var i = 0; i < issue.patients.length; i++) {
      msg += '  ' + issue.patients[i].id + ' (' + esc(issue.patients[i].name || '(なし)') + ')\n';
    }
    msg += '\nよろしいですか？';

    confirmAsync('名前統一確認', msg).then(function (ok) {
      if (!ok) return;
      doApplyName(issue, correctName);
    });
  }

  async function doApplyName(issue, correctName) {
    var updated = 0;
    for (var i = 0; i < issue.patients.length; i++) {
      var p = issue.patients[i];
      if ((p.name || '').trim() !== correctName) {
        p.name = correctName;
        p.updatedAt = new Date().toISOString();
        await putPatient(p);
        updated++;
      }
    }
    toast('名前を統一しました: ' + updated + '件を「' + correctName + '」に更新');
    await runCleanupCheck();
  }

  /* ---- 名前なし患者に名前を登録 ---- */

  async function handleAssignName(patientId, name) {
    try {
      var p = await getPatient(patientId);
      if (!p) { toast('患者が見つかりません'); return; }
      p.name = name;
      p.updatedAt = new Date().toISOString();
      await putPatient(p);
      toast('患者 ' + patientId + ' の名前を「' + name + '」に設定しました');
      await runCleanupCheck();
    } catch (e) {
      console.error('handleAssignName error:', e);
      toast('エラー: ' + e.message);
    }
  }

  /* ---- 名前なし患者（データなし）の削除 ---- */

  function confirmDeletePatient(patientId) {
    confirmAsync('患者削除確認',
      '患者 ' + patientId + ' を削除します（測定データなし）。\nよろしいですか？'
    ).then(function (ok) {
      if (!ok) return;
      doDeletePatient(patientId);
    });
  }

  async function doDeletePatient(patientId) {
    try {
      await deletePatient(patientId);
      toast('患者 ' + patientId + ' を削除しました');
      await runCleanupCheck();
    } catch (e) {
      console.error('doDeletePatient error:', e);
      toast('削除エラー: ' + e.message);
    }
  }

  /* ---- グローバル公開（後方互換性） ---- */

  window.openDataCleanup = openDataCleanup;
  window.closeCleanup = closeCleanup;
  window.runCleanupCheck = runCleanupCheck;
  window.renderCleanupResults = renderCleanupResults;
  window.confirmMergeGroup = confirmMergeGroup;
  window.doMergeGroup = doMergeGroup;
  window.mergePatientInto = mergePatientInto;
  window.confirmApplyName = confirmApplyName;
  window.doApplyName = doApplyName;
  window.handleAssignName = handleAssignName;
  window.confirmDeletePatient = confirmDeletePatient;
  window.doDeletePatient = doDeletePatient;
  window.confirmExcelMerge = confirmExcelMerge;
  window.doExcelMerge = doExcelMerge;

  /* ---- 公開API ---- */

  return {
    openDataCleanup: openDataCleanup,
    closeCleanup: closeCleanup,
    runCleanupCheck: runCleanupCheck,
    mergePatientInto: mergePatientInto
  };

})();
