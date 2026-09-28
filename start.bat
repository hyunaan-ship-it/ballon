@echo off
title Balloon Popping Game Server
echo ===================================================
echo      Real-Time Motion Balloon Popping Game
echo ===================================================
echo.

:: Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org to play.
    echo.
    pause
    exit /b
)

:: Check if node_modules exists, if not run npm install
if not exist "node_modules\" (
    echo [INFO] Installing required packages. Please wait...
    call npm install
    echo [SUCCESS] Package installation complete!
    echo.
)

:: Automatically open the Host PC game board in the default browser
echo [INFO] Opening the main game board in your default web browser...
start http://localhost:3000

:: Start the node server
echo [INFO] Starting the real-time game server...
node server.js

pause
