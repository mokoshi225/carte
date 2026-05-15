# AGENTS.md — Blood Pressure Monitor

**Generated:** 2026-05-15
**Commit:** 847f6db
**Branch:** main

## OVERVIEW

Offline blood pressure tracking web app for clinic use. Single HTML file (`bp-app.html`) runs entirely in browser via `file://` protocol. No server, no install, no network.

## STRUCTURE

```
carte/
├── bp-app.html          ← Distribution: single-file build (USB-ready)
├── bp-app-built.html    ← Previous build artifact
├── build.bat            ← Windows build: concatenates bp-app-dev/ into bp-app.html
├── README.md            ← Project docs (Japanese)
├── spec-v0.3.html       ← Old spec
├── spec-v0.4.html       ← Current spec (draft)
├── capture-bp.js        ← Playwright capture script
├── bp-graph.png         ← Screenshot
└── bp-app-dev/          ← Source modules (see bp-app-dev/AGENTS.md)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Distribution build | `bp-app.html` | USB-deployable single file |
| Source code | `bp-app-dev/` | Split modules, rebuild via build.bat |
| Spec | `spec-v0.4.html` | Draft requirements |
| Build | `build.bat` | PowerShell concatenation |
| Screenshot generation | `capture-bp.js` | Playwright script |

## CONVENTIONS

- Japanese documentation for all user-facing content.
- No external dependencies (zero npm/CDN).
- `file://` protocol compatible: no ES modules, no fetch to other origins.
- Version tracked in `bp-app.html` footer + visible version history section.

## COMMANDS

```bash
build.bat                          # Windows: rebuild bp-app.html (PowerShell)
node /tmp/build.js                 # Linux: rebuild bp-app.html
```

## NOTES

- `bp-app-built.html` is a stale build artifact — `bp-app.html` is the current build target.
- Data stored in browser IndexedDB (`BloodPressureDB`). Not shared across machines.
- USB distribution workflow: copy `bp-app.html` only.
