@echo off
setlocal

for %%P in (5173 8787) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":%%P" ^| findstr "LISTENING"') do (
    taskkill /PID %%I /F >nul 2>nul
    echo Stopped process %%I on port %%P
  )
)

endlocal
