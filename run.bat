@echo off
setlocal
chcp 65001 >nul
title CivicLens - LM Studio Edition
cd /d "%~dp0"
node --version >nul 2>&1 || (echo Node.js not found & pause & exit /b 1)
if not exist "node_modules" call npm.cmd install
if not exist ".next\BUILD_ID" call npm.cmd run build
echo Starting at http://localhost:3000
timeout /t 2 /nobreak >nul
start "" http://localhost:3000
call npm.cmd run start -- --port 3000 --hostname localhost
pause
