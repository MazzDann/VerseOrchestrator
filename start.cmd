@echo off
rem VerseOrchestrator - start the app on Windows: double-click this file.
rem Everything else happens in server\src\launcher.ts (the same on macOS and Linux).
cd /d "%~dp0"
chcp 65001 >nul
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
pause
exit /b 1

:oldnode
for /f "delims=" %%v in ('node -v') do set VO_NODE=%%v
echo Node.js %VO_NODE% застарий: потрібен 22.18 або новіший (краще 24 LTS) з https://nodejs.org
pause
exit /b 1
