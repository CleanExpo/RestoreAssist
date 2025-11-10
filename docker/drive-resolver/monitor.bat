@echo off
REM Google Drive Resolver - Health Monitoring & Auto-Restart Script
REM This script monitors the service and auto-restarts if it fails

setlocal enabledelayedexpansion

echo ========================================
echo Drive Resolver Health Monitor
echo ========================================
echo Started at: %date% %time%
echo Check interval: 30 seconds
echo.
echo Press Ctrl+C to stop monitoring
echo ========================================
echo.

:monitor_loop

REM Check if container is running
docker ps --filter "name=restoreassist-drive-resolver" --format "{{.Names}}" | findstr "restoreassist-drive-resolver" >nul

if %ERRORLEVEL% NEQ 0 (
    echo [%date% %time%] [ERROR] Container not running! Attempting restart...
    cd /d "%~dp0.."
    docker-compose up -d drive-resolver
    timeout /t 10 /nobreak >nul
    goto check_health
)

REM Health check
curl -s http://localhost:5000/health >nul 2>&1

if %ERRORLEVEL% NEQ 0 (
    echo [%date% %time%] [ERROR] Health check failed! Restarting service...
    cd /d "%~dp0.."
    docker-compose restart drive-resolver
    timeout /t 10 /nobreak >nul
    goto check_health
)

echo [%date% %time%] [OK] Service healthy

REM Check cache size
for /f "tokens=*" %%i in ('curl -s http://localhost:5000/api/cache/stats') do set cache_stats=%%i
echo [%date% %time%] Cache: !cache_stats!

goto wait_and_loop

:check_health
REM Verify service is now healthy
timeout /t 5 /nobreak >nul
curl -s http://localhost:5000/health >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo [%date% %time%] [OK] Service recovered successfully
) else (
    echo [%date% %time%] [ERROR] Service failed to recover
    echo [%date% %time%] View logs: docker-compose logs drive-resolver
)

:wait_and_loop
timeout /t 30 /nobreak >nul
goto monitor_loop
