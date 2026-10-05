@echo off
rem the folder and PATH set below stay inside this file: a cmd window that ran it is not left
rem in the app folder (Windows will not rename a folder in use, and an update renames it - 1.8.8)
setlocal
rem VerseOrchestrator - start the app on Windows: double-click this file.
rem Everything else happens in server\src\launcher.ts (the same on macOS and Linux).
rem A release folder (npm run portable, 0.14.0) keeps the app in app\ next to this file.
if exist "%~dp0app\start.cmd" (
  call "%~dp0app\start.cmd" %*
  exit /b
)
cd /d "%~dp0"
chcp 65001 >nul
rem a portable copy (npm run portable) carries its own Node, npm included
if exist "%~dp0node\node.exe" set "PATH=%~dp0node;%PATH%"
where node >nul 2>nul || goto nonode
call node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>=24||a===23&&b>=6||a===22&&b>=18?0:1)" || goto oldnode
call node --disable-warning=ExperimentalWarning server\src\launcher.ts %*
set VO_EXIT=%errorlevel%
if not "%VO_EXIT%"=="0" pause
exit /b %VO_EXIT%

:nonode
echo Не знайдено Node.js — він потрібен, щоб запустити VerseOrchestrator.
echo Встановіть Node.js 24 LTS з https://nodejs.org
echo (або в PowerShell: winget install OpenJS.NodeJS.LTS) і запустіть цей файл ще раз.
echo.
echo Node.js not found — VerseOrchestrator needs it to start.
echo Install Node.js 24 LTS from https://nodejs.org
echo (or in PowerShell: winget install OpenJS.NodeJS.LTS) and run this file again.
pause
exit /b 1

:oldnode
for /f "delims=" %%v in ('node -v') do set VO_NODE=%%v
echo Node.js %VO_NODE% застарий: потрібен 22.18 або новіший (краще 24 LTS) з https://nodejs.org
echo Node.js %VO_NODE% is too old: 22.18 or later is needed (24 LTS is better) from https://nodejs.org
pause
exit /b 1
