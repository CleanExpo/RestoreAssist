@echo off
REM Google Drive Resolver - Automated Startup Script for Windows
REM This script handles startup, health checks, and error recovery

echo ========================================
echo Google Drive Resolver - Automated Start
echo ========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker is not running!
    echo Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo Waiting for Docker to start...
    timeout /t 30 /nobreak >nul

    REM Check again
    docker info >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to start Docker. Please start Docker Desktop manually.
        pause
        exit /b 1
    )
)

echo [OK] Docker is running
echo.

REM Navigate to docker directory
cd /d "%~dp0.."

REM Check if credentials exist
if not exist "drive-resolver\credentials\drive_service_account.json" (
    echo [ERROR] Service account credentials not found!
    echo Expected: drive-resolver\credentials\drive_service_account.json
    echo.
    echo Please add your Google service account JSON file.
    pause
    exit /b 1
)

echo [OK] Credentials found
echo.

REM Stop existing container if running
echo Checking for existing container...
docker ps -a --filter "name=restoreassist-drive-resolver" --format "{{.Names}}" | findstr "restoreassist-drive-resolver" >nul
if %ERRORLEVEL% EQU 0 (
    echo Stopping existing container...
    docker-compose stop drive-resolver >nul 2>&1
    docker-compose rm -f drive-resolver >nul 2>&1
)

REM Start the service
echo Starting Google Drive Resolver service...
docker-compose up -d drive-resolver

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to start service
    pause
    exit /b 1
)

echo.
echo Waiting for service to be ready...
timeout /t 5 /nobreak >nul

REM Health check
echo Testing health endpoint...
curl -s http://localhost:5000/health >nul 2>&1

if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Service may not be ready yet
    echo Waiting additional 10 seconds...
    timeout /t 10 /nobreak >nul

    curl -s http://localhost:5000/health >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Service failed to start properly
        echo.
        echo View logs with: docker-compose logs drive-resolver
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo SUCCESS! Service is running
echo ========================================
echo.
echo Service URL: http://localhost:5000
echo Container: restoreassist-drive-resolver
echo.
echo Quick Commands:
echo - View logs:  docker-compose logs -f drive-resolver
echo - Stop:       docker-compose down
echo - Restart:    docker-compose restart drive-resolver
echo.
echo Health check:
curl -s http://localhost:5000/health
echo.
echo.
echo Press any key to view logs (or close to continue)...
pause >nul

docker-compose logs -f drive-resolver
