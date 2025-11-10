# Google Drive Resolver - Windows Task Scheduler Setup
# This script creates a scheduled task to auto-start the service on boot
# Run as Administrator: powershell -ExecutionPolicy Bypass -File setup-autostart.ps1

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Google Drive Resolver - Auto-Start Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory
$scriptPath = Join-Path $PSScriptRoot "start.ps1"
$workingDir = $PSScriptRoot

# Check if script exists
if (-not (Test-Path $scriptPath)) {
    Write-Host "[ERROR] start.ps1 not found at: $scriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Script path: $scriptPath" -ForegroundColor White
Write-Host "[INFO] Working directory: $workingDir" -ForegroundColor White
Write-Host ""

# Task details
$taskName = "RestoreAssist-DriveResolver"
$taskDescription = "Auto-start Google Drive Resolver microservice for RestoreAssist"

# Check if task already exists
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "[WARNING] Task '$taskName' already exists" -ForegroundColor Yellow
    $response = Read-Host "Do you want to replace it? (Y/N)"

    if ($response -ne "Y" -and $response -ne "y") {
        Write-Host "[INFO] Cancelled" -ForegroundColor Yellow
        exit 0
    }

    Write-Host "[INFO] Removing existing task..." -ForegroundColor White
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Create action
$action = New-ScheduledTaskAction `
    -Execute "PowerShell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`" -Silent" `
    -WorkingDirectory $workingDir

# Create trigger (at startup, with 30 second delay to allow Docker to start)
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = "PT30S"  # 30 second delay

# Create settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# Create principal (run as current user)
$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

# Register task
Write-Host "[INFO] Creating scheduled task..." -ForegroundColor White

try {
    Register-ScheduledTask `
        -TaskName $taskName `
        -Description $taskDescription `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Force | Out-Null

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Auto-start configured successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Task Details:" -ForegroundColor Cyan
    Write-Host "  Name:        $taskName"
    Write-Host "  Trigger:     At system startup (30s delay)"
    Write-Host "  User:        $env:USERNAME"
    Write-Host "  Script:      $scriptPath"
    Write-Host ""
    Write-Host "Management:" -ForegroundColor Cyan
    Write-Host "  View:        Task Scheduler > Task Scheduler Library"
    Write-Host "  Test:        Right-click task > Run"
    Write-Host "  Disable:     Right-click task > Disable"
    Write-Host "  Remove:      Right-click task > Delete"
    Write-Host ""
    Write-Host "The Drive Resolver will now auto-start when Windows boots!" -ForegroundColor Green
    Write-Host ""

    # Ask to run now
    $runNow = Read-Host "Do you want to start the service now? (Y/N)"
    if ($runNow -eq "Y" -or $runNow -eq "y") {
        Write-Host ""
        Write-Host "[INFO] Starting service..." -ForegroundColor White
        & $scriptPath -Silent
        Write-Host "[SUCCESS] Service started!" -ForegroundColor Green
    }

} catch {
    Write-Host ""
    Write-Host "[ERROR] Failed to create scheduled task" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
