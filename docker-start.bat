@echo off
REM ================================
REM RestoreAssist Docker Quick Start Script
REM ================================
REM This script helps you get started with Docker deployment

echo ================================
echo RestoreAssist Docker Setup
echo ================================
echo.

REM Check if Docker is running
docker version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Docker is not running!
    echo Please start Docker Desktop and try again.
    pause
    exit /b 1
)

echo [1/5] Docker is running...
echo.

REM Check if .env.docker.local exists
if not exist .env.docker.local (
    echo [2/5] Creating .env.docker.local from template...
    copy .env.docker .env.docker.local
    echo.
    echo ================================
    echo IMPORTANT: Configuration Required
    echo ================================
    echo Please edit .env.docker.local and set:
    echo   - POSTGRES_PASSWORD
    echo   - NEXTAUTH_SECRET
    echo   - JWT_SECRET
    echo   - JWT_REFRESH_SECRET
    echo   - ANTHROPIC_API_KEY or OPENAI_API_KEY
    echo.
    echo Generate secrets with: openssl rand -base64 32
    echo.
    notepad .env.docker.local
    echo.
    echo Press any key after saving your configuration...
    pause >nul
) else (
    echo [2/5] Configuration file exists...
)
echo.

REM Build Docker images
echo [3/5] Building Docker images (this may take a few minutes)...
call npm run docker:build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Docker build failed!
    pause
    exit /b 1
)
echo.

REM Start services
echo [4/5] Starting services...
call npm run docker:up
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to start services!
    pause
    exit /b 1
)
echo.

REM Wait for services to be healthy
echo [5/5] Waiting for services to be ready...
timeout /t 10 /nobreak >nul

REM Check health endpoint
echo Checking application health...
curl -f http://localhost:3001/api/health >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ================================
    echo SUCCESS! RestoreAssist is running
    echo ================================
    echo.
    echo Application: http://localhost:3001
    echo Health Check: http://localhost:3001/api/health
    echo.
    echo View logs: npm run docker:logs
    echo Stop services: npm run docker:down
    echo.
) else (
    echo.
    echo Services are starting...
    echo Check status with: npm run docker:logs
    echo Health check: curl http://localhost:3001/api/health
    echo.
)

echo Opening application in browser...
timeout /t 3 /nobreak >nul
start http://localhost:3001

pause
