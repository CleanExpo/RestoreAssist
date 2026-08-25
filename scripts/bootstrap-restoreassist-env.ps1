$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Write-Problem {
  param(
    [string]$ErrorText,
    [string]$Cause,
    [string]$Fix,
    [string]$NextAction
  )

  Write-Host ""
  Write-Host "Error:"
  Write-Host $ErrorText
  Write-Host "Cause:"
  Write-Host $Cause
  Write-Host "Fix:"
  Write-Host $Fix
  Write-Host "Next action:"
  Write-Host $NextAction
}

Write-Host "[bootstrap] RestoreAssist environment bootstrap"
Write-Host "[bootstrap] repo: $RepoRoot"

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCommand) {
  Write-Problem "Node.js is unavailable." "The shell PATH does not include a Node.js runtime." "Install Node.js 20.x or 22.x, then reopen PowerShell." "Re-run scripts/bootstrap-restoreassist-env.ps1."
  exit 1
}

$NodeVersion = (& node -v)
$NodeMajor = $NodeVersion.TrimStart("v").Split(".")[0]
if ($NodeMajor -ne "22") {
  Write-Problem "Unsupported Node.js version: $NodeVersion." "Phase 0 validation requires Node 22.x because the current Vitest/jsdom dependency graph fails under CI Node 20 with ERR_REQUIRE_ESM." "Install Node.js 22.x. .nvmrc currently pins 22.22.3 for CI parity." "Re-run this bootstrap script after switching Node."
  exit 1
}
Write-Host "[bootstrap] node: $NodeVersion"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Problem "npm is unavailable." "The Node.js installation does not expose npm on PATH." "Install the complete Node.js 22.x distribution." "Re-run this bootstrap script."
  exit 1
}
Write-Host "[bootstrap] npm: $(& npm --version)"

Set-Location $RepoRoot

if (-not (Test-Path "package-lock.json")) {
  Write-Problem "package-lock.json is missing." "RestoreAssist uses npm ci and package-lock.json as its dependency source of truth." "Restore the committed package-lock.json before installing dependencies." "Stop Phase 0 and repair package manager state."
  exit 1
}

@("pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock") | ForEach-Object {
  if (Test-Path $_) {
    Write-Problem "Unexpected lockfile found: $_." "Multiple package manager lockfiles make installs non-deterministic." "Remove the non-npm lockfile and keep package-lock.json authoritative." "Re-run this bootstrap script."
    exit 1
  }
}

Write-Host "[bootstrap] validating release bootstrap contract"
& node scripts/ci/check-release-bootstrap.mjs

Write-Host "[bootstrap] installing dependencies from package-lock.json"
& npm ci

Write-Host "[bootstrap] generating Prisma client"
& npm run prisma:generate

Write-Host "[bootstrap] running baseline validation"
& npm run type-check
& npm run lint
& npm run test:unit

Write-Host "[bootstrap] PASS: local RestoreAssist validation environment is ready for Phase 1."
