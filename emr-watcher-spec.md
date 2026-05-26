# EMR Watcher 仕様変遷

## 概要

EMR Watcher は、SSI e-カルテ（Windows クライアント）の「カルテ・オーダー入力」ウィンドウを UIA (UI Automation) で監視し、
表示中の患者IDと氏名を `emr-patient.json` / `emr-patient.js` に書き出す C# コンソールアプリケーション。
血圧管理アプリ `bp-app.html` の [EMR読込] ボタンからこのファイルを読み込むことで、患者切り替えを自動検出する。

---

## Phase 0: プレヒストリー — EMR連携の始まり (2026-05-21以前)

### 背景

血圧管理アプリ `bp-app.html` はもともと、患者を手動選択して血圧を記録するスタンドアロンアプリだった。
しかしクリニック业务で「カルテを見ている患者を自動検出して血圧記録したい」という要求が生まれた。

### 初期アーキテクチャ: JS自動ポーリング (v1.x)

最初の実装は**ブラウザ側の JavaScript** で `emr-patient.json` を `fetch()` で周期的にポーリングする方式だった。

```javascript
function startEmrFollow() {
    pollEmr();
}
function pollEmr() {
    fetch('emr-patient.json?t=' + Date.now())
        .then(r => r.json())
        .then(data => {
            if (data.patientId) navigateToPatient(data.patientId);
            setTimeout(pollEmr, 1500);
        })
        .catch(e => {
            setTimeout(pollEmr, 1500);
        });
}
```

**問題**: JSONファイルは手動で更新する必要があり、自動化されていなかった。また `file://` プロトコルでは `fetch()` がセキュリティエラーになる。

---

## Phase 1: 障害#002 — `file://` 問題 (2026-05-21)

### 発見

Chrome/Edge で `bp-app.html` を `file://` 経由で開くと、`fetch()` が `Unsafe attempt to load URL file://...` エラーでブロックされる。
1.5秒ごとにエラーがコンソールに出続け、アプリが壊れているように見える。

### 原因

Chrome は `file://` オリジンを「独自のセキュリティオリジン (unique security origin)」として扱い、
`fetch()` / `XMLHttpRequest` による同一ディレクトリ内のファイルへのアクセスをブロックする。

### 対策 (v2.3.0 / commit 57e3885)

1. **自動ポーリング `startEmrFollow()` / `pollEmr()` を完全廃止**
2. **手動「EMR読込」ボタンに変更** — ユーザーがクリックしたときだけ読み込む
3. **`<script>` タグ注入方式** に変更 — `fetch()` ではなく `<script src="emr-patient.js?t=...">` で読み込む
   - `script` タグは `file://` でも動作する
   - `window.EMR_PATIENT` グローバル変数にデータを受け渡す
4. **`file://` プロトコルチェック** を `startEmrFollow()` に追加 — `file:` 環境では完全停止

```javascript
function readEmrPatient() {
    var s = document.createElement('script');
    s.id = 'emr-script';
    s.src = 'emr-patient.js?t=' + Date.now();
    s.onload = function() {
        var data = window.EMR_PATIENT;
        if (data && data.patientId) {
            navigateToPatientAuto(data.patientId, data.patientName || '');
        }
    };
    document.body.appendChild(s);
}
```

**教訓**: `file://` 環境では `fetch()` / `XMLHttpRequest` を使ってはならない。
`<script>` タグ注入は `file://` でも動作する代替手段。

---

## Phase 2: C# UIA Watcher 誕生 — v2.4 (2026-05-21)

### 背景

「EMR読込」ボタンが手動では面倒。カルテを開いたら自動で血圧アプリに患者が反映されてほしい。
しかしブラウザ側では EMR ウィンドウを直接操作できない。そこで**C# の UI Automation (UIA) を使って
デスクトップ上の EMR ウィンドウを監視する** 常駐プログラムが生まれた。

### 探索フェーズ: uia-tree.cs / uia-probe.cs

本命の実装に先立ち、2つの探索ツールが作られた：

| ツール | 目的 | 発見 |
|---|---|---|
| `uia-tree.cs` | 対象ウィンドウのUIAツリーを構造化ダンプ | `lblKjName` (氏名)、`lblBirth` (生年月日) の AutomationId を特定 |
| `uia-probe.cs` | 全トップレベルウィンドウのプロパティを網羅 | ウィンドウタイトルに `[00000000]` (患者ID) が含まれることを発見 |

これらのツールで「カルテ・オーダー入力」ウィンドウ内の患者情報領域 `pnlKanHd` 配下に必要な全要素が
集約されていることが判明した。

`uia-probe.cs` は後に `build-probe.bat` と共に削除されたが、`uia-tree.cs` の知見は現在も生きている。
最新の UIA ツリーリファレンスは `uia-tree-20260526.md` を参照。

### v2.4 の設計 (commit 0c31cf1)

```csharp
// 検出戦略（優先順位順）:
// 1. "カルテ記載" ウィンドウの UIA 要素をスキャン
// 2. "カルテ・オーダー入力" ウィンドウの UIA 要素をスキャン
// 3. 全トップレベルウィンドウのタイトルから [00000000] (8桁ID) を正規表現で抽出
//    （例: "CITA Clinical Finder [00001234]"）
```

出力は単相（1回検出で即書き出し）:
```csharp
if (curId != _lastWrittenId) {
    WriteJson(curId, name);
    _lastWrittenId = curId;
}
```

### 問題点

1. **レースコンディション**: 患者切り替え時に UIA 要素の更新順序が不定。
   - `lblKanCode` (ID) が先に更新され、`lblKjName` (氏名) が古いまま → **新しいID + 古い氏名** を書き出す
   - `lblKanCode` を先に読むとレースに弱い
2. **複数ウィンドウ対応の複雑さ**: どのウィンドウがアクティブでも検出しようとするが、誤検出リスク
3. **パフォーマンス**: `FindAll(TreeScope.Descendants)` が3回実行され、初回ポーリングだけでも18秒

---

## Phase 3: v2.4a — lblKanCode 直接検索 (2026-05-22 commit 49b9c21)

### 改善点

- **AutomationId "lblKanCode"** の直接検索を追加 — これにより ID が正確に取得できるようになった
- フォールバック: `TreeWalker` で `lblKjName` の親コンテナ (`pnlKanHd`) まで遡り、
  その配下の Text 要素から8桁IDを探す
- 不要ファイル削除: `uia-probe.cs`, `uia-tree.cs`, `build-probe.bat`, `build-tree.bat`,
  `spec-v0.3.html`, `spec-v0.4.html`, `bp-graph.png` などを一掃

### 残存問題

- レースコンディション未対策（単相書き出しのまま）
- パフォーマンス問題未解決（3回の全子孫走査）

---

## Phase 4: v2.5 — 2相確認＋監視対象限定 (2026-05-22 commit 3538650)

### 改善点

1. **監視対象を「カルテ・オーダー入力」のみに限定**
   - 以前は「カルテ記載」「CITA Clinical Finder」なども対象
   - 誤検出を減らすため、運用で最も使われるカルテ・オーダー入力に絞った

2. **2相確認 (double-check / two-phase commit) を導入**
   - レースコンディション対策の核心
   - 1回目: `_pendingId` / `_pendingName` に保存（未確定）
   - 2回目: 同一 (ID, Name) ペアを確認できたら書き出し
   - 不一致なら pending をクリアして最初から

```csharp
// メインループのロジック
if (curId == _lastWrittenId) {
    // 同一患者 — 何もしない
    _pendingId = null;
    _pendingName = null;
}
else if (_pendingId == curId && _pendingName == curName) {
    // 2回連続確認 — 書き出し
    WriteJson(curId, curName);
    _lastWrittenId = curId;
}
else {
    // 初回検出 — pending
    _pendingId = curId;
    _pendingName = curName;
}
```

### 残存問題

**パフォーマンス**: `ScanWindowForPatient()` 内で 3回の `window.FindAll(TreeScope.Descendants, ...)` を実行。
カルテ・オーダー入力ウィンドウのUIAツリーは数百要素に及び、1回の全子孫走査に5〜7秒。
× 3回 = **15〜21秒（実測18秒）**。

ポーリング間隔が実質 **sleep 1秒 + 18秒 = 19秒** となり、患者を切り替えてから検出までが遅すぎた。

---

## Phase 5: v2.6 — Children ウォークによる高速化 (2026-05-26)

### 根本原因の特定

UIA ツリー解析の結果、以下の構造が判明：

```
Window "カルテ・オーダー入力"
  └── Pane [TopInformationContainer]   ← windowの直接子要素（同階層8個）
        └── Pane [pnlKanHd]            ← TopInformationContainerの直接子要素
              ├── Text [lblKanCode]    "00001724"      ← ★ 患者ID
              ├── Text [lblKjName]     "床波　健治"     ← ★ 患者氏名
              └── Text [lblBirth]      "昭和23年..."   ← ★ 生年月日
```

- `TopInformationContainer` と `pnlKanHd` はどちらも AutomationId を持つ
- 両者は window の直接子要素およびその直接子要素（同階層の要素はそれぞれ8個 / 2〜5個）
- `pnlKanHd` 内のサブツリーは10要素程度

### 修正内容

`FindAll(TreeScope.Descendants)`（全子孫走査）→ `FindAll(TreeScope.Children)`（同階層のみ）に変更：

```csharp
// BEFORE (遅い) — 3回の全子孫走査
var nameEls = window.FindAll(TreeScope.Descendants, lblKjName);   // 5-7秒
var idEls   = window.FindAll(TreeScope.Descendants, lblKanCode);  // 5-7秒
var birthEls = window.FindAll(TreeScope.Descendants, lblBirth);   // 5-7秒

// AFTER (高速) — Children で2段階ウォーク
var topInfoEls = window.FindAll(TreeScope.Children, TopInformationContainer);  // ミリ秒
var kanHdEls = topInfoEls[0].FindAll(TreeScope.Children, pnlKanHd);           // ミリ秒
kanHd.FindAll(TreeScope.Descendants, lblKanCode);  // ミリ秒（サブツリー10要素のみ）
kanHd.FindAll(TreeScope.Descendants, lblKjName);   // ミリ秒
kanHd.FindAll(TreeScope.Descendants, lblBirth);    // ミリ秒
```

### 効果

| 指標 | v2.5 (改善前) | v2.6 (改善後) |
|---|---|---|
| 初回ポーリング | ~19秒 (sleep1+走査18) | **~1-2秒** |
| 患者切替検出 | ~19秒 | **~1-2秒** |
| 2相確認完了 | ~38秒 | **~2-3秒** |

### フォールバック

`TopInformationContainer` または `pnlKanHd` が見つからない場合（EMRのバージョンやレイアウトが異なる場合）、
従来の `FindAll(TreeScope.Descendants)` による全走査にフォールバックする（`ScanWindowFullFallback()`）。

---

## 現在のアーキテクチャ全体図 (v2.6)

```
┌─────────────────────────────────────────────────────┐
│                   Windows デスクトップ                │
│                                                      │
│  ┌─────────────────────┐     ┌──────────────────┐   │
│  │  SSI e-カルテ       │     │  EMR Watcher     │   │
│  │  「カルテ・オーダー   │     │  (emr-watcher-   │   │
│  │   入力」             │     │   v2.6.exe)      │   │
│  │                     │◀────│  UIAで常時監視    │   │
│  │  pnlKanHd:          │     │  ポーリング1秒    │   │
│  │    lblKanCode      │     │  2相確認後書出    │   │
│  │    lblKjName       │     └────────┬─────────┘   │
│  └─────────────────────┘              │              │
│                                       ▼              │
│                              ┌──────────────────┐   │
│                              │ emr-patient.json │   │
│                              │ emr-patient.js   │   │
│                              └────────┬─────────┘   │
├─────────────────────────────────────────┼───────────┤
│                   ブラウザ               │           │
│  ┌──────────────────────────────────┐   │           │
│  │ bp-app.html                     │   │           │
│  │  [EMR読込] ボタン  ─────────────┼───┘           │
│  │  → <script src="emr-patient.js">│               │
│  │  → window.EMR_PATIENT を読込   │               │
│  │  → 該当患者に自動遷移          │               │
│  └──────────────────────────────────┘               │
└─────────────────────────────────────────────────────┘
```

### データフロー

1. **EMR Watcher**: 1秒ごとに「カルテ・オーダー入力」ウィンドウの `pnlKanHd` を監視
2. **2相確認**: 同一 (ID, Name) を2回連続確認 → レースコンディション排除
3. **ファイル書出**: `emr-patient.json`（機械可読）+ `emr-patient.js`（ブラウザ可読）
4. **ブラウザ読込**: [EMR読込] ボタン → `<script>` 注入 → `window.EMR_PATIENT` → 患者遷移

### ファイル構成

```
carte/
├── emr-watcher-v2.6.cs          ← C# ソース（メイン）
├── build-companion.bat           ← Windows コンパイルスクリプト
├── uia-tree-20260526.md          ← UIA ツリーリファレンス
├── emr-patient.json              ← 出力先（git管理外）
├── emr-patient.js                ← 出力先（git管理外）
└── emr-watcher.log               ← ログ（git管理外）
```

---

## 主要な設計判断の理由

### なぜ2相確認が必要か？

EMR の UI は患者切り替え時に要素を非同期的に更新する。典型的なレースパターン:

```
時間経過 →
lblKanCode: [旧ID]     → [新ID]     → [新ID]
lblKjName:  [旧氏名]   → [旧氏名]   → [新氏名]
                          ↑
                    この瞬間に読むと
                    新ID + 旧氏名を書出
```

2相確認はこの問題を「2回連続で同じ値が読めたら確定」で解決する。
v2.6 の高速化により、確認にかかる時間は実質約1-2秒になった。

### なぜ手動「EMR読込」ボタンなのか？

v2.5 で自動ポーリングは廃止された。理由:
1. `file://` 環境では `fetch()` が動作しない（障害#002）
2. `<script>` 注入は手動トリガーが安全
3. ユーザーが「今読み込みたい」タイミングで操作できる

実際の運用では、EMR Watcher が自動検出して `emr-patient.js` を更新し、
ユーザーが[EMR読込]ボタンを押すと最新データを読み込む、という半自動運用になる。

### なぜ TreeScope.Children が速いのか？

`FindAll(TreeScope.Descendants, condition)` は指定要素の**全子孫**を走査する。
カルテ・オーダー入力ウィンドウには数百の子孫要素があり、各要素のプロパティ読み取りに
COM 呼び出しが発生するため非常に低速。

一方 `FindAll(TreeScope.Children, condition)` は**直下の子要素のみ**をチェックする。
- window の子要素: 約8個
- TopInformationContainer の子要素: 約2〜5個

同階層の要素数が10未満であれば、FindAll は COM 呼び出し1回で完了する。

---

## 学びと知見

### UIA パフォーマンスの黄金則

1. **全子孫走査 (Descendants) は避けろ** — 数百要素のツリーで1回5〜7秒
2. **Children で段階的に降りろ** — 各階層の要素数が少なければミリ秒
3. AutomationId がある場合はそれを頼りに Children 検索せよ
4. どうしても Descendants が必要なら、サブツリーを小さく絞ってから実行せよ

### レースコンディション対策

- UIA 要素の読み取りはスナップショット単位ではアトミックだが、
  複数要素にまたがる読み取りはアトミックではない
- 「2相確認」のような楽観的ロックパターンが有効
- 可能なら単一要素から全情報を取得する（`lblKanCode` と `lblKjName` は別要素なので不可）

### バージョン互換性

- フォールバックパス（`ScanWindowFullFallback`）を常に残す
- EMR クライアントのバージョンアップで AutomationId やツリー構造が変わる可能性に備える
- ログを常に出して、どのパスを通ったか追跡可能にする

---

## 参考: 各バージョンの決定表

| バージョン | 日付 | 監視対象 | 確定方式 | 走査方式 | 所要時間 | レース対策 |
|---|---|---|---|---|---|---|
| v2.4 | 5/21 | 複数ウィンドウ | 単相 | Descendants × 2 | ~14秒 | なし |
| v2.4a | 5/22 | 複数ウィンドウ | 単相 | Descendants × 2 | ~14秒 | なし |
| v2.5 | 5/22 | カルテ・オーダーのみ | 2相確認 | Descendants × 3 | ~18秒 | あり |
| **v2.6** | **5/26** | **カルテ・オーダーのみ** | **2相確認** | **Children ウォーク** | **~1秒** | **あり** |

---

*最終更新: 2026-05-26*
*本ドキュメントは EMR Watcher の設計意図を記録し、将来のメンテナンスに役立てるためのものです。*
