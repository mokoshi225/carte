/* =================================================================
   cleanup.js — データクレンジングモジュール v1.0.0
   患者データの不整合（IDフォーマット混在・名前不一致・名前なし）を
   検出し、編集するUI
   ================================================================= */

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

    // 数値IDでグループ化（数字のみのIDを持つ患者のみ）
    var groups = {};  // numericId -> [{id, name, ...}]
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

    // ---- 検出1: IDフォーマット混在 ----
    var fmtIssues = [];
    for (var numId in groups) {
      var g = groups[numId];
      if (g.length < 2) continue;
      // ID文字列のバリエーションをチェック
      var ids = {};
      for (var j = 0; j < g.length; j++) {
        ids[g[j].id] = true;
      }
      var uniqueIds = Object.keys(ids);
      if (uniqueIds.length > 1) {
        // ゼロパディングされたIDをターゲットに（より桁数の多い方）
        var sorted = uniqueIds.slice().sort(function(a, b) { return b.length - a.length; });
        var targetId = sorted[0];  // 桁数が多い方 = ゼロパディング済み
        fmtIssues.push({
          numId: Number(numId),
          patients: g,
          ids: uniqueIds,
          targetId: targetId
        });
      }
    }

    // ---- 検出2: 名前不一致（ID重複グループ内で名前が異なる） ----
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
        // 最多出現の名前を正解候補に
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

    // ---- 検出3: 名前なし患者 ----
    var noNamePats = [];
    for (var i = 0; i < patients.length; i++) {
      var p = patients[i];
      if (!p.name || !p.name.trim()) {
        // 測定データ件数を調べる
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

    renderCleanupResults(fmtIssues, nameConflicts, noNamePats);

    if (statusEl) statusEl.textContent = '';
  } catch (e) {
    console.error('runCleanupCheck error:', e);
    if (statusEl) statusEl.textContent = 'エラー: ' + e.message;
  }
}

/* ---- 結果表示 ---- */

function renderCleanupResults(fmtIssues, nameConflicts, noNamePats) {
  var summaryEl = $('cleanup-summary');
  var fmtEl = $('cleanup-fmt-issues');
  var nameEl = $('cleanup-name-conflicts');
  var nonameEl = $('cleanup-noname');
  if (!summaryEl || !fmtEl || !nameEl || !nonameEl) return;

  var total = fmtIssues.length + nameConflicts.length + noNamePats.length;

  // サマリー
  summaryEl.innerHTML =
    '<strong>検出結果</strong>: ' +
    'IDフォーマット混在 ' + fmtIssues.length + '件 / ' +
    '名前不一致 ' + nameConflicts.length + '件 / ' +
    '名前なし ' + noNamePats.length + '件';

  if (total === 0) {
    fmtEl.innerHTML = '<div class="cleanup-empty">✅ 問題は見つかりませんでした</div>';
    nameEl.innerHTML = '';
    nonameEl.innerHTML = '';
    return;
  }

  // ---- セクション1: IDフォーマット混在 ----
  if (fmtIssues.length > 0) {
    var fmtHtml = '';
    for (var i = 0; i < fmtIssues.length; i++) {
      (function(issue) {
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

  // ── イベント配線: ID統合 ──
  fmtEl.querySelectorAll('[data-merge-group]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var numId = Number(this.dataset.mergeGroup);
      var issue = null;
      for (var i = 0; i < fmtIssues.length; i++) {
        if (fmtIssues[i].numId === numId) { issue = fmtIssues[i]; break; }
      }
      if (issue) confirmMergeGroup(issue);
    });
  });

  // ---- セクション2: 名前不一致 ----
  if (nameConflicts.length > 0) {
    var ncHtml = '';
    for (var i = 0; i < nameConflicts.length; i++) {
      (function(issue) {
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

  // ── イベント配線: 名前修正 ──
  nameEl.querySelectorAll('[data-fix-name-group]').forEach(function(btn) {
    btn.addEventListener('click', function() {
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

  // ---- セクション3: 名前なし患者 ----
  if (noNamePats.length > 0) {
    var nnHtml = '';
    for (var i = 0; i < noNamePats.length; i++) {
      (function(item) {
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

  // ── イベント配線: 名前登録 ──
  nonameEl.querySelectorAll('[data-assign-name]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var pid = this.dataset.assignName;
      var inp = document.querySelector('.cleanup-name-input[data-patient-id="' + pid.replace(/[."\\\/\[\]]/g, '\\$&') + '"]');
      var name = inp ? inp.value.trim() : '';
      if (!name) { toast('氏名を入力してください'); return; }
      handleAssignName(pid, name);
    });
  });

  // ── イベント配線: 名前なし患者削除 ──
  nonameEl.querySelectorAll('[data-del-noname]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var pid = this.dataset.delNoname;
      confirmDeletePatient(pid);
    });
  });
}

/* ---- ID統合の確認 ---- */

function confirmMergeGroup(issue) {
  var msg = '以下のID表記を統合します:\n';
  for (var i = 0; i < issue.ids.length; i++) {
    var mark = issue.ids[i] === issue.targetId ? ' ★(ターゲット)' : '';
    msg += '  ' + issue.ids[i] + mark + '\n';
  }
  msg += '\n全ての測定データ・予約を ' + issue.targetId + ' に移行します。\nよろしいですか？';

  confirmAsync('ID統合確認', msg).then(function(ok) {
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

  // 再分析
  await runCleanupCheck();
}

/**
 * sourceId の患者データを全て targetId に移行する
 */
async function mergePatientInto(sourceId, targetId) {
  // 1. 測定データを移行
  var sourceReadings = await getReadingsByPatient(sourceId);
  for (var i = 0; i < sourceReadings.length; i++) {
    var r = sourceReadings[i];
    // 同日のデータが既にターゲット側にあればスキップ（ターゲット優先）
    var existingTarget = await getReadingByDate(targetId, r.date);
    if (existingTarget) {
      // ターゲット側に既存データあり → ソースを削除
      await deleteReading(r.id);
      continue;
    }
    // ソースの読みを削除し、新しいpatientIdで作成
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
      createdAt: r.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await deleteReading(r.id);
    await putReading(newReading);
  }

  // 2. 月間サマリーを移行
  var summaries = await getMonthlySummariesByPatient(sourceId);
  for (var i = 0; i < summaries.length; i++) {
    var s = summaries[i];
    // ターゲット側に同月サマリーがあればスキップ
    var existing = await getMonthlySummary(targetId, s.year, s.month);
    if (!existing) {
      s.patientId = targetId;
      await putMonthlySummary(s);
    }
    await deleteMonthlySummary(sourceId, s.year, s.month);
  }

  // 3. 予約を移行
  var appointments = await getAppointmentsByPatient(sourceId);
  for (var i = 0; i < appointments.length; i++) {
    var a = appointments[i];
    a.patientId = targetId;
    // 同一患者・同一天の予約があればスキップ
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

  // 4. ソース患者の名前をコピー（ターゲットに名前がない場合のみ）
  var sourcePat = await getPatient(sourceId);
  var targetPat = await getPatient(targetId);
  if (!targetPat) {
    // ターゲット患者がいなければ作成
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

  // 5. ソース患者を削除
  // 読み・サマリー・予約は既に移行済みなので、cascade不要
  await prom(tx('patients', 'readwrite').delete(sourceId));
}

/* ---- 名前の一括適用 ---- */

function confirmApplyName(issue, correctName) {
  var msg = '以下の患者の名前を「' + correctName + '」に統一します:\n';
  for (var i = 0; i < issue.patients.length; i++) {
    msg += '  ' + issue.patients[i].id + ' (' + esc(issue.patients[i].name || '(なし)') + ')\n';
  }
  msg += '\nよろしいですか？';

  confirmAsync('名前統一確認', msg).then(function(ok) {
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
  ).then(function(ok) {
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
