@echo off
setlocal
title Only_DA-Goal + Gambalator

cd /d "%~dp0"

python run_all.py
if errorlevel 1 (
  echo.
  echo The combined launcher stopped because of an error.
  pause
  exit /b 1
)
