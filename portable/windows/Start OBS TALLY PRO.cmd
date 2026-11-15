@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bridge-launcher.ps1"
if errorlevel 1 (
 echo.
 echo Bridge did not start. Review the error above.
 pause
)
