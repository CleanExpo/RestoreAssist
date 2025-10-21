@echo off
echo ========================================
echo RestoreAssist Backend Deployment
echo ========================================
echo.

REM Check if Vercel CLI is installed
where vercel >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing Vercel CLI...
    call npm install -g vercel
    echo Vercel CLI installed
)

echo Navigating to backend directory...
cd packages\backend

echo.
echo Building backend...
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    pause
    exit /b 1
)

echo Build successful!
echo.
echo ========================================
echo Deploying to Vercel...
echo ========================================
echo.
echo IMPORTANT: When prompted:
echo - Link to existing project? YES (if you have restore-assist-backend)
echo - Project name? restore-assist-backend
echo.

call vercel --prod

echo.
echo ========================================
echo Deployment complete!
echo ========================================
echo.
echo Next steps:
echo 1. Test: curl https://restore-assist-backend.vercel.app/api/health
echo 2. Hard refresh: Ctrl+Shift+R
echo 3. Sign in: https://restoreassist.app
echo.
pause
