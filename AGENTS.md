# AGENTS.md — Blood Pressure Monitor

**Generated:** 2026-05-24
**Commit:** f6831f3
**Branch:** main

## OVERVIEW

Offline blood pressure tracking web app for clinic use. 開発は `bp-app-dev/index.html` をブラウザで直接開く。
USB配布時は `node /tmp/build.js` で `bp-app.html` を生成する。No server, no install, no network.

## STRUCTURE

```
carte/
├── build.bat              ← Windows build: concatenates bp-app-dev/ into bp-app.html
├── build-companion.bat    ← EMR Watcher コンパイルスクリプト
├── emr-watcher-v2.5.cs    ← EMR Watcher C# ソース（UIAで監視）
├── README.md              ← Project docs (Japanese)
├── spec-v0.3.html         ← Old spec
├── spec-v0.4.html         ← Current spec (draft)
├── capture-bp.js          ← Playwright capture script
├── bp-graph.png           ← Screenshot
├── failure.md             ← 障害記録（コード変更前に読むこと）
├── reset-db.html          ← IndexedDBリセットツール
├── serve-wt               ← ワークツリーHTTPサーバー起動スクリプト
└── bp-app-dev/            ← Source modules (see bp-app-dev/AGENTS.md)
                            全モジュール IIFE + BPApp 名前空間でカプセル化
                            state.js: 共有状態 / soap.js: SOAP出力
```

- `bp-app.html` はビルド成果物（.gitignore対象）。USB配布時に `node /tmp/build.js` で生成する。

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Development | `bp-app-dev/index.html` | ブラウザで直接開く（file://可） |
| Distribution build | `bp-app.html` | USB-deployable single file（git管理外） |
| Source code | `bp-app-dev/` | Split modules, rebuild via build.bat |
| EMR Watcher (C#) | `emr-watcher-v2.5.cs` | 「カルテ・オーダー入力」のみUIA監視 |
| EMR Watcher ビルド | `build-companion.bat` | CSC.exe で emr-watcher をコンパイル |
| Spec | `spec-v0.4.html` | Draft requirements |
| Build | `build.bat` | PowerShell concatenation |
| Screenshot generation | `capture-bp.js` | Playwright script |
| 障害記録 | `failure.md` | コード変更前に必ず読む |

## CONVENTIONS

- Japanese documentation for all user-facing content.
- No external dependencies (zero npm/CDN).
- `file://` protocol compatible: no ES modules, **no `fetch()` to other origins**（障害#002参照）.
- `fetch()` または `XMLHttpRequest` を使うコードを追加する場合は `failure.md` の障害#002を確認し、`file://` 対応を考慮すること。
- Version tracked in `bp-app-dev/index.html` footer + `bp-app-dev/index.html` のバージョン履歴セクション。
- **コード変更前に `failure.md` を読むこと** — 過去の障害とその対策を把握してから作業すること。
- **コードに修正を加えたら、バージョン情報を更新すること**:
  - `bp-app-dev/app.js` 内の `$('header-info').textContent` 、`$('app-version')`、`$('app-version-footer')` のバージョン文字列
  - `bp-app-dev/index.html` のバージョン履歴テーブルに新しい行を追加（日付・変更内容）

## DEVELOPMENT WORKFLOW

### コード変更時のワークフロー（AI向け）

コードの修正・追加を依頼する場合、以下の選択を**AIが自動的にユーザーに問い合わせる**：

1. **ワークツリーが必要か？**: 修正が main ブランチ（本番）に直接影響するか、独立した開発用ブランチで行うか。
2. **サブエージェントが必要か？**: 作業量が多く並行処理したいか、単純な修正で即座に完了するか。

AIは「コードを修正して」という依頼を受けたら、以下の判断基準でワークツリーとサブエージェントの要不要をユーザーに確認すること：
- 複数ファイルに跨る変更 → ワークツリー推奨
- 単一ファイルの軽微な修正 → ワークツリー不要でも可
- バックグラウンドで実行可能な作業 → サブエージェント推奨
- ユーザーと対話しながら進める作業 → サブエージェント不要
- **サブエージェントの task description は必ず日本語で設定すること**（英語だと進捗がわかりにくいため）
3. **テスト用URLの提示**: コード変更が完了したら、`node /tmp/build.js` でビルドし、JS構文チェックを通した上で HTTP サーバーで `bp-app.html` を公開し、ダウンロード用URLをユーザーに示すこと。ポートは他ワークツリーと衝突しないよう空きポートを選ぶこと（例：8080, 8081...）。
4. **確認後削除**: ユーザーから確認（OK/ダウンロード完了）が得られたら、`bp-app.html` を削除し、HTTP サーバーを停止すること。ビルド成果物はワークツリーに置きっぱなしにしない。

```
main ──┬── worktree A（feature X）── rebase ──→ merge
       ├── worktree B（feature Y）── rebase ──→ merge
       ├── worktree C（bugfix Z） ── rebase ──→ merge
       └── …
```

- 各ワークツリーは `git worktree add <path> <branch>` で `main` から分岐する。
- 開発が完了したワークツリーから順に `main` にマージする。
- `main` は常に最新の統合ブランチとして維持する。

### コンフリクト対処ポリシー

`main` が先行して進んでいる場合、以下の手順で対処する：

1. **rebase 前提**: マージコミットを作らず、常に `git rebase main` でワークツリーのコミットを `main` の先頭に乗せ替える。
2. **コンフリクト発生時**:
   - `failure.md` の関連障害記録を確認する。
   - `main` の変更を尊重しつつ、ワークツリー側の変更意図を維持する。
   - コンフリクトの内容を行単位で分析し、両方の変更が正しく残るよう手動解決する。
   - 解決後は `git rebase --continue` で再開する。行き詰まったら `git rebase --abort` して方針を再検討する。
3. **fast-forward merge**: コンフリクト解決後、`main` に切り替えて `git merge --ff-only <branch>` で反映する。

### 注意点

- 同一ファイルでも**別の行**を変更しているなら rebase は自動成功する。
- 同じ関数の**同じ行**を変更している場合のみコンフリクトが発生する。その場合は main の変更をベースに、ワークツリーの変更を再適用する形で解決する。
- コンフリクト解決後は必ずビルド（`build.bat` / `node /tmp/build.js`）してJS構文チェックを通すこと。
- `main` ブランチは別ワークツリーでチェックアウト中の場合がある。その場合は `git push . HEAD:main` は使えず、`main` ワークツリーに移動してマージ操作を行う。

## ビルド注意

- ビルドスクリプトは `String.prototype.replace()` / PowerShell `-replace` でプレースホルダを置換する。
- JSコード内に `$&`, `$1`〜`$99`, `$``, `$'` が含まれると、これらが置換パターンとして解釈されコードが破壊される（障害#001参照）。
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
- `bp-app.html` と `bp-app-built.html` は .gitignore 対象。クローン後は `node /tmp/build.js` でビルドすること。
