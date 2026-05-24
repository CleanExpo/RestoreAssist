#!/usr/bin/env sh
set -eu

PNPM_VERSION="9.15.9"
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

print_problem() {
  printf "\nError:\n%s\nCause:\n%s\nFix:\n%s\nNext action:\n%s\n" "$1" "$2" "$3" "$4"
}

major_version() {
  printf "%s" "$1" | sed 's/^v//' | cut -d. -f1
}

echo "[bootstrap] RestoreAssist environment bootstrap"
echo "[bootstrap] repo: $REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  print_problem "Node.js is unavailable." "The shell PATH does not include a Node.js runtime." "Install Node.js 20.x or 22.x, then reopen the shell." "Re-run scripts/bootstrap-restoreassist-env.sh."
  exit 1
fi

NODE_VERSION="$(node -v)"
NODE_MAJOR="$(major_version "$NODE_VERSION")"
if [ "$NODE_MAJOR" != "20" ] && [ "$NODE_MAJOR" != "22" ]; then
  print_problem "Unsupported Node.js version: $NODE_VERSION." "RestoreAssist package.json allows Node 20.x or 22.x." "Install Node.js 20.x or 22.x. .nvmrc currently pins 20.18.0 for CI parity." "Re-run this bootstrap script after switching Node."
  exit 1
fi
echo "[bootstrap] node: $NODE_VERSION"

if command -v corepack >/dev/null 2>&1; then
  echo "[bootstrap] corepack: $(corepack --version)"
  corepack enable
  corepack prepare "pnpm@$PNPM_VERSION" --activate
elif command -v npm >/dev/null 2>&1; then
  echo "[bootstrap] corepack unavailable; installing pnpm@$PNPM_VERSION as global tooling via npm"
  npm install -g "pnpm@$PNPM_VERSION"
else
  print_problem "Neither corepack nor npm is available." "The shell cannot activate pnpm." "Install Node.js with corepack or npm available." "Re-run this bootstrap script."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  NPM_PREFIX="$(npm prefix -g 2>/dev/null || true)"
  if [ -n "$NPM_PREFIX" ] && [ -x "$NPM_PREFIX/bin/pnpm" ]; then
    export PATH="$NPM_PREFIX/bin:$PATH"
  fi
fi

if ! command -v pnpm >/dev/null 2>&1; then
  print_problem "pnpm is still unavailable after activation." "Global npm binaries may not be on PATH." "Add the npm global bin directory to PATH or symlink pnpm into a directory already on PATH." "Run 'npm prefix -g' to find the global prefix, then re-run this script."
  exit 1
fi

ACTUAL_PNPM_VERSION="$(pnpm --version)"
if [ "$ACTUAL_PNPM_VERSION" != "$PNPM_VERSION" ]; then
  print_problem "pnpm version mismatch: $ACTUAL_PNPM_VERSION." "RestoreAssist pins packageManager to pnpm@$PNPM_VERSION." "Run 'corepack prepare pnpm@$PNPM_VERSION --activate' or install pnpm@$PNPM_VERSION globally." "Re-run this bootstrap script."
  exit 1
fi
echo "[bootstrap] pnpm: $ACTUAL_PNPM_VERSION"

cd "$REPO_ROOT"

if [ ! -f pnpm-lock.yaml ]; then
  print_problem "pnpm-lock.yaml is missing." "RestoreAssist uses pnpm as the only repo package manager." "Restore pnpm-lock.yaml before installing dependencies." "Stop Phase 0 and repair package manager state."
  exit 1
fi

for disallowed_lockfile in package-lock.json yarn.lock bun.lockb bun.lock; do
  if [ -f "$disallowed_lockfile" ]; then
    print_problem "Unexpected lockfile found: $disallowed_lockfile." "Multiple package manager lockfiles make installs non-deterministic." "Remove the non-pnpm lockfile and keep pnpm-lock.yaml authoritative." "Re-run this bootstrap script."
    exit 1
  fi
done

echo "[bootstrap] installing dependencies from pnpm-lock.yaml"
pnpm install --frozen-lockfile

echo "[bootstrap] generating Prisma client"
pnpm prisma:generate

echo "[bootstrap] running baseline validation"
pnpm type-check
pnpm lint
pnpm exec vitest run

echo "[bootstrap] PASS: local RestoreAssist validation environment is ready for Phase 1."
