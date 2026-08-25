#!/usr/bin/env sh
set -eu

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
if [ "$NODE_MAJOR" != "22" ]; then
  print_problem "Unsupported Node.js version: $NODE_VERSION." "Phase 0 validation requires Node 22.x because the current Vitest/jsdom dependency graph fails under CI Node 20 with ERR_REQUIRE_ESM." "Install Node.js 22.x. .nvmrc currently pins 22.22.3 for CI parity." "Re-run this bootstrap script after switching Node."
  exit 1
fi
echo "[bootstrap] node: $NODE_VERSION"

if ! command -v npm >/dev/null 2>&1; then
  print_problem "npm is unavailable." "The Node.js installation does not expose npm on PATH." "Install the complete Node.js 22.x distribution." "Re-run this bootstrap script."
  exit 1
fi
echo "[bootstrap] npm: $(npm --version)"

cd "$REPO_ROOT"

if [ ! -f package-lock.json ]; then
  print_problem "package-lock.json is missing." "RestoreAssist uses npm ci and package-lock.json as its dependency source of truth." "Restore the committed package-lock.json before installing dependencies." "Stop Phase 0 and repair package manager state."
  exit 1
fi

for disallowed_lockfile in pnpm-lock.yaml yarn.lock bun.lockb bun.lock; do
  if [ -f "$disallowed_lockfile" ]; then
    print_problem "Unexpected lockfile found: $disallowed_lockfile." "Multiple package manager lockfiles make installs non-deterministic." "Remove the non-npm lockfile and keep package-lock.json authoritative." "Re-run this bootstrap script."
    exit 1
  fi
done

echo "[bootstrap] validating release bootstrap contract"
node scripts/ci/check-release-bootstrap.mjs

echo "[bootstrap] installing dependencies from package-lock.json"
npm ci

echo "[bootstrap] generating Prisma client"
npm run prisma:generate

echo "[bootstrap] running baseline validation"
npm run type-check
npm run lint
npm run test:unit

echo "[bootstrap] PASS: local RestoreAssist validation environment is ready for Phase 1."
