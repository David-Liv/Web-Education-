@echo off
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Run pnpm install in this folder first.
  pause
  exit /b 1
)
echo HOKSE local preview: http://127.0.0.1:5173/
echo Keep this window open. Press Ctrl+C to stop.
node node_modules\vite\bin\vite.js --host 127.0.0.1
pause
