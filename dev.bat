@echo off
REM RestoreAssist - Unified Development Environment Startup
REM This script starts both the Drive Resolver and Next.js dev server

echo ========================================
echo RestoreAssist - Development Environment
echo ========================================
echo.

REM Start Drive Resolver
echo [1/2] Starting Google Drive Resolver...
cd docker
call docker-compose up -d drive-resolver
cd ..

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to start Drive Resolver
    pause
    exit /b 1
)

echo [OK] Drive Resolver started
echo.

REM Wait for service to be ready
echo Waiting for Drive Resolver to be ready...
timeout /t 5 /nobreak >nul

REM Health check
curl -s http://localhost:5000/health >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Drive Resolver is healthy
) else (
    echo [WARNING] Drive Resolver may not be ready yet
)

echo.
echo [2/2] Starting Next.js development server...
echo.
echo ========================================
echo Services:
echo - Drive Resolver: http://localhost:5000
echo - Next.js App:    http://localhost:3000
echo ========================================
echo.

REM Start Next.js
npm run dev
