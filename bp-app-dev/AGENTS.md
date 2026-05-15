# AGENTS.md — bp-app-dev/

**Parent:** [blood-pressure-app/](../AGENTS.md)

## OVERVIEW
Source modules for the Blood Pressure Monitor. Rebuilt via `build.bat` (or `node /tmp/build.js`) into the single-file `../bp-app.html`.

## STRUCTURE

```
bp-app-dev/
├── index.html   ← HTML skeleton (head + body divs, no inline data)
├── style.css    ← All visual styles (responsive, print-ready)
├── db.js        ← IndexedDB layer: patients, readings, monthly_summaries
├── chart.js     ← Canvas 2D graphing: 8-item time-series chart
├── csv.js       ← CSV parse/serialize + JSON backup/restore
└── app.js       ← Main application logic (init, UI, CRUD, navigation)
```

## WHERE TO LOOK

| Change | File |
|--------|------|
| DB schema migration | db.js |
| Add/edit/delete queries | db.js |
| Graph lines / colors / tooltip | chart.js |
| Visit BP toggle logic | chart.js + app.js |
| CSV column mapping | csv.js |
| Screen transitions / navigation | app.js |
| Button event wiring | app.js |
| Visit input form fields | app.js + index.html |
| CSS layout / colors / fonts | style.css |
| DOM element IDs used by JS | index.html |

## CONVENTIONS

- **No ES6 in app.js**: Uses `var`, `function()`, `for (var i = 0...)` for `file://` browser compatibility.
- **ES6 allowed** in db.js, chart.js, csv.js: `const`, `let`, arrow functions.
- **All functions are global** (no IIFE/module pattern) — required since they're bundled into a single `<script>` tag.
- **Null checks everywhere**: `$('id')` returns null if element missing; every access is guarded.
- **Compound index keys** are arrays: `[patientId, date]` — never pipe-string.
- **DB version**: Must be integer. Increment to trigger `onupgradeneeded`.

## ANTI-PATTERNS

- Do NOT add new global variables to `app.js` — conflicts with bundle.
- Do NOT use `async` on `init()` without updating `openDBSync` Promise chain.
- Do NOT modify `index.html` body content — it's a skeleton only.

## NOTES

- 6 files, ~1050 lines total (app.js ~1050, chart.js ~262).
- `build.bat` uses PowerShell; `node /tmp/build.js` for Linux.
- No test framework — manual E2E via Playwright scripts.
- Graph has 8 configurable items; visit SBP/DBP can be toggled via checkbox.