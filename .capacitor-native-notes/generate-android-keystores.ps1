# RestoreAssist — Android Keystore Generator
# Run this script ONCE on a machine with Java installed.
# CRITICAL: Back up the generated .jks files in 3 places (password manager, Google Drive, USB drive).
# If you lose a keystore, you cannot update your app on Google Play — ever.
#
# Prerequisites:
#   - Java JDK installed (comes with Android Studio)
#   - Run as Administrator if keytool is not in PATH
#
# Usage:
#   Right-click → Run with PowerShell
#   OR: powershell -ExecutionPolicy Bypass -File generate-android-keystores.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "RestoreAssist Android Keystore Generator" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will generate two keystores:" -ForegroundColor Yellow
Write-Host "  1. restoreassist-release.jks (field app: com.restoreassist.app)"
Write-Host "  2. cet-release.jks (CET kiosk app: com.restoreassist.cet)"
Write-Host ""
Write-Host "IMPORTANT: You will be asked to set passwords. Write them down immediately." -ForegroundColor Red
Write-Host "Store these files and passwords in your password manager (e.g. 1Password, Bitwarden)." -ForegroundColor Red
Write-Host ""

$OutputDir = "$PSScriptRoot\keystores"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# ── Keystore 1: Field App ─────────────────────────────────────────────────────
Write-Host "Generating Field App keystore (com.restoreassist.app)..." -ForegroundColor Green

& keytool -genkey -v `
    -keystore "$OutputDir\restoreassist-release.jks" `
    -alias "restoreassist" `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -dname "CN=RestoreAssist Pty Ltd, OU=Mobile, O=RestoreAssist Pty Ltd, L=Australia, ST=QLD, C=AU"

Write-Host ""
Write-Host "Field App keystore saved to: $OutputDir\restoreassist-release.jks" -ForegroundColor Green

# ── Keystore 2: CET App ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "Generating CET App keystore (com.restoreassist.cet)..." -ForegroundColor Green

& keytool -genkey -v `
    -keystore "$OutputDir\cet-release.jks" `
    -alias "restoreassist-cet" `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -dname "CN=RestoreAssist Pty Ltd, OU=CET, O=RestoreAssist Pty Ltd, L=Australia, ST=QLD, C=AU"

Write-Host ""
Write-Host "CET App keystore saved to: $OutputDir\cet-release.jks" -ForegroundColor Green

# ── Base64 encode for GitHub Secrets ─────────────────────────────────────────
Write-Host ""
Write-Host "Encoding keystores for GitHub Secrets..." -ForegroundColor Yellow

$FieldB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$OutputDir\restoreassist-release.jks"))
$CetB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$OutputDir\cet-release.jks"))

$FieldB64 | Out-File -FilePath "$OutputDir\restoreassist-release-base64.txt" -Encoding utf8
$CetB64 | Out-File -FilePath "$OutputDir\cet-release-base64.txt" -Encoding utf8

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "DONE. Next steps:" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Back up BOTH .jks files from: $OutputDir" -ForegroundColor Yellow
Write-Host "   → Copy to Google Drive AND a USB drive AND your password manager"
Write-Host ""
Write-Host "2. Add these GitHub Secrets (Settings → Secrets → Actions):" -ForegroundColor Yellow
Write-Host "   ANDROID_KEYSTORE_BASE64      = contents of restoreassist-release-base64.txt"
Write-Host "   ANDROID_KEY_STORE_PASSWORD   = password you set for restoreassist-release.jks"
Write-Host "   ANDROID_KEY_ALIAS            = restoreassist"
Write-Host "   ANDROID_KEY_PASSWORD         = key password you set"
Write-Host ""
Write-Host "   CET_ANDROID_KEYSTORE_BASE64  = contents of cet-release-base64.txt"
Write-Host "   CET_ANDROID_KEY_STORE_PASSWORD = password you set for cet-release.jks"
Write-Host "   CET_ANDROID_KEY_ALIAS        = restoreassist-cet"
Write-Host "   CET_ANDROID_KEY_PASSWORD     = CET key password"
Write-Host ""
Write-Host "3. Send the SE this file path so they can confirm the secrets are set."
Write-Host ""
