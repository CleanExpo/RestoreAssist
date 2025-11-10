# Google Drive Resolver - Credential Rotation Script
# Safely rotates service account credentials

param(
    [Parameter(Mandatory=$true)]
    [string]$NewCredentialsPath
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Drive Resolver - Credential Rotation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Validate new credentials file
if (-not (Test-Path $NewCredentialsPath)) {
    Write-Host "[ERROR] Credentials file not found: $NewCredentialsPath" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] New credentials: $NewCredentialsPath" -ForegroundColor White

# Validate JSON
try {
    $newCreds = Get-Content $NewCredentialsPath | ConvertFrom-Json
    Write-Host "[OK] Credentials file is valid JSON" -ForegroundColor Green

    Write-Host ""
    Write-Host "New Service Account Details:" -ForegroundColor Cyan
    Write-Host "  Email:      $($newCreds.client_email)"
    Write-Host "  Project ID: $($newCreds.project_id)"
    Write-Host ""
} catch {
    Write-Host "[ERROR] Invalid JSON in credentials file" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Confirm rotation
$confirm = Read-Host "Do you want to rotate credentials? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "[INFO] Cancelled" -ForegroundColor Yellow
    exit 0
}

$credDir = Join-Path $PSScriptRoot "credentials"
$currentCredPath = Join-Path $credDir "drive_service_account.json"
$backupPath = Join-Path $credDir "drive_service_account.backup_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').json"

# Backup current credentials
if (Test-Path $currentCredPath) {
    Write-Host "[INFO] Backing up current credentials..." -ForegroundColor White
    Copy-Item $currentCredPath $backupPath
    Write-Host "[OK] Backup created: $backupPath" -ForegroundColor Green
}

# Copy new credentials
Write-Host "[INFO] Installing new credentials..." -ForegroundColor White
Copy-Item $NewCredentialsPath $currentCredPath -Force
Write-Host "[OK] New credentials installed" -ForegroundColor Green

# Restart service
Write-Host "[INFO] Restarting Drive Resolver service..." -ForegroundColor White

$dockerDir = Split-Path $PSScriptRoot -Parent
Set-Location $dockerDir

docker-compose restart drive-resolver

# Wait for service
Start-Sleep -Seconds 5

# Test new credentials
Write-Host "[INFO] Testing new credentials..." -ForegroundColor White

try {
    $health = Invoke-RestMethod -Uri "http://localhost:5000/health" -TimeoutSec 10
    if ($health.status -eq "healthy") {
        Write-Host "[OK] Service is healthy with new credentials!" -ForegroundColor Green

        # Test file access
        $files = Invoke-RestMethod -Uri "http://localhost:5000/api/list"
        Write-Host "[OK] File access working - $($files.count) files accessible" -ForegroundColor Green

        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "Credential rotation successful!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Old credentials backed up to:" -ForegroundColor Cyan
        Write-Host "  $backupPath"
        Write-Host ""

    } else {
        throw "Service is not healthy"
    }
} catch {
    Write-Host "[ERROR] New credentials failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Rolling back to previous credentials..." -ForegroundColor Yellow

    Copy-Item $backupPath $currentCredPath -Force
    docker-compose restart drive-resolver

    Write-Host "[INFO] Rolled back to previous credentials" -ForegroundColor Yellow
    Write-Host "Please check your new credentials and try again" -ForegroundColor Yellow

    exit 1
}
