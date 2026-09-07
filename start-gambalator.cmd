@echo off
setlocal
title Gambalator

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
  set "app_port=%GAMBALATOR_PORT%"
) else (
  set "app_port=5741"
)

echo Starting Gambalator at http://127.0.0.1:%app_port%
call mise run local
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo Gambalator could not be started.
pause
exit /b 1
