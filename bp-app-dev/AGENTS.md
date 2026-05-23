# AGENTS.md — bp-app-dev/

**Parent:** [blood-pressure-app/](../AGENTS.md)

## OVERVIEW
Source modules for the Blood Pressure Monitor. Rebuilt via `build.bat` (or `node /tmp/build.js`) into the single-file `../bp-app.html`.

## STRUCTURE

```
bp-app-dev/
├── index.html   ← HTML skeleton (head + body divs, no inline data)
├── style.css    ← All visual styles (responsive, print-ready)
├── state.js     ← 共有状態・定数・共通ユーティリティ（$・toast等）
├── db.js        ← IndexedDB layer: patients, readings, monthly_summaries
├── chart.js     ← Canvas 2D graphing: 8-item time-series chart
├── csv.js       ← CSV parse/serialize + JSON backup/restore
├── soap.js      ← SOAP出力・評価サマリー編集・差分追記
├── app.js       ← Main application logic (init, UI, CRUD, navigation)
└── cleanup.js   ← データクレンジングモジュール（不整合検出・編集）
```

## MODULE ARCHITECTURE

全モジュールは IIFE でラップされ、`BPApp` 名前空間に公開APIを持つ。
後方互換性のため全関数は `window` にもグローバル公開されている。

| 名前空間 | ファイル | 公開API |
|---------|---------|--------|
| — | `state.js` | グローバル状態変数 + `State` オブジェクト（get/set/on/emit）+ 共通ユーティリティ（`$`, `esc`, `fmtDate`, `toast`, `showScreen` 等） |
| `BPApp.DB` | `db.js` | `openDB`, `getPatient`, `getAllPatients`, `putPatient`, `deletePatient`, `getReadingsByPatient`, `getReadingsByPatientInMonth`, `getReadingByDate`, `putReading`, `deleteReading`, `getLatestReading`, `getAllReadings`, `getMonthlySummary`, `putMonthlySummary`, `deleteMonthlySummary`, `getMonthlySummariesByPatient`, `getAppointment`, `getAppointmentsByPatient`, `getAppointmentsByDate`, `getAppointmentsByDateRange`, `getUpcomingAppointment`, `putAppointment`, `deleteAppointment`, `getAllAppointments`, `cancelAppointment`, `markAppointmentDone`, `getDaySetting`, `putDaySetting`, `getDaySettingsByDateRange`, `deleteDaySetting` |
| `BPApp.Chart` | `chart.js` | `drawGraph`, `setupTooltip`, `BP_ITEMS`, `GRAPH` |
| `BPApp.CSV` | `csv.js` | `parseCSVLine`, `parseCSV`, `recordsToCSV`, `downloadFile`, `backupToJSON`, `parseBackupJSON` |
| `BPApp.Soap` | `soap.js` | `autoResizeTextarea`, `lineDiff`, `renderAssessmentSection`, `handleUpdateSummary`, `getFormValue`, `buildHomeBPString`, `updateSoapOutput`, `copySoapOutput` |
| `BPApp.App` | `app.js` | `init`, `initIdScreen`, `renderPatientPage`, `renderView`, `navigateToPatient`, `registerReading`, `openDBSync` |
| `BPApp.Cleanup` | `cleanup.js` | `openDataCleanup`, `closeCleanup`, `runCleanupCheck`, `mergePatientInto` |

※ 各IIFEは関数を `window` にも公開する（後方互換）。新規コードは `BPApp.XXX.func()` 経由の利用を推奨。

## WHERE TO LOOK

| Change | File |
|--------|------|
| Shared state / globals | state.js |
| DB schema migration | db.js |
| Add/edit/delete queries | db.js |
| Graph lines / colors / tooltip | chart.js |
| Visit BP toggle logic | chart.js + app.js |
| CSV column mapping | csv.js |
| SOAP/A-section logic | soap.js |
| Screen transitions / navigation | app.js |
| Button event wiring | app.js |
| Visit input form fields | app.js + index.html |
| CSS layout / colors / fonts | style.css |
| DOM element IDs used by JS | index.html |
| Data cleanup logic / merge | cleanup.js |
| Data cleanup screen HTML | index.html（screen-cleanup） |
| Data cleanup styles | style.css（.cleanup-*） |

## CONVENTIONS

- **All files use IIFE (Immediately Invoked Function Expression)** for module encapsulation.
- **Global backward compatibility**: Each IIFE assigns public functions to `window`.
- **`state.js`** is NOT IIFE-wrapped; it declares globals at top level (must be first in build order).
- **app.js uses `var`/`function`** (no ES6) for `file://` browser compatibility.
- **ES6 allowed** in db.js, chart.js, csv.js, soap.js: `const`, `let`, arrow functions.
- **Null checks everywhere**: `$('id')` returns null if element missing; every access is guarded.
- **Compound index keys** are arrays: `[patientId, date]` — never pipe-string.
- **DB version**: Must be integer. Increment to trigger `onupgradeneeded`.
- **コード変更前に `failure.md` を読むこと** — 過去の障害とその対策を把握してから作業すること。
- **コードに修正を加えたら、バージョン情報を更新すること**:
  - `app.js` 内の `$('header-info').textContent` 、`$('app-version')`、`$('app-version-footer')` のバージョン文字列
  - `index.html` のバージョン履歴テーブルに新しい行を追加（日付・変更内容）

## ANTI-PATTERNS

- Do NOT add new global variables directly — use `State.set()` or add to `state.js`.
- Do NOT use `async` on `init()` without updating Promise chain.
- Do NOT modify `index.html` body content — it's a skeleton only.
- Do NOT use `import`/`export` — must be `file://` compatible.

## NOTES

- 8 files, ~3700 lines total.
- Build order: `state.js → db.js → chart.js → csv.js → soap.js → app.js → cleanup.js`
- `build.bat` uses PowerShell; `node /tmp/build.js` for Linux.
- No test framework — manual E2E via Playwright scripts.
- Graph has 8 configurable items; visit SBP/DBP can be toggled via checkbox.