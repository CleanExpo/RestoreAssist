#!/usr/bin/env pwsh
param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

function Write-StepHeader {
    param([string]$Message)
    Write-Host "`n===> $Message" -ForegroundColor Cyan
}

function Write-OK {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Write-Detail {
    param([string]$Message)
    Write-Host "     $Message" -ForegroundColor Gray
}

# Validate version format
if ($Version -notmatch '^v?\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$') {
    Write-Fail "Invalid version format: $Version"
    Write-Host "Expected format: v1.0.0 or v1.0.0-beta.1" -ForegroundColor Yellow
    exit 1
}

# Normalize version
if ($Version -notmatch '^v') {
    $Version = "v$Version"
}

$PackageVersion = $Version -replace '^v', ''
$RepoRoot = Resolve-Path "$PSScriptRoot\..\..\..\"
$DistDir = Join-Path $RepoRoot "dist"
$ReleaseDir = Join-Path $DistDir "release-$Version"

Write-StepHeader "Starting release package creation for $Version"
Write-Detail "Repository root: $RepoRoot"
Write-Detail "Release directory: $ReleaseDir"

# Clean previous builds
Write-StepHeader "Cleaning previous builds"
if (Test-Path $DistDir) {
    Remove-Item -Path $DistDir -Recurse -Force
    Write-OK "Cleaned dist directory"
}

# Create release directory structure
Write-StepHeader "Creating release directory structure"
New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null
New-Item -ItemType Directory -Path "$ReleaseDir\backend" -Force | Out-Null
New-Item -ItemType Directory -Path "$ReleaseDir\frontend" -Force | Out-Null
New-Item -ItemType Directory -Path "$ReleaseDir\docs" -Force | Out-Null
Write-OK "Created release directory structure"

# Change to repo root
Set-Location $RepoRoot

# Check Node.js version
Write-StepHeader "Checking Node.js version"
$NodeVersion = node --version
Write-Detail "Node.js version: $NodeVersion"
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Node.js not found or not in PATH"
    exit 1
}

# Update version in package.json files
Write-StepHeader "Updating version in package.json files"
$RootPackageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$RootPackageJson.version = $PackageVersion
$RootPackageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json"
Write-OK "Updated root package.json to $PackageVersion"

$BackendPackageJson = Get-Content "packages\backend\package.json" -Raw | ConvertFrom-Json
$BackendPackageJson.version = $PackageVersion
$BackendPackageJson | ConvertTo-Json -Depth 10 | Set-Content "packages\backend\package.json"
Write-OK "Updated backend package.json to $PackageVersion"

$FrontendPackageJson = Get-Content "packages\frontend\package.json" -Raw | ConvertFrom-Json
$FrontendPackageJson.version = $PackageVersion
$FrontendPackageJson | ConvertTo-Json -Depth 10 | Set-Content "packages\frontend\package.json"
Write-OK "Updated frontend package.json to $PackageVersion"

# Install dependencies
Write-StepHeader "Installing dependencies"
npm install 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Failed to install dependencies"
    exit 1
}
Write-OK "Dependencies installed"

# Build backend
Write-StepHeader "Building backend"
Set-Location "packages\backend"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Backend build failed"
    Set-Location $RepoRoot
    exit 1
}
Write-OK "Backend built successfully"

# Copy backend files
Write-Detail "Copying backend files to release directory"
Copy-Item "dist" -Destination "$ReleaseDir\backend\dist" -Recurse
Copy-Item "package.json" -Destination "$ReleaseDir\backend\"
Copy-Item "package-lock.json" -Destination "$ReleaseDir\backend\" -ErrorAction SilentlyContinue
if (Test-Path "prisma") {
    Copy-Item "prisma" -Destination "$ReleaseDir\backend\prisma" -Recurse
}
if (Test-Path ".env.example") {
    Copy-Item ".env.example" -Destination "$ReleaseDir\backend\"
}
Write-OK "Backend files copied"

Set-Location $RepoRoot

# Build frontend
Write-StepHeader "Building frontend"
Set-Location "packages\frontend"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Frontend build failed"
    Set-Location $RepoRoot
    exit 1
}
Write-OK "Frontend built successfully"

# Copy frontend files
Write-Detail "Copying frontend files to release directory"
Copy-Item "dist" -Destination "$ReleaseDir\frontend\dist" -Recurse
Copy-Item "package.json" -Destination "$ReleaseDir\frontend\"
Copy-Item "package-lock.json" -Destination "$ReleaseDir\frontend\" -ErrorAction SilentlyContinue
if (Test-Path ".env.example") {
    Copy-Item ".env.example" -Destination "$ReleaseDir\frontend\"
}
Write-OK "Frontend files copied"

Set-Location $RepoRoot

# Copy documentation
Write-StepHeader "Copying documentation"
$DocFiles = @(
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    "DEPLOYMENT.md",
    "SECURITY.md"
)

foreach ($DocFile in $DocFiles) {
    if (Test-Path $DocFile) {
        Copy-Item $DocFile -Destination "$ReleaseDir\docs\"
        Write-Detail "Copied $DocFile"
    }
}
Write-OK "Documentation copied"

# Create release notes
Write-StepHeader "Generating release notes"
$CurrentDate = Get-Date -Format "yyyy-MM-dd"
$CurrentDateTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$ReleaseNotesContent = "# RestoreAssist $Version`n`n"
$ReleaseNotesContent += "## Release Information`n"
$ReleaseNotesContent += "- Version: $Version`n"
$ReleaseNotesContent += "- Release Date: $CurrentDate`n"
$ReleaseNotesContent += "- Node.js Version: $NodeVersion`n`n"
$ReleaseNotesContent += "## Package Contents`n"
$ReleaseNotesContent += "This release includes:`n"
$ReleaseNotesContent += "- Backend API (Node.js/Express)`n"
$ReleaseNotesContent += "- Frontend Application (React/Vite)`n"
$ReleaseNotesContent += "- Database migrations (Prisma)`n"
$ReleaseNotesContent += "- Documentation`n`n"
$ReleaseNotesContent += "## Installation`n`n"
$ReleaseNotesContent += "### Backend`n"
$ReleaseNotesContent += "1. Navigate to the backend directory`n"
$ReleaseNotesContent += "2. Install dependencies: npm install --production`n"
$ReleaseNotesContent += "3. Set up environment variables (see .env.example)`n"
$ReleaseNotesContent += "4. Run database migrations: npx prisma migrate deploy`n"
$ReleaseNotesContent += "5. Start the server: npm start`n`n"
$ReleaseNotesContent += "### Frontend`n"
$ReleaseNotesContent += "1. Navigate to the frontend directory`n"
$ReleaseNotesContent += "2. Serve the dist folder with your preferred web server`n"
$ReleaseNotesContent += "3. Configure environment variables as needed`n`n"
$ReleaseNotesContent += "## Environment Variables`n"
$ReleaseNotesContent += "See the .env.example files in each package directory for required environment variables.`n`n"
$ReleaseNotesContent += "## Documentation`n"
$ReleaseNotesContent += "Full documentation is available in the docs folder.`n`n"
$ReleaseNotesContent += "## Support`n"
$ReleaseNotesContent += "For issues and support, please visit the GitHub repository.`n`n"
$ReleaseNotesContent += "---`n"
$ReleaseNotesContent += "Generated on $CurrentDateTime`n"

Set-Content -Path "$ReleaseDir\RELEASE_NOTES.md" -Value $ReleaseNotesContent
Write-OK "Release notes generated"

# Create deployment scripts
Write-StepHeader "Creating deployment scripts"

$WindowsDeployScript = "@echo off`r`n"
$WindowsDeployScript += "echo RestoreAssist Deployment Script`r`n"
$WindowsDeployScript += "echo ===============================`r`n"
$WindowsDeployScript += "echo.`r`n`r`n"
$WindowsDeployScript += "echo Checking Node.js installation...`r`n"
$WindowsDeployScript += "node --version >nul 2>&1`r`n"
$WindowsDeployScript += "if errorlevel 1 (`r`n"
$WindowsDeployScript += "    echo ERROR: Node.js is not installed or not in PATH`r`n"
$WindowsDeployScript += "    exit /b 1`r`n"
$WindowsDeployScript += ")`r`n`r`n"
$WindowsDeployScript += "echo Installing backend dependencies...`r`n"
$WindowsDeployScript += "cd backend`r`n"
$WindowsDeployScript += "call npm install --production`r`n"
$WindowsDeployScript += "if errorlevel 1 (`r`n"
$WindowsDeployScript += "    echo ERROR: Failed to install backend dependencies`r`n"
$WindowsDeployScript += "    exit /b 1`r`n"
$WindowsDeployScript += ")`r`n`r`n"
$WindowsDeployScript += "echo.`r`n"
$WindowsDeployScript += "echo Backend setup complete!`r`n"
$WindowsDeployScript += "echo.`r`n"
$WindowsDeployScript += "echo Next steps:`r`n"
$WindowsDeployScript += "echo 1. Configure environment variables in backend\.env`r`n"
$WindowsDeployScript += "echo 2. Run database migrations: cd backend & npx prisma migrate deploy`r`n"
$WindowsDeployScript += "echo 3. Start the backend: cd backend & npm start`r`n"
$WindowsDeployScript += "echo.`r`n"
$WindowsDeployScript += "echo Frontend is pre-built and ready to serve from frontend\dist`r`n"
$WindowsDeployScript += "echo.`r`n"
$WindowsDeployScript += "pause`r`n"

Set-Content -Path "$ReleaseDir\deploy.bat" -Value $WindowsDeployScript
Write-OK "Created Windows deployment script"

$UnixDeployScript = "#!/bin/bash`n"
$UnixDeployScript += "set -e`n`n"
$UnixDeployScript += "echo `"RestoreAssist Deployment Script`"`n"
$UnixDeployScript += "echo `"===============================`"`n"
$UnixDeployScript += "echo `"`"`n`n"
$UnixDeployScript += "echo `"Checking Node.js installation...`"`n"
$UnixDeployScript += "if ! command -v node &> /dev/null; then`n"
$UnixDeployScript += "    echo `"ERROR: Node.js is not installed or not in PATH`"`n"
$UnixDeployScript += "    exit 1`n"
$UnixDeployScript += "fi`n`n"
$UnixDeployScript += "echo `"Node.js version: `$(node --version)`"`n"
$UnixDeployScript += "echo `"`"`n`n"
$UnixDeployScript += "echo `"Installing backend dependencies...`"`n"
$UnixDeployScript += "cd backend`n"
$UnixDeployScript += "npm install --production`n`n"
$UnixDeployScript += "echo `"`"`n"
$UnixDeployScript += "echo `"Backend setup complete!`"`n"
$UnixDeployScript += "echo `"`"`n"
$UnixDeployScript += "echo `"Next steps:`"`n"
$UnixDeployScript += "echo `"1. Configure environment variables in backend/.env`"`n"
$UnixDeployScript += "echo `"2. Run database migrations: cd backend; npx prisma migrate deploy`"`n"
$UnixDeployScript += "echo `"3. Start the backend: cd backend; npm start`"`n"
$UnixDeployScript += "echo `"`"`n"
$UnixDeployScript += "echo `"Frontend is pre-built and ready to serve from frontend/dist`"`n"
$UnixDeployScript += "echo `"`"`n"

Set-Content -Path "$ReleaseDir\deploy.sh" -Value $UnixDeployScript -NoNewline
Write-OK "Created Unix deployment script"

# Create package metadata
Write-StepHeader "Creating package metadata"
$PackageInfo = @{
    version = $Version
    packageVersion = $PackageVersion
    buildDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    nodeVersion = $NodeVersion
    platform = $PSVersionTable.Platform
    psVersion = $PSVersionTable.PSVersion.ToString()
    components = @{
        backend = @{
            version = $PackageVersion
            builtFiles = (Get-ChildItem "$ReleaseDir\backend\dist" -Recurse -File).Count
        }
        frontend = @{
            version = $PackageVersion
            builtFiles = (Get-ChildItem "$ReleaseDir\frontend\dist" -Recurse -File).Count
        }
    }
}

$PackageInfo | ConvertTo-Json -Depth 10 | Set-Content "$ReleaseDir\package-info.json"
Write-OK "Package metadata created"

# Create compressed archives
Write-StepHeader "Creating compressed archives"

$FullArchive = Join-Path $DistDir "RestoreAssist-$Version-full.zip"
Write-Detail "Creating full release archive..."
Compress-Archive -Path "$ReleaseDir\*" -DestinationPath $FullArchive -Force
Write-OK "Created full archive"

$BackendArchive = Join-Path $DistDir "RestoreAssist-$Version-backend.zip"
Write-Detail "Creating backend archive..."
Compress-Archive -Path "$ReleaseDir\backend\*", "$ReleaseDir\docs\*" -DestinationPath $BackendArchive -Force
Write-OK "Created backend archive"

$FrontendArchive = Join-Path $DistDir "RestoreAssist-$Version-frontend.zip"
Write-Detail "Creating frontend archive..."
Compress-Archive -Path "$ReleaseDir\frontend\*", "$ReleaseDir\docs\*" -DestinationPath $FrontendArchive -Force
Write-OK "Created frontend archive"

# Calculate checksums
Write-StepHeader "Calculating checksums"
$Checksums = @()

foreach ($Archive in @($FullArchive, $BackendArchive, $FrontendArchive)) {
    $Hash = (Get-FileHash -Path $Archive -Algorithm SHA256).Hash
    $FileName = Split-Path $Archive -Leaf
    $Size = (Get-Item $Archive).Length
    $SizeMB = [math]::Round($Size / 1MB, 2)

    $Checksums += @{
        file = $FileName
        sha256 = $Hash
        size = $Size
        sizeMB = $SizeMB
    }

    Write-Detail "$FileName - $SizeMB MB"
}

$ChecksumsJson = $Checksums | ConvertTo-Json -Depth 10
Set-Content -Path "$DistDir\checksums.json" -Value $ChecksumsJson

$ChecksumLines = @("RestoreAssist $Version - Checksums", "Generated: $CurrentDateTime", "")
foreach ($Checksum in $Checksums) {
    $ChecksumLines += "File: $($Checksum.file)"
    $ChecksumLines += "SHA256: $($Checksum.sha256)"
    $ChecksumLines += "Size: $($Checksum.sizeMB) MB"
    $ChecksumLines += ""
}
$ChecksumsText = $ChecksumLines -join "`n"

Set-Content -Path "$DistDir\checksums.txt" -Value $ChecksumsText
Write-OK "Checksums calculated and saved"

# Create git tag
Write-StepHeader "Checking git status"
try {
    $GitStatus = git status 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Detail "Git repository detected"
        $TagExists = git tag -l $Version
        if ($TagExists) {
            Write-Detail "Tag $Version already exists"
        } else {
            Write-Detail "Creating git tag $Version"
            git tag -a $Version -m "Release $Version"
            Write-OK "Git tag created: $Version"
            Write-Detail "Push tag with: git push origin $Version"
        }
    }
} catch {
    Write-Detail "Git not available or not a git repository"
}

# Generate release summary
Write-StepHeader "Release Summary"
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  RestoreAssist $Version - Release Complete!" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Release Directory:" -ForegroundColor Yellow
Write-Host "  $ReleaseDir"
Write-Host ""
Write-Host "Archives Created:" -ForegroundColor Yellow
foreach ($Checksum in $Checksums) {
    $FileName = $Checksum.file
    $FileSize = $Checksum.sizeMB
    Write-Host "  + $FileName ($FileSize MB)" -ForegroundColor Green
}
Write-Host ""
Write-Host "Package Contents:" -ForegroundColor Yellow
Write-Host "  + Backend API (compiled)" -ForegroundColor Green
Write-Host "  + Frontend application (built)" -ForegroundColor Green
Write-Host "  + Documentation" -ForegroundColor Green
Write-Host "  + Deployment scripts" -ForegroundColor Green
Write-Host "  + Release notes" -ForegroundColor Green
Write-Host "  + Package metadata" -ForegroundColor Green
Write-Host "  + Checksums" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Review release notes: $ReleaseDir\RELEASE_NOTES.md"
Write-Host "  2. Test the release package"
Write-Host "  3. Upload archives to GitHub/distribution platform"
Write-Host "  4. Push git tag: git push origin $Version"
Write-Host "  5. Create GitHub release with archives and checksums"
Write-Host ""
Write-Host "Distribution Archives Location:" -ForegroundColor Yellow
Write-Host "  $DistDir"
Write-Host ""

Set-Location $RepoRoot
Write-OK "Release package creation complete!"
exit 0
