@echo off
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies missing. Run pnpm install first.
  pause
  exit /b 1
)
echo HOKSE pilot: the available local URL will be printed below.
echo First use: create your developer account in the browser.
echo Keep this window open. Ctrl+C stops both services.
set "HOKSE_NODE=node"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "HOKSE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%HOKSE_NODE%" scripts\dev-pilot.mjs
pause
