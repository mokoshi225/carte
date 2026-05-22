@echo off
cd /d "%~dp0"
echo [build-companion] Compiling EMR Watcher...

set CSC="%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist %CSC% set CSC="%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist %CSC% (
  echo [ERROR] C# compiler not found!
  pause
  exit /b 1
)
echo Compiler: %CSC%

set GAC=C:\Windows\Microsoft.NET\assembly
set UIA_REF=
set UIA_TYPES_REF=
set WBASE_REF=

REM ---- Find UIAutomationClient.dll ----
set BASE32=C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework
set BASE64=C:\Program Files\Reference Assemblies\Microsoft\Framework\.NETFramework
if exist "%BASE32%\v4.8\UIAutomationClient.dll" set UIA_REF="%BASE32%\v4.8\UIAutomationClient.dll"
if exist "%BASE32%\v4.7.2\UIAutomationClient.dll" set UIA_REF="%BASE32%\v4.7.2\UIAutomationClient.dll"
if exist "%BASE32%\v4.7.1\UIAutomationClient.dll" set UIA_REF="%BASE32%\v4.7.1\UIAutomationClient.dll"
if exist "%BASE32%\v4.7\UIAutomationClient.dll" set UIA_REF="%BASE32%\v4.7\UIAutomationClient.dll"
if exist "%BASE32%\v4.6.2\UIAutomationClient.dll" set UIA_REF="%BASE32%\v4.6.2\UIAutomationClient.dll"
if exist "%BASE32%\v4.6.1\UIAutomationClient.dll" set UIA_REF="%BASE32%\v4.6.1\UIAutomationClient.dll"
if exist "%BASE32%\v4.6\UIAutomationClient.dll" set UIA_REF="%BASE32%\v4.6\UIAutomationClient.dll"
if exist "%BASE64%\v4.8\UIAutomationClient.dll" set UIA_REF="%BASE64%\v4.8\UIAutomationClient.dll"
if exist "%BASE64%\v4.7.2\UIAutomationClient.dll" set UIA_REF="%BASE64%\v4.7.2\UIAutomationClient.dll"
if exist "%BASE64%\v4.7.1\UIAutomationClient.dll" set UIA_REF="%BASE64%\v4.7.1\UIAutomationClient.dll"
if exist "%BASE64%\v4.7\UIAutomationClient.dll" set UIA_REF="%BASE64%\v4.7\UIAutomationClient.dll"
if "%UIA_REF%"=="" (
  if exist "%GAC%\GAC_MSIL\UIAutomationClient" for /r "%GAC%\GAC_MSIL\UIAutomationClient" %%f in (UIAutomationClient.dll) do if exist "%%f" set UIA_REF="%%f"
)

REM ---- Find UIAutomationTypes.dll ----
if exist "%BASE32%\v4.8\UIAutomationTypes.dll" set UIA_TYPES_REF="%BASE32%\v4.8\UIAutomationTypes.dll"
if exist "%BASE32%\v4.7.2\UIAutomationTypes.dll" set UIA_TYPES_REF="%BASE32%\v4.7.2\UIAutomationTypes.dll"
if exist "%BASE32%\v4.6.1\UIAutomationTypes.dll" set UIA_TYPES_REF="%BASE32%\v4.6.1\UIAutomationTypes.dll"
if "%UIA_TYPES_REF%"=="" (
  if exist "%GAC%\GAC_MSIL\UIAutomationTypes" for /r "%GAC%\GAC_MSIL\UIAutomationTypes" %%f in (UIAutomationTypes.dll) do if exist "%%f" set UIA_TYPES_REF="%%f"
)

REM ---- Find WindowsBase.dll ----
if "%WBASE_REF%"=="" (
  if exist "%GAC%\GAC_MSIL\WindowsBase" for /r "%GAC%\GAC_MSIL\WindowsBase" %%f in (WindowsBase.dll) do if exist "%%f" set WBASE_REF="%%f"
)

if "%UIA_REF%"=="" (
  echo [ERROR] UIAutomationClient.dll not found!
  pause
  exit /b 1
)
if "%UIA_TYPES_REF%"=="" (
  echo [ERROR] UIAutomationTypes.dll not found!
  pause
  exit /b 1
)
if "%WBASE_REF%"=="" (
  echo [ERROR] WindowsBase.dll not found!
  pause
  exit /b 1
)
echo References:
echo   UIA Client: %UIA_REF%
echo   UIA Types:  %UIA_TYPES_REF%
echo   WinBase:    %WBASE_REF%

%CSC% /target:exe /reference:%UIA_REF% /reference:%UIA_TYPES_REF% /reference:%WBASE_REF% /reference:System.Core.dll /out:emr-watcher-v2.5.exe emr-watcher-v2.5.cs

if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Compile failed. Code: %ERRORLEVEL%
  pause
  exit /b %ERRORLEVEL%
)

echo [SUCCESS] emr-watcher-v2.5.exe generated:
dir emr-watcher-v2.5.exe
echo.
echo Usage:
echo   1. Copy emr-watcher-v2.5.exe + bp-app.html to USB
echo   2. Double-click emr-watcher.exe (or rename as needed)
echo   3. Open bp-app.html in browser
echo   4. Ctrl+C to stop
pause
