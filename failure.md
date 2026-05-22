# failure.md — 障害記録

このファイルは本プロジェクトで過去に発生した障害の記録です。
コードに変更を加える前に必ず一読してください。
新たな障害が発生した場合は本ファイルに追記します。

---

## 障害#001: ビルド時の `$&` 展開によるJS構文破壊

### 発生日
2026-05-21

### 症状
- `bp-app.html` をブラウザで開くと `Uncaught SyntaxError: Invalid or unexpected token`
- エラー箇所はJSコードの途中に `<script id="app-bundle">` が挿入されている

### 原因

**根本原因**: ビルドスクリプト (`/tmp/build.js`, `build.bat`) で `String.prototype.replace()` / PowerShell `-replace` を使用してプレースホルダを置換していたが、これらの置換メソッドは置換文字列中の `$&`, `$1`〜`$99`, `$``, `$'`, `$_`, `$+` を特殊パターンとして解釈する。

**トリガー**: `bp-app-dev/cleanup.js` に `'\\$&'` (JavaScriptの正規表現置換パターン `\$&`) が含まれていたため、ビルド時に `$&` → 「マッチした部分全体（＝プレースホルダ全体）」に展開された。

**結果**: JSコードの文字列リテラル内にプレースホルダの中身が埋め込まれ、文字列が破壊されてSyntaxErrorが発生した。

### 対策

#### 実施した修正

1. **`/tmp/build.js`** (Linux ビルド):
   - `replace()` の第二引数を文字列から関数コールバックに変更
   - 関数コールバック内で返した文字列は `$&` 等の解釈を受けない
   ```javascript
   // Before (BAD)
   html.replace(/<script id="app-bundle">[\s\S]*?<\/script>/, '<script>' + js + '</script>')
   // After (GOOD)
   html.replace(/<script id="app-bundle">[\s\S]*?<\/script>/, function() { return '<script>' + js + '</script>'; })
   ```

2. **`build.bat`** (Windows PowerShell ビルド):
   - `$js` 結合後に `$` → `$$` エスケープを追加
   - 後続の `-replace` での解釈を防止
   ```powershell
   # Before (BAD)
   $html = $html -replace '...', '<script>' + $js + '</script>'
   # After (GOOD)
   $js = $js -replace '\$', '$$$$'
   $html = $html -replace '...', '<script>' + $js + '</script>'
   ```

#### 再発防止策

1. **本ファイル (`failure.md`)** をコード変更前に読むこと（AGENTS.md に記載）
2. **ビルド後にJS構文チェックを通すこと**:
   ```bash
   node -e "const fs=require('fs');const m=fs.readFileSync('bp-app.html','utf8').match(/<script>([\s\S]*?)<\/script>/);try{new Function(m[1]);console.log('OK')}catch(e){console.log('FAIL:'+e.message)}"
   ```
3. `String.prototype.replace()` でJSコードを置換文字列に使う場合は関数コールバックを使うこと
4. PowerShell `-replace` でJSコードを置換文字列に使う場合は事前に `$` を `$$` にエスケープすること

### 備考

- `$&` 以外にも `$1`〜`$99`（キャプチャグループ参照）、`$``（マッチ前）、`$'`（マッチ後）、`$_`（入力全体）、`$+`（最後にキャプチャされたグループ）も同様の原因になります
- 本件は `cleanup.js` の `pid.replace(/[."\\\/\[\]]/g, '\\$&')` がトリガーでした
