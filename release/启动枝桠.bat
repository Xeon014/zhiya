@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0zhiya-server.ps1"
if errorlevel 1 (
  echo.
  echo Failed. Keep this file together with zhiya-server.ps1 and the html file.
  pause
)
