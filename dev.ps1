# RestoreAssist - Unified Development Environment Startup (PowerShell)
# This script starts both the Drive Resolver and Next.js dev server

param(
    [switch]$SkipDrive = $false,
    [switch]$Monitor = $false
)

$ErrorActionPreference = "Stop"

function Write-Header {
    param($Text)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param($Number, $Total, $Text)
    Write-Host "[$Number/$Total] $Text" -ForegroundColor Yellow
}

function Write-Success {
    param($Text)
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Error {
    param($Text)
    Write-Host "[ERROR] $Text" -ForegroundColor Red
}

function Write-Warning {
    param($Text)
    Write-Host "[WARNING] $Text" -ForegroundColor Yellow
}

function Start-DriveResolver {
    try {
        Write-Step 1 2 "Starting Google Drive Resolver..."

        Set-Location "docker"
        docker-compose up -d drive-resolver 2>&1 | Out-Null
        Set-Location ".."

        Write-Success "Drive Resolver started"

        # Wait and health check
        Write-Host "Waiting for Drive Resolver to be ready..." -ForegroundColor Gray
        Start-Sleep -Seconds 5

        try {
            $response = Invoke-RestMethod -Uri "http://localhost:5000/health" -TimeoutSec 5
            if ($response.status -eq "healthy") {
                Write-Success "Drive Resolver is healthy"

                # Get stats
                $cache = Invoke-RestMethod -Uri "http://localhost:5000/api/cache/stats"
                Write-Host "  Cache: $($cache.cache.fileCount) files, $($cache.cache.totalSizeMB) MB" -ForegroundColor Gray
            }
        } catch {
            Write-Warning "Drive Resolver may not be ready yet"
        }

        Write-Host ""
        return $true
    } catch {
        Write-Error "Failed to start Drive Resolver: $($_.Exception.Message)"
        return $false
    }
}

function Start-Monitor {
    Write-Host ""
    Write-Host "Starting Drive Resolver health monitor..." -ForegroundColor Cyan
    Write-Host "Monitor running in background. Press Ctrl+C to stop Next.js dev server." -ForegroundColor Yellow
    Write-Host ""

    $monitorScript = Join-Path $PSScriptRoot "docker\drive-resolver\start.ps1"

    $job = Start-Job -ScriptBlock {
        param($ScriptPath)
        & PowerShell.exe -ExecutionPolicy Bypass -File $ScriptPath -Monitor
    } -ArgumentList $monitorScript

    return $job
}

try {
    Write-Header "RestoreAssist - Development Environment"

    # Start Drive Resolver
    if (-not $SkipDrive) {
        if (-not (Start-DriveResolver)) {
            throw "Failed to start Drive Resolver"
        }
    } else {
        Write-Warning "Skipping Drive Resolver startup (-SkipDrive flag)"
        Write-Host ""
    }

    # Start monitor if requested
    $monitorJob = $null
    if ($Monitor) {
        $monitorJob = Start-Monitor
    }

    # Start Next.js
    Write-Step 2 2 "Starting Next.js development server..."
    Write-Host ""

    Write-Header "Services Running"
    Write-Host "Drive Resolver:  http://localhost:5000" -ForegroundColor Green
    Write-Host "Next.js App:     http://localhost:3000" -ForegroundColor Green
    Write-Host ""
    Write-Host "Quick Commands:" -ForegroundColor Cyan
    Write-Host "  npm run drive:logs       - View Drive Resolver logs"
    Write-Host "  npm run drive:health     - Check Drive Resolver health"
    Write-Host "  npm run drive:stats      - View cache statistics"
    Write-Host "  npm run drive:restart    - Restart Drive Resolver"
    Write-Host ""

    npm run dev

} catch {
    Write-Error $_.Exception.Message
    exit 1
} finally {
    # Cleanup monitor job
    if ($monitorJob) {
        Write-Host ""
        Write-Host "Stopping health monitor..." -ForegroundColor Yellow
        Stop-Job -Job $monitorJob -ErrorAction SilentlyContinue
        Remove-Job -Job $monitorJob -ErrorAction SilentlyContinue
    }
}
