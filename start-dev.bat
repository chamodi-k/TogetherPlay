@echo off
title TogetherPlay - Real-time Synchronized Video Watch Party
echo ========================================================
echo   TogetherPlay - Watch together. Even when you're apart.
echo ========================================================
echo.

if not exist node_modules (
    echo [1/3] Installing root dependencies...
    call npm install
)

if not exist server\node_modules (
    echo [2/3] Installing server dependencies...
    cd server
    call npm install
    cd ..
)

if not exist client\node_modules (
    echo [3/3] Installing client dependencies...
    cd client
    call npm install
    cd ..
)

echo.
echo Starting Backend Server on http://localhost:5000...
echo Starting Frontend Client on http://localhost:5173...
echo.
call npm run dev
pause
