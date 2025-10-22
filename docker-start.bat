@echo off
REM ============================================
REM RestoreAssist Docker Quick Start Script (Windows)
REM ============================================

setlocal enabledelayedexpansion

:MENU
cls
echo ============================================
echo RestoreAssist Docker Setup
echo ============================================
echo.
echo 1. Start Development Environment
echo 2. Start Production Environment
echo 3. Stop All Services
echo 4. View Logs
echo 5. Rebuild Images
echo 6. Database Backup
echo 7. Clean Up
echo 8. Exit
echo.

set /p choice="Select an option: "

if "%choice%"=="1" goto DEV
if "%choice%"=="2" goto PROD
if "%choice%"=="3" goto STOP
if "%choice%"=="4" goto LOGS
if "%choice%"=="5" goto REBUILD
if "%choice%"=="6" goto BACKUP
if "%choice%"=="7" goto CLEANUP
if "%choice%"=="8" goto EXIT

echo Invalid option
pause
goto MENU

:DEV
echo.
echo ============================================
echo Starting Development Environment
echo ============================================
echo.

REM Check if .env exists
if not exist .env (
    echo Creating .env file from template...
    copy .env.docker .env
    echo.
    echo Please edit .env file with your configuration
    echo Press any key when ready to continue...
    pause
)

echo Building images...
docker-compose build

echo Starting services...
docker-compose up -d

echo.
echo Waiting for services to be ready...
timeout /t 10 /nobreak

echo.
echo ============================================
echo Service Status
echo ============================================
docker-compose ps

echo.
echo ============================================
echo Access URLs
echo ============================================
echo Frontend: http://localhost:5173
echo Backend API: http://localhost:3001
echo Database Admin: http://localhost:8080 (run: docker-compose --profile tools up -d adminer)
echo.
echo View logs: docker-compose logs -f
echo Stop services: docker-compose down
echo.

pause
goto MENU

:PROD
echo.
echo ============================================
echo Starting Production Environment
echo ============================================
echo.

REM Check if .env exists
if not exist .env (
    echo Creating .env file from template...
    copy .env.docker .env
    echo.
    echo Please edit .env file with your configuration
    echo Press any key when ready to continue...
    pause
)

echo Building images...
docker-compose -f docker-compose.prod.yml build

echo Starting services...
docker-compose -f docker-compose.prod.yml up -d

echo.
echo Waiting for services to be ready...
timeout /t 10 /nobreak

echo.
echo ============================================
echo Service Status
echo ============================================
docker-compose -f docker-compose.prod.yml ps

echo.
echo ============================================
echo Access URLs
echo ============================================
echo Frontend: http://localhost
echo Backend API: http://localhost/api
echo Health Check: http://localhost/health
echo.

pause
goto MENU

:STOP
echo.
echo ============================================
echo Stopping Services
echo ============================================
echo.

docker-compose down
docker-compose -f docker-compose.prod.yml down 2>nul

echo Services stopped
pause
goto MENU

:LOGS
echo.
echo ============================================
echo Viewing Logs (Ctrl+C to exit)
echo ============================================
echo.

docker-compose logs -f

pause
goto MENU

:REBUILD
echo.
echo ============================================
echo Rebuilding Images
echo ============================================
echo.

set /p env_choice="Development or Production? (dev/prod): "

if "%env_choice%"=="prod" (
    docker-compose -f docker-compose.prod.yml build --no-cache
) else (
    docker-compose build --no-cache
)

echo Images rebuilt
pause
goto MENU

:BACKUP
echo.
echo ============================================
echo Creating Database Backup
echo ============================================
echo.

set TIMESTAMP=%date:~-4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_FILE=backups\backup_%TIMESTAMP%.sql

if not exist backups mkdir backups

docker exec restoreassist-postgres pg_dump -U restoreassist restoreassist > %BACKUP_FILE%

echo Backup created: %BACKUP_FILE%
pause
goto MENU

:CLEANUP
echo.
echo ============================================
echo Clean Up
echo ============================================
echo.
echo WARNING: This will remove all containers, networks, and volumes!
echo.

set /p confirm="Are you sure? (yes/no): "

if "%confirm%"=="yes" (
    docker-compose down -v
    docker-compose -f docker-compose.prod.yml down -v 2>nul
    docker system prune -f
    echo Cleanup complete
)

pause
goto MENU

:EXIT
echo.
echo Goodbye!
timeout /t 2 /nobreak
exit

:EOF
