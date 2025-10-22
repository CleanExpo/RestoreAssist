@echo off
echo ========================================
echo VERCEL BACKEND DEPLOYMENT
echo ========================================
echo.

echo Step 1: Building backend...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo Step 2: Testing build output...
if not exist "dist\index.js" (
    echo ERROR: dist\index.js not found!
    pause
    exit /b 1
)

echo.
echo Step 3: Attempting Vercel deployment...
echo.
echo ========================================
echo IMPORTANT: If you see git author error:
echo USE VERCEL DASHBOARD METHOD INSTEAD
echo See VERCEL_DEPLOY_GUIDE.md
echo ========================================
echo.

vercel --prod

if errorlevel 1 (
    echo.
    echo ========================================
    echo CLI DEPLOYMENT FAILED
    echo ========================================
    echo.
    echo Use Vercel Dashboard instead:
    echo 1. Go to https://vercel.com/unite-group
    echo 2. Find "restore-assist-backend" project
    echo 3. Settings -^> General -^> Root Directory = packages/backend
    echo 4. Deployments -^> Redeploy
    echo.
    echo Full instructions in VERCEL_DEPLOY_GUIDE.md
    echo ========================================
    pause
    exit /b 1
)

echo.
echo ========================================
echo DEPLOYMENT SUCCESSFUL!
echo ========================================
echo.
echo Test your deployment:
echo https://backend-e03gm60ws-unite-group.vercel.app/api/health
echo.
pause
