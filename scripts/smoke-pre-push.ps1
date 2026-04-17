# Pre-push smoke test — reproduces Vercel's build environment locally.
# Catches: missing committed files, Turbopack errors, Prisma schema drift, stale generated client.
# Usage: pwsh scripts/smoke-pre-push.ps1
#
# Runs on Windows PowerShell natively (no WSL) so pnpm/node_modules resolve correctly.
# Bumps Node heap to 8GB because tsc on this monorepo OOMs at the default 2GB.

$ErrorActionPreference = "Stop"
$env:NODE_OPTIONS = "--max-old-space-size=8192"

Write-Host "━━━ Smoke test: reproducing Vercel build locally ━━━" -ForegroundColor Cyan

# 1. Warn on untracked TS files that might be imported
Write-Host "▶ Checking for untracked TS files..." -ForegroundColor Yellow
$untracked = git ls-files --others --exclude-standard -- 'lib/*.ts' 'lib/**/*.ts' 'app/**/*.ts' 'components/**/*.ts' 'components/**/*.tsx' 2>$null
if ($untracked) {
  Write-Host "  ⚠ Untracked — commit if imported by tracked files:" -ForegroundColor Yellow
  $untracked | ForEach-Object { Write-Host "    $_" }
}

# 2. Fresh Prisma generate (matches Vercel cache miss)
Write-Host "▶ pnpm prisma:generate..." -ForegroundColor Yellow
pnpm prisma:generate | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "✘ prisma generate failed" -ForegroundColor Red; exit 1 }

# 3. TypeScript check
Write-Host "▶ pnpm type-check (8GB heap)..." -ForegroundColor Yellow
pnpm type-check
if ($LASTEXITCODE -ne 0) { Write-Host "✘ type-check failed" -ForegroundColor Red; exit 1 }

# 4. Turbopack build (same engine Vercel uses for Next 16)
Write-Host "▶ next build --turbopack..." -ForegroundColor Yellow
$buildLog = "$env:TEMP\ra-smoke-build.log"
npx next build --turbopack 2>&1 | Tee-Object -FilePath $buildLog | Select-Object -Last 5
$failPattern = "Build error occurred|Module not found|Turbopack build failed|Type error:|Failed to compile"
if ((Get-Content $buildLog | Select-String -Pattern $failPattern -Quiet)) {
  Write-Host "✘ Build failed — see $buildLog" -ForegroundColor Red
  exit 1
}

Write-Host "━━━ ✓ Smoke passed — safe to push ━━━" -ForegroundColor Green
