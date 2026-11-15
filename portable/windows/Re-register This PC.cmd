@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bridge-launcher.ps1" -ResetPairing
if errorlevel 1 pause
