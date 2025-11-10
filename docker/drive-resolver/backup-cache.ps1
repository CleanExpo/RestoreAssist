# Google Drive Resolver - Cache Backup Script
# Backs up cache files to a specified location

param(
    [string]$BackupPath = ".\backups",
    [switch]$Compress = $true
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Drive Resolver - Cache Backup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create backup directory
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = Join-Path $BackupPath "cache_backup_$timestamp"

if (-not (Test-Path $BackupPath)) {
    New-Item -ItemType Directory -Path $BackupPath | Out-Null
    Write-Host "[INFO] Created backup directory: $BackupPath" -ForegroundColor White
}

# Get cache stats
try {
    $stats = Invoke-RestMethod -Uri "http://localhost:5000/api/cache/stats"
    Write-Host "[INFO] Current cache:" -ForegroundColor White
    Write-Host "  Files: $($stats.cache.fileCount)"
    Write-Host "  Size:  $($stats.cache.totalSizeMB) MB"
    Write-Host ""

    if ($stats.cache.fileCount -eq 0) {
        Write-Host "[INFO] No files to backup" -ForegroundColor Yellow
        exit 0
    }
} catch {
    Write-Host "[ERROR] Cannot connect to Drive Resolver" -ForegroundColor Red
    Write-Host "Make sure the service is running" -ForegroundColor Red
    exit 1
}

# Copy cache from Docker volume
Write-Host "[INFO] Backing up cache files..." -ForegroundColor White

try {
    # Create temp directory for Docker export
    New-Item -ItemType Directory -Path $backupDir | Out-Null

    # Copy files from Docker container
    docker cp restoreassist-drive-resolver:/app/cache/. $backupDir

    Write-Host "[OK] Cache files backed up to: $backupDir" -ForegroundColor Green

    # Compress if requested
    if ($Compress) {
        Write-Host "[INFO] Compressing backup..." -ForegroundColor White

        $zipFile = "$backupDir.zip"
        Compress-Archive -Path $backupDir -DestinationPath $zipFile

        # Remove uncompressed directory
        Remove-Item -Path $backupDir -Recurse -Force

        $zipSize = (Get-Item $zipFile).Length / 1MB
        Write-Host "[OK] Compressed to: $zipFile ($([math]::Round($zipSize, 2)) MB)" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "[SUCCESS] Backup completed!" -ForegroundColor Green

} catch {
    Write-Host "[ERROR] Backup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
