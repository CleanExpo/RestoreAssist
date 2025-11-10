# Google Drive Resolver - Automation Guide

Complete automation setup for the Google Drive Resolver microservice.

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [NPM Scripts](#npm-scripts)
3. [Startup Scripts](#startup-scripts)
4. [Health Monitoring](#health-monitoring)
5. [Auto-Start on Boot](#auto-start-on-boot)
6. [Development Environment](#development-environment)
7. [Backup & Rotation](#backup--rotation)
8. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Option 1: NPM Scripts (Recommended)

```bash
# Start Drive Resolver only
npm run drive:start

# Start Drive Resolver + Next.js dev server
npm run dev:all

# Check health
npm run drive:health

# View logs
npm run drive:logs
```

### Option 2: Batch Scripts (Windows)

```bash
# Automated startup with health checks
cd docker\drive-resolver
start.bat

# Health monitoring (auto-restart on failure)
monitor.bat
```

### Option 3: PowerShell (Advanced)

```powershell
# Automated startup
cd docker\drive-resolver
.\start.ps1

# With continuous monitoring
.\start.ps1 -Monitor

# Silent mode (no output)
.\start.ps1 -Silent
```

---

## 📦 NPM Scripts

### Drive Resolver Commands

| Command | Description |
|---------|-------------|
| `npm run drive:start` | Start the service |
| `npm run drive:stop` | Stop the service |
| `npm run drive:restart` | Restart the service |
| `npm run drive:logs` | View logs (follow mode) |
| `npm run drive:health` | Health check |
| `npm run drive:stats` | Cache statistics |
| `npm run drive:list` | List all accessible files |
| `npm run drive:clear-cache` | Clear cache |
| `npm run drive:monitor` | Start health monitoring |

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js only |
| `npm run dev:all` | Start Drive Resolver + Next.js |

---

## 🔧 Startup Scripts

### Windows Batch Script

**File**: `docker/drive-resolver/start.bat`

**Features**:
- Auto-starts Docker Desktop if needed
- Validates credentials
- Health checks with retry
- Error handling and logging

**Usage**:
```bat
cd docker\drive-resolver
start.bat
```

### PowerShell Script

**File**: `docker/drive-resolver/start.ps1`

**Features**:
- Docker auto-start
- Credential validation
- Advanced health checking
- Service statistics display
- Monitoring mode
- Silent mode

**Usage**:
```powershell
# Basic startup
.\start.ps1

# With monitoring
.\start.ps1 -Monitor

# Silent mode (for Task Scheduler)
.\start.ps1 -Silent
```

---

## 📊 Health Monitoring

### Automatic Monitoring

**File**: `docker/drive-resolver/monitor.bat`

**Features**:
- Continuous health checks (30-second interval)
- Auto-restart on failure
- Container status monitoring
- Cache statistics logging

**Usage**:
```bat
cd docker\drive-resolver
monitor.bat
```

**Output**:
```
[2025-11-11 10:30:00] [OK] Service healthy
[2025-11-11 10:30:00] Cache: {"fileCount":1,"totalSizeMB":0.69,...}
[2025-11-11 10:30:30] [OK] Service healthy
```

### PowerShell Monitoring

```powershell
cd docker\drive-resolver
.\start.ps1 -Monitor
```

**Features**:
- Better error handling
- Colored output
- Automatic recovery
- Graceful shutdown

---

## ⚡ Auto-Start on Boot

### Windows Task Scheduler Setup

**File**: `docker/drive-resolver/setup-autostart.ps1`

**Run as Administrator**:
```powershell
cd docker\drive-resolver
.\setup-autostart.ps1
```

**What it does**:
- Creates scheduled task "RestoreAssist-DriveResolver"
- Triggers at system startup (30-second delay)
- Auto-restarts on failure (3 retries, 1-minute interval)
- Runs as current user

**Manual Setup**:
1. Open Task Scheduler (`taskschd.msc`)
2. Create Basic Task
3. Name: `RestoreAssist-DriveResolver`
4. Trigger: At startup
5. Action: Start a program
   - Program: `PowerShell.exe`
   - Arguments: `-ExecutionPolicy Bypass -WindowStyle Hidden -File "D:\RestoreAssist\docker\drive-resolver\start.ps1" -Silent`
   - Start in: `D:\RestoreAssist\docker\drive-resolver`
6. Settings:
   - ✅ Allow task to be run on demand
   - ✅ Run task as soon as possible after a scheduled start is missed
   - ✅ If the task fails, restart every: 1 minute
   - ✅ Attempt to restart up to: 3 times

### Verify Auto-Start

```powershell
# Check if task exists
Get-ScheduledTask -TaskName "RestoreAssist-DriveResolver"

# Run task manually
Start-ScheduledTask -TaskName "RestoreAssist-DriveResolver"

# View task history
Get-ScheduledTask -TaskName "RestoreAssist-DriveResolver" | Get-ScheduledTaskInfo
```

### Disable Auto-Start

```powershell
# Disable task
Disable-ScheduledTask -TaskName "RestoreAssist-DriveResolver"

# Remove task
Unregister-ScheduledTask -TaskName "RestoreAssist-DriveResolver" -Confirm:$false
```

---

## 🖥️ Development Environment

### Unified Startup

**Batch Script**: `dev.bat` (in project root)

```bat
dev.bat
```

**PowerShell Script**: `dev.ps1` (in project root)

```powershell
# Start everything
.\dev.ps1

# Skip Drive Resolver
.\dev.ps1 -SkipDrive

# With monitoring
.\dev.ps1 -Monitor
```

**What it does**:
1. Starts Google Drive Resolver
2. Waits for health check
3. Starts Next.js dev server

**Services Running**:
- Drive Resolver: http://localhost:5000
- Next.js App: http://localhost:3000

---

## 🔄 Backup & Rotation

### Cache Backup

**File**: `docker/drive-resolver/backup-cache.ps1`

**Usage**:
```powershell
# Backup to default location (.\backups)
.\backup-cache.ps1

# Custom backup path
.\backup-cache.ps1 -BackupPath "C:\Backups\DriveResolver"

# Without compression
.\backup-cache.ps1 -Compress:$false
```

**Output**:
```
cache_backup_2025-11-11_10-30-00.zip
```

**Restore**:
```powershell
# Stop service
docker-compose stop drive-resolver

# Extract backup
Expand-Archive cache_backup_2025-11-11_10-30-00.zip -DestinationPath temp

# Copy to Docker volume
docker cp temp/. restoreassist-drive-resolver:/app/cache/

# Restart service
docker-compose start drive-resolver
```

### Credential Rotation

**File**: `docker/drive-resolver/rotate-credentials.ps1`

**Usage**:
```powershell
.\rotate-credentials.ps1 -NewCredentialsPath "C:\Path\To\new-service-account.json"
```

**What it does**:
1. Validates new credentials
2. Backs up current credentials
3. Installs new credentials
4. Restarts service
5. Tests new credentials
6. **Rolls back if failed**

**Backup Location**:
```
docker/drive-resolver/credentials/drive_service_account.backup_2025-11-11_10-30-00.json
```

---

## 🛠️ Troubleshooting

### Service Won't Start

**Check Docker**:
```bash
docker info
```

**Check Credentials**:
```powershell
Test-Path docker\drive-resolver\credentials\drive_service_account.json
```

**View Logs**:
```bash
npm run drive:logs
```

**Restart Everything**:
```bash
cd docker
docker-compose down
docker-compose up -d drive-resolver
```

### Health Check Fails

**Manual Health Check**:
```bash
curl http://localhost:5000/health
```

**Check Container Status**:
```bash
docker ps | findstr drive-resolver
```

**Restart Container**:
```bash
npm run drive:restart
```

### Auto-Start Not Working

**Check Task Status**:
```powershell
Get-ScheduledTask -TaskName "RestoreAssist-DriveResolver"
```

**View Task History**:
```powershell
Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" |
  Where-Object {$_.Message -like "*RestoreAssist-DriveResolver*"} |
  Select-Object -First 10
```

**Run Task Manually**:
```powershell
Start-ScheduledTask -TaskName "RestoreAssist-DriveResolver"
```

### Cache Issues

**Check Cache Size**:
```bash
npm run drive:stats
```

**Clear Cache**:
```bash
npm run drive:clear-cache
```

**Manual Cache Clear**:
```bash
docker exec restoreassist-drive-resolver rm -rf /app/cache/*
npm run drive:restart
```

---

## 📈 Monitoring & Maintenance

### Daily Health Check Script

Create `check-health.ps1`:

```powershell
$health = Invoke-RestMethod -Uri "http://localhost:5000/health"
$stats = Invoke-RestMethod -Uri "http://localhost:5000/api/cache/stats"

if ($health.status -ne "healthy") {
    Write-Host "ALERT: Drive Resolver unhealthy!" -ForegroundColor Red
    # Send email/notification
} else {
    Write-Host "OK: Drive Resolver healthy" -ForegroundColor Green
    Write-Host "Cache: $($stats.cache.fileCount) files, $($stats.cache.totalSizeMB) MB"
}
```

Schedule this with Task Scheduler to run daily.

### Weekly Cache Backup

**Task Scheduler**:
- Trigger: Weekly (Sunday, 2 AM)
- Action: `PowerShell.exe -File "D:\RestoreAssist\docker\drive-resolver\backup-cache.ps1"`

### Log Rotation

**Docker Compose** already handles log rotation:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

---

## 🎯 Best Practices

1. **Auto-Start**: Enable Task Scheduler auto-start for production
2. **Monitoring**: Run health monitoring in background
3. **Backups**: Schedule weekly cache backups
4. **Credentials**: Rotate credentials every 90 days
5. **Logs**: Check logs regularly for errors
6. **Updates**: Keep Docker and dependencies updated
7. **Testing**: Test auto-restart functionality monthly

---

## 📞 Quick Reference

| Task | Command |
|------|---------|
| Start service | `npm run drive:start` |
| Stop service | `npm run drive:stop` |
| Health check | `npm run drive:health` |
| View logs | `npm run drive:logs` |
| Clear cache | `npm run drive:clear-cache` |
| Backup cache | `.\backup-cache.ps1` |
| Rotate credentials | `.\rotate-credentials.ps1 -NewCredentialsPath "path"` |
| Setup auto-start | `.\setup-autostart.ps1` (as Admin) |
| Start with monitoring | `.\start.ps1 -Monitor` |
| Full dev environment | `.\dev.ps1` |

---

**Status**: ✅ Fully Automated
**Last Updated**: 2025-11-11
