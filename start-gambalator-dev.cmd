@echo off
setlocal
title Gambalator Development

cd /d "%~dp0"

where mise >nul 2>&1
if errorlevel 1 (
  echo Gambalator requires mise: https://mise.jdx.dev/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing frontend dependencies for the first run...
  call mise run setup
  if errorlevel 1 goto :error
)

if defined GAMBALATOR_PORT (
  set "backend_port=%GAMBALATOR_PORT%"
) else (
  set "backend_port=5741"
)

if defined GAMBALATOR_DEV_PORT (
  set "dev_port=%GAMBALATOR_DEV_PORT%"
) else (
  set "dev_port=5173"
)

echo Starting Gambalator development mode at http://127.0.0.1:%dev_port%
echo DonationAlerts backend remains active at http://127.0.0.1:%backend_port%
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-gambalator-dev.ps1" -BackendPort %backend_port% -DevPort %dev_port%
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo Gambalator development mode could not be started.
pause
exit /b 1
