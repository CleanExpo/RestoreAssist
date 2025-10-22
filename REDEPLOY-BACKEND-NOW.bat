@echo off
REM ============================================================
REM URGENT: Redeploy Backend to Fix CORS Production Issue
REM ============================================================
REM This script redeploys the backend with CORS fixes to Vercel
REM Time to complete: 5 minutes
REM ============================================================

echo.
echo ========================================
echo  VERCEL BACKEND EMERGENCY REDEPLOY
echo ========================================
echo.
echo This will:
echo  1. Build backend with TypeScript
echo  2. Deploy to Vercel production
echo  3. Test CORS configuration
echo.

REM Colors (if supported)
set GREEN=[92m
set RED=[91m
set YELLOW=[93m
set RESET=[0m

cd /d "%~dp0"

REM Step 1: Check if we're in the right directory
if not exist "packages\backend\src\index.ts" (
    echo %RED%ERROR: Cannot find packages\backend\src\index.ts%RESET%
    echo Make sure you're running this from the RestoreAssist root directory
    pause
    exit /b 1
)

echo.
echo [1/5] Checking Vercel CLI...
echo ========================================
where vercel >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Vercel CLI not found. Installing...
    npm install -g vercel
    if %ERRORLEVEL% NEQ 0 (
        echo %RED%ERROR: Failed to install Vercel CLI%RESET%
        echo Please run: npm install -g vercel
        pause
        exit /b 1
    )
)
echo %GREEN%OK%RESET% Vercel CLI found

echo.
echo [2/5] Building backend...
echo ========================================
cd packages\backend

REM Install dependencies if needed
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm ci
    if %ERRORLEVEL% NEQ 0 (
        echo %YELLOW%WARNING: npm ci failed, trying npm install...%RESET%
        call npm install
    )
)

REM Build TypeScript
echo Building TypeScript...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo %RED%ERROR: Build failed%RESET%
    echo Check the TypeScript errors above
    cd ..\..
    pause
    exit /b 1
)

if not exist "dist\index.js" (
    echo %RED%ERROR: dist\index.js not created%RESET%
    cd ..\..
    pause
    exit /b 1
)

echo %GREEN%OK%RESET% Build successful (dist\index.js created)

echo.
echo [3/5] Deploying to Vercel...
echo ========================================
echo.
echo IMPORTANT: If prompted to login, follow the instructions
echo.
timeout /t 2 >nul

REM Deploy to production
call vercel --prod --yes
if %ERRORLEVEL% NEQ 0 (
    echo %RED%ERROR: Deployment failed%RESET%
    echo.
    echo Troubleshooting:
    echo  1. Run: vercel login
    echo  2. Ensure you have access to the project
    echo  3. Check Vercel dashboard for errors
    cd ..\..
    pause
    exit /b 1
)

echo %GREEN%OK%RESET% Deployment complete

echo.
echo [4/5] Getting deployment URL...
echo ========================================

REM Try to get the production URL
call vercel ls --prod 2>deployment-url.txt
if exist deployment-url.txt (
    findstr /C:"restore-assist-backend" deployment-url.txt
    del deployment-url.txt
)

echo.
echo The backend should now be deployed to:
echo  https://restore-assist-backend.vercel.app
echo.

echo.
echo [5/5] Testing deployment...
echo ========================================

REM Wait for deployment to be ready
echo Waiting 10 seconds for deployment to stabilize...
timeout /t 10 >nul

REM Test health endpoint
echo.
echo Testing health endpoint...
curl -k -s "https://restore-assist-backend.vercel.app/api/health" > health-test.txt 2>&1
if %ERRORLEVEL% EQU 0 (
    findstr /C:"healthy" health-test.txt >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo %GREEN%OK%RESET% Health check passed
        type health-test.txt
    ) else (
        echo %YELLOW%WARNING: Health check returned unexpected response%RESET%
        type health-test.txt
    )
) else (
    echo %RED%ERROR: Health check failed%RESET%
    type health-test.txt
)
del health-test.txt 2>nul

echo.
echo Testing CORS configuration...
curl -k -I -X OPTIONS "https://restore-assist-backend.vercel.app/api/auth/config" ^
  -H "Origin: https://restoreassist.app" ^
  -H "Access-Control-Request-Method: GET" ^
  -H "Access-Control-Request-Headers: Content-Type" 2>&1 | findstr /C:"Access-Control"

cd ..\..

echo.
echo ========================================
echo  DEPLOYMENT COMPLETE
echo ========================================
echo.
echo Next steps:
echo  1. Open: https://restoreassist.app
echo  2. Open browser console (F12)
echo  3. Refresh the page
echo  4. Check for CORS errors (should be GONE)
echo  5. Try clicking Google OAuth button
echo.
echo If CORS errors persist:
echo  1. Go to Vercel Dashboard
echo  2. Go to restore-assist-backend project
echo  3. Settings -^> Environment Variables
echo  4. Add/Update: ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app
echo  5. Click "Redeploy" in Vercel dashboard
echo.
echo Deployment URL: https://restore-assist-backend.vercel.app
echo.

pause
