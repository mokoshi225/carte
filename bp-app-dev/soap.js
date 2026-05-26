/* =================================================================
   soap.js — SOAP出力モジュール v3.0.0
   A（評価サマリー）編集・差分追記・SOAP出力生成
   ================================================================= */

BPApp.Soap = (function () {

  /* ---- public ---- */

  function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  function lineDiff(oldText, newText) {
    var oldLines = (oldText || '').split('\n');
    var newLines = (newText || '').split('\n');
    var added = [];
    var oldSet = {};
    for (var i = 0; i < oldLines.length; i++) oldSet[oldLines[i].trim()] = true;
    for (var i = 0; i < newLines.length; i++) {
      if (!oldSet[newLines[i].trim()]) added.push(newLines[i]);
    }
    return added.join('\n');
  }

  async function renderAssessmentSection() {
    var textarea = $('inp-summary-current');
    var historyEl = $('summary-history');
    if (!textarea) return;
    var statusEl = $('summary-status');
    if (statusEl) statusEl.textContent = '';

    try {
      var patient = await getPatient(currentPatientId);
      var summary = (patient && patient.summary) || '';
      textarea.value = summary;
      autoResizeTextarea(textarea);
      _summaryPrevText = summary;

      if (historyEl) {
        var html = '';
        if (patient && patient.soapHistory && patient.soapHistory.length > 0) {
          for (var i = 0; i < patient.soapHistory.length; i++) {
            var h = patient.soapHistory[i];
            html += '【' + h.date + '】' + h.text + '\n';
          }
        } else {
          html = '（まだ追記履歴はありません）';
        }
        historyEl.textContent = html;
      }

      textarea.style.color = '';
    } catch (e) {
      console.error('renderAssessmentSection error:', e);
    }
  }

  async function handleUpdateSummary() {
    var textarea = $('inp-summary-current');
    if (!textarea) return;
    var newText = textarea.value;
    var oldText = _summaryPrevText;

    if (newText === oldText) {
      toast('変更点がないため追記しませんでした');
      return;
    }

    var diffText = lineDiff(oldText, newText);
    if (!diffText.trim()) {
      toast('差分が検出できませんでした');
      return;
    }

    try {
      var patient = await getPatient(currentPatientId);
      if (!patient) { toast('患者が見つかりません'); return; }

      if (!patient.soapHistory) patient.soapHistory = [];
      patient.soapHistory.push({ date: fmtDate(new Date()), section: 'A', text: diffText });
      patient.summary = newText;
      patient.updatedAt = new Date().toISOString();
      await putPatient(patient);

      _summaryPrevText = newText;
      await renderAssessmentSection();
      updateSoapOutput();
      toast('サマリーを更新しました（差分を追記）');
    } catch (e) {
      console.error('handleUpdateSummary error:', e);
      toast('保存エラー');
    }
  }

  function getFormValue(id) { var el = $(id); return el ? el.value.trim() : ''; }

  function buildHomeBPString(avgSbp, avgDbp, minSbp, minDbp, maxSbp, maxDbp) {
    var parts = [];
    if (avgSbp || avgDbp) parts.push('平均' + (avgSbp || '?') + '/' + (avgDbp || '?'));
    if (minSbp || minDbp) {
      parts.push('最低' + (minSbp || '?') + '/' + (minDbp || '?'));
    }
    if (maxSbp || maxDbp) {
      parts.push('最高' + (maxSbp || '?') + '/' + (maxDbp || '?'));
    }
    return parts;
  }

  async function updateSoapOutput() {
    var soapEl = $('soap-output');
    if (!soapEl) return;

    var subjective = getFormValue('inp-subjective');
    var avgSbp = getFormValue('inp-avg-sbp');
    var avgDbp = getFormValue('inp-avg-dbp');
    var minSbp = getFormValue('inp-min-sbp');
    var minDbp = getFormValue('inp-min-dbp');
    var maxSbp = getFormValue('inp-max-sbp');
    var maxDbp = getFormValue('inp-max-dbp');

    var lines = [];

    // S
    lines.push('【S】' + (subjective || '（特記事項なし）'));

    var oDate = '';
    var oSbp = '';
    var oDbp = '';
    try {
      var latest = await getLatestReading(currentPatientId);
      if (latest) {
        oDate = latest.date;
        if (latest.systolic) oSbp = String(latest.systolic);
        if (latest.diastolic) oDbp = String(latest.diastolic);
      }
    } catch (e) {
      console.error('getLatestReading error:', e);
    }

    var oParts = ['【O】'];
    if (oDate) oParts.push(oDate);
    if (oSbp || oDbp) {
      oParts.push('受診時血圧');
      oParts.push((oSbp || '---') + '/' + (oDbp || '---') + 'mmHg');
    }
    // 浮腫
    var edemaVal = getFormValue('inp-edema');
    if (edemaVal !== '') {
      var edemaLabels = {'0':'なし','1':'軽度(1+)','2':'中等度(2+)','3':'高度(3+)','4':'著明(4+)'};
      oParts.push('浮腫 ' + (edemaLabels[edemaVal] || edemaVal));
    }
    lines.push(oParts.join(' '));

    var homeParts = buildHomeBPString(avgSbp, avgDbp, minSbp, minDbp, maxSbp, maxDbp);
    if (homeParts.length > 0) {
      lines.push('　　家庭血圧 ' + homeParts.join('、'));
    }

    var aLines = [];
    try {
      var patient = await getPatient(currentPatientId);
      if (patient && patient.soapHistory && patient.soapHistory.length > 0) {
        for (var i = 0; i < patient.soapHistory.length; i++) {
          var h = patient.soapHistory[i];
          if (h.section === 'A') {
            aLines.push('【' + h.date + '】' + h.text);
          }
        }
      }
    } catch (e) {
      console.error('updateSoapOutput A error:', e);
    }
    var aLine = '【A】' + (aLines.length > 0 ? '\n' + aLines.join('\n') : '（記載なし）');

    // P
    var nd = getFormValue('inp-next-date');
    var md = getFormValue('inp-medication-days');
    var pm = getFormValue('inp-appointment-memo');
    var pParts = [];
    if (md) pParts.push('処方 ' + md + '日分');
    if (pm) pParts.push(pm);
    if (nd) pParts.push('次回 ' + nd);
    var pLine = '【P】' + (pParts.length > 0 ? pParts.join('／') : '（未設定）');

    soapEl.textContent = lines.join('\n') + '\n' + aLine + '\n' + pLine;
  }

  async function copySoapOutput() {
    var soapEl = $('soap-output');
    if (!soapEl) return;
    var text = soapEl.textContent;
    if (!text) {
      toast('SOAPデータを生成中です…');
      return;
    }
    copyToClipboard(text);
    var statusEl = $('soap-status');
    if (statusEl) statusEl.textContent = '✅ コピーしました';
    setTimeout(function () { if (statusEl) statusEl.textContent = ''; }, 2500);
    toast('SOAPをクリップボードにコピーしました');
  }

  /* ---- グローバル公開（後方互換性） ---- */

  window.autoResizeTextarea = autoResizeTextarea;
  window.lineDiff = lineDiff;
  window.renderAssessmentSection = renderAssessmentSection;
  window.handleUpdateSummary = handleUpdateSummary;
  window.getFormValue = getFormValue;
  window.buildHomeBPString = buildHomeBPString;
  window.updateSoapOutput = updateSoapOutput;
  window.copySoapOutput = copySoapOutput;

  /* ---- 公開API ---- */

  return {
    autoResizeTextarea: autoResizeTextarea,
    lineDiff: lineDiff,
    renderAssessmentSection: renderAssessmentSection,
    handleUpdateSummary: handleUpdateSummary,
    getFormValue: getFormValue,
    buildHomeBPString: buildHomeBPString,
    updateSoapOutput: updateSoapOutput,
    copySoapOutput: copySoapOutput
  };

})();
