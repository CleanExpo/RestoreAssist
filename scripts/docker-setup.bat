@echo off
REM Docker setup and management script for RestoreAssist (Windows)
REM Usage: docker-setup.bat <command>

setlocal enabledelayedexpansion

set ENV_FILE=.env.local

if "%1"=="" (
  call :show_usage
  exit /b 0
)

if "%1"=="dev-start" (
  call :dev_start
  exit /b %ERRORLEVEL%
)

if "%1"=="dev-stop" (
  call :dev_stop
  exit /b %ERRORLEVEL%
)

if "%1"=="dev-logs" (
  call :dev_logs
  exit /b %ERRORLEVEL%
)

if "%1"=="prod-build" (
  call :prod_build
  exit /b %ERRORLEVEL%
)

if "%1"=="prod-run" (
  call :prod_run
  exit /b %ERRORLEVEL%
)

if "%1"=="db-seed" (
  call :db_seed
  exit /b %ERRORLEVEL%
)

if "%1"=="db-shell" (
  call :db_shell
  exit /b %ERRORLEVEL%
)

if "%1"=="health" (
  call :health_check
  exit /b %ERRORLEVEL%
)

if "%1"=="help" (
  call :show_usage
  exit /b 0
)

echo Unknown command: %1
call :show_usage
exit /b 1

:show_usage
echo.
echo RestoreAssist Docker Management
echo.
echo Usage: docker-setup.bat ^<command^>
echo.
echo Commands:
echo   dev-start       Start development environment with database
echo   dev-stop        Stop development environment
echo   dev-logs        Show live logs from development containers
echo   prod-build      Build production image
echo   prod-run        Run production container
echo   db-seed         Seed database with initial data
echo   db-shell        Open database shell (psql^)
echo   health          Check application health
echo   help            Show this help message
echo.
echo Examples:
echo   docker-setup.bat dev-start
echo   docker-setup.bat prod-build
echo.
exit /b 0

:dev_start
echo [INFO] Starting development environment...
docker-compose --profile dev up -d
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

echo [INFO] Waiting for services to be healthy...
timeout /t 5 /nobreak

echo [INFO] Running database migrations...
docker-compose exec -T app npx prisma migrate deploy

echo [INFO] Development environment ready!
echo [INFO] Access application at: http://localhost:3000
exit /b 0

:dev_stop
echo [INFO] Stopping development environment...
docker-compose --profile dev down
echo [INFO] Development environment stopped
exit /b 0

:dev_logs
echo [INFO] Showing live logs (Ctrl+C to exit)...
docker-compose --profile dev logs -f
exit /b 0

:prod_build
echo [INFO] Building production image...
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c%%a%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a%%b)
docker build -t restoreassist:latest -t restoreassist:%mydate%-%mytime% .
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
echo [INFO] Production image built successfully
exit /b 0

:prod_run
if not exist "%ENV_FILE%" (
  echo [ERROR] Environment file not found: %ENV_FILE%
  echo [WARNING] Please create %ENV_FILE% with required environment variables
  exit /b 1
)

echo [INFO] Running production container...
docker run -d ^
  --name restoreassist-prod ^
  --env-file "%ENV_FILE%" ^
  -p 3000:3000 ^
  --restart unless-stopped ^
  restoreassist:latest

if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
echo [INFO] Production container started
echo [INFO] Access application at: http://localhost:3000
exit /b 0

:db_seed
echo [INFO] Seeding database...
docker-compose --profile dev exec -T app npm run db:seed
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
echo [INFO] Database seeded
exit /b 0

:db_shell
echo [INFO] Opening database shell (type \q to exit^)...
docker-compose --profile dev exec postgres psql -U dev -d restoreassist
exit /b %ERRORLEVEL%

:health_check
echo [INFO] Checking application health...
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -UseBasicParsing; if ($response.Content -match 'healthy') { Write-Host '[INFO] Application is healthy' } } catch { Write-Host '[ERROR] Application is not responding' }"
exit /b 0
