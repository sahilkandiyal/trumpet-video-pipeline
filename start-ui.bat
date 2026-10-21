@echo off
cd /d "%~dp0"
echo Starting Trumpet Video Tool...
start "" http://localhost:4000
call pnpm ui
pause
