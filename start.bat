@echo off
cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing dependencies, this only happens once...
    call npm install
)

echo Starting Bullish Tracker...
echo   Admin panel: http://localhost:3000
echo   API server:  http://localhost:7002
echo.
echo Close this window to stop the app.
echo.

call npm run dev

pause
