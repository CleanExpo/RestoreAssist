@echo off
echo ========================================
echo AUTOMATED CREDENTIAL ROTATION SCRIPT
echo ========================================
echo.
echo This script will help you rotate all exposed credentials
echo.
pause

echo.
echo Step 1: Opening GitHub Token Settings...
start "" "https://github.com/settings/tokens"
echo.
echo INSTRUCTIONS:
echo 1. Find token ending in "2E2w3c" in the list
echo 2. Click "Delete" next to it
echo 3. Click "Generate new token" (Classic)
echo 4. Give it a name: "Claude Code - RestoreAssist"
echo 5. Select scopes: repo (all), workflow, admin:org
echo 6. Click "Generate token"
echo 7. COPY the new token (starts with ghp_)
echo.
set /p NEW_GITHUB_TOKEN="Paste the NEW GitHub token here: "
echo.

echo Step 2: Opening Stripe Dashboard...
start "" "https://dashboard.stripe.com/apikeys"
echo.
echo INSTRUCTIONS:
echo 1. Find the "Secret key" section
echo 2. Click "Roll key" for the live secret key
echo 3. Confirm the roll operation
echo 4. Click "Reveal" on the new key
echo 5. COPY the new key (starts with sk_live_)
echo.
set /p NEW_STRIPE_KEY="Paste the NEW Stripe live key here: "
echo.

echo Step 3: Opening Supabase Project Settings...
start "" "https://supabase.com/dashboard/project/qwoggbbavikzhypzodcr/settings/api"
echo.
echo INSTRUCTIONS:
echo 1. Scroll to "Service role" section
echo 2. Click "Reset" next to service_role key
echo 3. Confirm reset
echo 4. COPY the new service_role key
echo.
set /p NEW_SUPABASE_KEY="Paste the NEW Supabase service_role key here: "
echo.

echo Step 4: Generating new database password...
start "" "https://supabase.com/dashboard/project/qwoggbbavikzhypzodcr/settings/database"
echo.
echo INSTRUCTIONS:
echo 1. Click "Reset Database Password"
echo 2. Confirm reset
echo 3. COPY the new password (it will be shown once)
echo.
set /p NEW_DB_PASSWORD="Paste the NEW database password here: "
echo.

echo ========================================
echo Updating Claude Config File...
echo ========================================

echo Updating GitHub token in Claude config...
powershell -Command "$config = Get-Content '%APPDATA%\Claude\claude_desktop_config.json' -Raw; $config = $config -replace '\"GITHUB_PERSONAL_ACCESS_TOKEN\":\s*\"ghp_[^\"]+\"', '\"GITHUB_PERSONAL_ACCESS_TOKEN\": \"%NEW_GITHUB_TOKEN%\"'; Set-Content '%APPDATA%\Claude\claude_desktop_config.json' -Value $config"

echo Updating Stripe key in Claude config...
powershell -Command "$config = Get-Content '%APPDATA%\Claude\claude_desktop_config.json' -Raw; $config = $config -replace 'sk_live_[a-zA-Z0-9]+', '%NEW_STRIPE_KEY%'; Set-Content '%APPDATA%\Claude\claude_desktop_config.json' -Value $config"

echo Updating Supabase service role in Claude config...
powershell -Command "$config = Get-Content '%APPDATA%\Claude\claude_desktop_config.json' -Raw; $config = $config -replace '\"SUPABASE_SERVICE_ROLE_KEY\":\s*\"eyJ[^\"]+\"', '\"SUPABASE_SERVICE_ROLE_KEY\": \"%NEW_SUPABASE_KEY%\"'; Set-Content '%APPDATA%\Claude\claude_desktop_config.json' -Value $config"

echo Updating database password in Claude config...
powershell -Command "$config = Get-Content '%APPDATA%\Claude\claude_desktop_config.json' -Raw; $config = $config -replace 'postgres\.qwoggbbavikzhypzodcr:[^@]+@', 'postgres.qwoggbbavikzhypzodcr:%NEW_DB_PASSWORD%@'; Set-Content '%APPDATA%\Claude\claude_desktop_config.json' -Value $config"

echo.
echo ========================================
echo Saving new credentials to secure file...
echo ========================================

echo NEW_GITHUB_TOKEN=%NEW_GITHUB_TOKEN%> "%USERPROFILE%\new-credentials-SECURE.txt"
echo NEW_STRIPE_KEY=%NEW_STRIPE_KEY%>> "%USERPROFILE%\new-credentials-SECURE.txt"
echo NEW_SUPABASE_KEY=%NEW_SUPABASE_KEY%>> "%USERPROFILE%\new-credentials-SECURE.txt"
echo NEW_DB_PASSWORD=%NEW_DB_PASSWORD%>> "%USERPROFILE%\new-credentials-SECURE.txt"
echo.
echo DATABASE_URL=postgresql://postgres.qwoggbbavikzhypzodcr:%NEW_DB_PASSWORD%@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=require^&pgbouncer=true^&connect_timeout=30>> "%USERPROFILE%\new-credentials-SECURE.txt"

echo.
echo ========================================
echo NEXT STEPS:
echo ========================================
echo.
echo 1. UPDATE VERCEL ENVIRONMENT VARIABLES:
echo    - Go to: https://vercel.com/unite-group/restoreassist/settings/environment-variables
echo    - Update DATABASE_URL with the value from: %USERPROFILE%\new-credentials-SECURE.txt
echo    - Save and redeploy
echo.
echo 2. RESTART CLAUDE CODE for changes to take effect
echo.
echo 3. DELETE the credentials file after updating Vercel:
echo    - File location: %USERPROFILE%\new-credentials-SECURE.txt
echo.
echo ========================================
echo ROTATION COMPLETE!
echo ========================================
pause
