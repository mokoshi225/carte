# AGENTS.md — Blood Pressure Monitor

**Generated:** 2026-05-21
**Commit:** cc16b64
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
├── failure.md           ← 障害記録（コード変更前に読むこと）
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
- **コード変更前に `failure.md` を読むこと** — 過去の障害とその対策を把握してから作業すること。
- **コードに修正を加えたら、バージョン情報を更新すること**:
  - `bp-app-dev/app.js` 内の `$('header-info').textContent` 、`$('app-version')`、`$('app-version-footer')` のバージョン文字列
  - `bp-app-dev/index.html` のバージョン履歴テーブルに新しい行を追加（日付・変更内容）

## ビルド注意

- ビルドスクリプトは `String.prototype.replace()` / PowerShell `-replace` でプレースホルダを置換する。
- JSコード内に `$&`, `$1`〜`$99`, `$``, `$'` が含まれると、これらが置換パターンとして解釈されコードが破壊される。
- **ビルド後は必ずJS構文チェックを通すこと**:
  ```bash
  node -e "const fs=require('fs');const m=fs.readFileSync('bp-app.html','utf8').match(/<script>([\s\S]*?)<\/script>/);try{new Function(m[1]);console.log('OK')}catch(e){console.log('FAIL:'+e.message)}"
  ```

## COMMANDS

```bash
build.bat                          # Windows: rebuild bp-app.html (PowerShell)
node /tmp/build.js                 # Linux: rebuild bp-app.html
```

## NOTES

- `bp-app-built.html` is a stale build artifact — `bp-app.html` is the current build target.
- Data stored in browser IndexedDB (`BloodPressureDB`). Not shared across machines.
- USB distribution workflow: copy `bp-app.html` only.
