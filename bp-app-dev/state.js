/* =================================================================
   state.js — 共有状態管理モジュール
   全モジュール間で共有する状態変数と共通ユーティリティを集約
   ================================================================= */

// BPApp 名前空間
var BPApp = {};

/* ═══════════════════════════════════════════════════════
   状態変数（グローバル、後方互換性のため var で宣言）
   ═══════════════════════════════════════════════════════ */

var currentPatientId = null;
var currentView = 'all';
var editingId = null;
var _confirmResolve = null;
var _calYear = 0;
var _calMonth = 0;
var _calAppointments = [];
var toastTimer = null;
var _summaryPrevText = '';
var _parsedVisitRecords = null;
var _emrConnected = false;

/* ═══════════════════════════════════════════════════════
   定数
   ═══════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════
   共有アクセサ + 簡易イベント
   ═══════════════════════════════════════════════════════ */

var State = {
  get: function (key) { return window[key]; },
  set: function (key, val) { window[key] = val; this.emit('change:' + key, val); },
  _listeners: {},
  on: function (ev, fn) {
    if (!this._listeners[ev]) this._listeners[ev] = [];
    this._listeners[ev].push(fn);
  },
  emit: function (ev, data) {
    var fns = this._listeners[ev];
    if (fns) for (var i = 0; i < fns.length; i++) fns[i](data);
  }
};

/* ═══════════════════════════════════════════════════════
   共通ユーティリティ（全モジュールから利用）
   ═══════════════════════════════════════════════════════ */

/** DOM 要素ショートカット */
function $(id) { return document.getElementById(id); }

/** HTML エスケープ */
function esc(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

/** 日付 → YYYY-MM-DD */
function fmtDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** Clipboard copy (file:// 対応 execCommand フォールバック) */
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

/** Toast 通知 */
function toast(msg) {
  var t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2500);
}

/** Modal 表示/非表示 */
function showModal(id) { var el = $('modal-' + id); if (el) el.style.display = 'flex'; }
function hideModal(id) { var el = $('modal-' + id); if (el) el.style.display = 'none'; }

/** 画面切替 */
function showScreen(id) {
  var a = $('screen-id'), b = $('screen-patient'), c = $('screen-calendar');
  if (a) a.style.display = id === 'id' ? '' : 'none';
  if (b) b.style.display = id === 'patient' ? '' : 'none';
  if (c) c.style.display = id === 'calendar' ? '' : 'none';
}

/** 要素の表示/非表示 */
function showEl(id, show) {
  var el = $(id);
  if (el) el.style.display = show ? '' : 'none';
}
