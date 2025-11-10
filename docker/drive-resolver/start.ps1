# Google Drive Resolver - Automated Startup Script (PowerShell)
# Run with: powershell -ExecutionPolicy Bypass -File start.ps1

param(
    [switch]$Silent = $false,
    [switch]$Monitor = $false
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param($Message, $Type = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Type) {
        "SUCCESS" { "Green" }
        "ERROR" { "Red" }
        "WARNING" { "Yellow" }
        default { "White" }
    }
    Write-Host "[$timestamp] [$Type] $Message" -ForegroundColor $color
}

function Test-DockerRunning {
    try {
        docker info *>$null
        return $true
    } catch {
        return $false
    }
}

function Start-DockerDesktop {
    Write-Status "Starting Docker Desktop..." "WARNING"

    $dockerPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPath) {
        Start-Process $dockerPath

        # Wait for Docker to start (max 60 seconds)
        $maxWait = 60
        $waited = 0
        while (-not (Test-DockerRunning) -and $waited -lt $maxWait) {
            Start-Sleep -Seconds 2
            $waited += 2
            Write-Host "." -NoNewline
        }
        Write-Host ""

        if (Test-DockerRunning) {
            Write-Status "Docker started successfully" "SUCCESS"
            return $true
        }
    }

    Write-Status "Failed to start Docker Desktop" "ERROR"
    return $false
}

function Test-Credentials {
    $credPath = Join-Path $PSScriptRoot "credentials\drive_service_account.json"
    if (Test-Path $credPath) {
        Write-Status "Credentials found" "SUCCESS"
        return $true
    }

    Write-Status "Credentials not found at: $credPath" "ERROR"
    return $false
}

function Start-DriveResolver {
    $dockerDir = Split-Path $PSScriptRoot -Parent
    Set-Location $dockerDir

    Write-Status "Starting Google Drive Resolver service..."

    # Remove old container if exists
    docker-compose stop drive-resolver 2>$null
    docker-compose rm -f drive-resolver 2>$null

    # Start service
    docker-compose up -d drive-resolver

    if ($LASTEXITCODE -eq 0) {
        Write-Status "Service started successfully" "SUCCESS"
        return $true
    }

    Write-Status "Failed to start service" "ERROR"
    return $false
}

function Test-ServiceHealth {
    param([int]$MaxRetries = 3, [int]$WaitSeconds = 5)

    for ($i = 1; $i -le $MaxRetries; $i++) {
        Write-Status "Health check attempt $i/$MaxRetries..."

        try {
            $response = Invoke-RestMethod -Uri "http://localhost:5000/health" -TimeoutSec 10
            if ($response.status -eq "healthy") {
                Write-Status "Service is healthy!" "SUCCESS"
                return $true
            }
        } catch {
            if ($i -lt $MaxRetries) {
                Write-Status "Health check failed, waiting $WaitSeconds seconds..." "WARNING"
                Start-Sleep -Seconds $WaitSeconds
            }
        }
    }

    Write-Status "Service health check failed" "ERROR"
    return $false
}

function Get-ServiceStats {
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:5000/health"
        $cache = Invoke-RestMethod -Uri "http://localhost:5000/api/cache/stats"

        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "Service Status" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "Status:      $($health.status)" -ForegroundColor Green
        Write-Host "Service:     $($health.service)"
        Write-Host "Version:     $($health.version)"
        Write-Host "URL:         http://localhost:5000"
        Write-Host ""
        Write-Host "Cache Stats:" -ForegroundColor Yellow
        Write-Host "  Files:     $($cache.cache.fileCount)"
        Write-Host "  Size:      $($cache.cache.totalSizeMB) MB / $($cache.cache.maxSizeMB) MB"
        Write-Host "  TTL:       $($cache.cache.ttlHours) hours"
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
    } catch {
        Write-Status "Failed to get service stats" "ERROR"
    }
}

# Main execution
try {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Google Drive Resolver - Automated Start" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    # Check Docker
    if (-not (Test-DockerRunning)) {
        Write-Status "Docker is not running" "WARNING"
        if (-not (Start-DockerDesktop)) {
            throw "Failed to start Docker"
        }
    } else {
        Write-Status "Docker is running" "SUCCESS"
    }

    # Check credentials
    if (-not (Test-Credentials)) {
        throw "Credentials not found"
    }

    # Start service
    if (-not (Start-DriveResolver)) {
        throw "Failed to start service"
    }

    # Health check
    Write-Host ""
    if (-not (Test-ServiceHealth -MaxRetries 5 -WaitSeconds 5)) {
        Write-Status "Service may not be healthy. Check logs:" "WARNING"
        Write-Host "  docker-compose logs drive-resolver" -ForegroundColor Yellow
    } else {
        Get-ServiceStats
    }

    # Monitor mode
    if ($Monitor) {
        Write-Status "Starting continuous monitoring..." "INFO"
        Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
        Write-Host ""

        while ($true) {
            Start-Sleep -Seconds 30

            if (Test-ServiceHealth -MaxRetries 1 -WaitSeconds 0) {
                Write-Status "Service healthy" "SUCCESS"
            } else {
                Write-Status "Service unhealthy - attempting restart..." "ERROR"
                Start-DriveResolver
                Start-Sleep -Seconds 10
            }
        }
    }

    if (-not $Silent) {
        Write-Host ""
        Write-Host "Quick Commands:" -ForegroundColor Cyan
        Write-Host "  View logs:  docker-compose logs -f drive-resolver"
        Write-Host "  Stop:       docker-compose down"
        Write-Host "  Restart:    docker-compose restart drive-resolver"
        Write-Host "  Monitor:    powershell -File start.ps1 -Monitor"
        Write-Host ""
    }

} catch {
    Write-Status $_.Exception.Message "ERROR"
    exit 1
}
