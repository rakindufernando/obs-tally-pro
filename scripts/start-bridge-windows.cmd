@echo off
cd /d "%~dp0.."
if not exist node_modules (
 echo Install dependencies first using npm install
 pause
 exit /b 1
)
echo Starting OBS TALLY PRO Bridge...
npm run dev:bridge
pause
