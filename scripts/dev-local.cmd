@echo off
setlocal

set "ROOT=%~dp0.."
set "NPM_CMD=D:\nvm4w\nodejs\npm.cmd"

if not exist "%NPM_CMD%" set "NPM_CMD=npm.cmd"

cd /d "%ROOT%"

netstat -ano | findstr ":8787" >nul
if errorlevel 1 (
  start "Dinner Order Server" cmd /k "cd /d %ROOT% && call %NPM_CMD% run dev:server"
) else (
  echo Server already running on http://localhost:8787
)

netstat -ano | findstr ":5173" >nul
if errorlevel 1 (
  echo Starting web on http://localhost:5173
  call %NPM_CMD% run dev:web
) else (
  echo Web already running on http://localhost:5173
)

endlocal
