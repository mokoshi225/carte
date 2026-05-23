/* =================================================================
   csv.js — CSV入出力モジュール v3.0.0
   ================================================================= */

BPApp.CSV = (function () {

  /** CSV パース（RFC 4180準拠、簡易版） */
  function parseCSVLine(line) {
    const result = [];
    let current = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuote) {
        if (c === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
          else inQuote = false;
        } else {
          current += c;
        }
      } else {
        if (c === '"') { inQuote = true; }
        else if (c === ',') { result.push(current.trim()); current = ''; }
        else { current += c; }
      }
    }
    result.push(current.trim());
    return result;
  }

  /**
   * CSV文字列をパースしてレコード配列に変換
   * @param {string} text - CSVテキスト
   * @returns {{patientId, name, date, systolic, diastolic, note}[]}
   */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (cols.length < 5) continue;
      const patientId = cols[0];
      const name = cols[1] || '';
      const date = cols[2];
      const systolic = Number(cols[3]);
      const diastolic = Number(cols[4]);
      const note = cols[5] || '';

      if (!patientId || !date || isNaN(systolic) || isNaN(diastolic)) continue;
      records.push({ patientId, name, date, systolic, diastolic, note });
    }
    return records;
  }

  /**
   * 測定データ配列をCSV文字列に変換
   * @param {{patientId, name?, date, systolic, diastolic, note?}[]} records
   * @returns {string} BOM付きUTF-8 CSV
   */
  function recordsToCSV(records) {
    let csv = '\ufeff患者ID,患者氏名,測定日,収縮期,拡張期,メモ,体重\n';
    records.forEach(r => {
      const name = r.name ? `"${r.name}"` : '';
      const note = r.note ? `"${r.note}"` : '';
      csv += `${r.patientId},${name},${r.date},${r.systolic},${r.diastolic},${note},${r.weight || 0}\n`;
    });
    return csv;
  }

  /**
   * ファイルダウンロード
   * @param {string} content
   * @param {string} filename
   * @param {string} [mime='text/csv']
   */
  function downloadFile(content, filename, mime) {
    if (mime === undefined) mime = 'text/csv';
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  /**
   * JSONバックアップ生成
   * @param {object} data - { patients: [], readings: [] }
   * @returns {string}
   */
  function backupToJSON(data) {
    return JSON.stringify(data, null, 2);
  }

  /**
   * JSONバックアップ解析
   * @param {string} text
   * @returns {{patients: [], readings: []}|null}
   */
  function parseBackupJSON(text) {
    try {
      const data = JSON.parse(text);
      if (data && (Array.isArray(data.patients) || Array.isArray(data.readings))) {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }

  /* ---- グローバル公開（後方互換性） ---- */

  window.parseCSVLine = parseCSVLine;
  window.parseCSV = parseCSV;
  window.recordsToCSV = recordsToCSV;
  window.downloadFile = downloadFile;
  window.backupToJSON = backupToJSON;
  window.parseBackupJSON = parseBackupJSON;

  /* ---- 公開API ---- */

  return {
    parseCSVLine: parseCSVLine,
    parseCSV: parseCSV,
    recordsToCSV: recordsToCSV,
    downloadFile: downloadFile,
    backupToJSON: backupToJSON,
    parseBackupJSON: parseBackupJSON
  };

})();
