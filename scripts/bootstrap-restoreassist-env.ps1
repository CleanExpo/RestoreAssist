$ErrorActionPreference = "Stop"

$PnpmVersion = "9.15.9"
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
if ($NodeMajor -ne "20" -and $NodeMajor -ne "22") {
  Write-Problem "Unsupported Node.js version: $NodeVersion." "RestoreAssist package.json allows Node 20.x or 22.x." "Install Node.js 20.x or 22.x. .nvmrc currently pins 20.18.0 for CI parity." "Re-run this bootstrap script after switching Node."
  exit 1
}
Write-Host "[bootstrap] node: $NodeVersion"

$CorepackCommand = Get-Command corepack -ErrorAction SilentlyContinue
if ($CorepackCommand) {
  Write-Host "[bootstrap] corepack: $(& corepack --version)"
  & corepack enable
  & corepack prepare "pnpm@$PnpmVersion" --activate
} elseif (Get-Command npm -ErrorAction SilentlyContinue) {
  Write-Host "[bootstrap] corepack unavailable; installing pnpm@$PnpmVersion as global tooling via npm"
  & npm install -g "pnpm@$PnpmVersion"
} else {
  Write-Problem "Neither corepack nor npm is available." "The shell cannot activate pnpm." "Install Node.js with corepack or npm available." "Re-run this bootstrap script."
  exit 1
}

$PnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $PnpmCommand -and (Get-Command npm -ErrorAction SilentlyContinue)) {
  $NpmPrefix = (& npm prefix -g)
  $NpmBin = Join-Path $NpmPrefix "bin"
  if (Test-Path (Join-Path $NpmBin "pnpm")) {
    $env:PATH = "$NpmBin$([IO.Path]::PathSeparator)$env:PATH"
  }
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Problem "pnpm is still unavailable after activation." "Global npm binaries may not be on PATH." "Add the npm global bin directory to PATH." "Run 'npm prefix -g' to find the global prefix, then re-run this script."
  exit 1
}

$ActualPnpmVersion = (& pnpm --version)
if ($ActualPnpmVersion -ne $PnpmVersion) {
  Write-Problem "pnpm version mismatch: $ActualPnpmVersion." "RestoreAssist pins packageManager to pnpm@$PnpmVersion." "Run 'corepack prepare pnpm@$PnpmVersion --activate' or install pnpm@$PnpmVersion globally." "Re-run this bootstrap script."
  exit 1
}
Write-Host "[bootstrap] pnpm: $ActualPnpmVersion"

Set-Location $RepoRoot

if (-not (Test-Path "pnpm-lock.yaml")) {
  Write-Problem "pnpm-lock.yaml is missing." "RestoreAssist uses pnpm as the only repo package manager." "Restore pnpm-lock.yaml before installing dependencies." "Stop Phase 0 and repair package manager state."
  exit 1
}

@("package-lock.json", "yarn.lock", "bun.lockb", "bun.lock") | ForEach-Object {
  if (Test-Path $_) {
    Write-Problem "Unexpected lockfile found: $_." "Multiple package manager lockfiles make installs non-deterministic." "Remove the non-pnpm lockfile and keep pnpm-lock.yaml authoritative." "Re-run this bootstrap script."
    exit 1
  }
}

Write-Host "[bootstrap] installing dependencies from pnpm-lock.yaml"
& pnpm install --frozen-lockfile

Write-Host "[bootstrap] generating Prisma client"
& pnpm prisma:generate

Write-Host "[bootstrap] running baseline validation"
& pnpm type-check
& pnpm lint
& pnpm exec vitest run

Write-Host "[bootstrap] PASS: local RestoreAssist validation environment is ready for Phase 1."
