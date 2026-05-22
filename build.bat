@echo off
REM build.bat — bp-app-dev/ → bp-app.html（単一HTML結合版）
REM 使い方: このファイルを blood-pressure-app/ フォルダ内でダブルクリック
chcp 65001 >nul
cd /d "%~dp0"
setlocal enabledelayedexpansion

set OUT=bp-app.html
set DIR=bp-app-dev

echo [build.bat] 単一HTMLに結合中...

powershell -NoProfile -Command ^
  "& {" ^
  "  $html = [System.IO.File]::ReadAllText('%DIR%\index.html');" ^
  "  $css  = [System.IO.File]::ReadAllText('%DIR%\style.css');" ^
  "  $js   = '';" ^
  "  foreach($f in @('db.js','chart.js','csv.js','app.js','cleanup.js')) {" ^
  "    $js += [Environment]::NewLine + [System.IO.File]::ReadAllText(\"%DIR%\" + \"\\\" + $f);" ^
  "  }" ^
  "  $html = $html -replace '<link rel=\"stylesheet\" href=\"style.css\">', \"<style>`n\" + $css + \"`n</style>\";" ^
  "  $js = $js -replace '\$', '$$$$'; $html = $html -replace '<script id=\"app-bundle\">[\s\S]*?</script>', '<script>' + $js + '</script>';" ^
  "  [System.IO.File]::WriteAllText('%OUT%', $html);" ^
  "  Write-Host ('完了: ' + (Get-Item '%OUT%').FullName);" ^
  "  Write-Host ('サイズ: ' + (Get-Item '%OUT%').Length + ' bytes');" ^
  "}"

echo.
echo [完了] %OUT% を生成しました。
goto :eof