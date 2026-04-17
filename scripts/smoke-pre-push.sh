#!/bin/bash
# Pre-push smoke test — reproduces Vercel's build environment locally.
# Catches: missing committed files, Turbopack-specific errors, Prisma schema drift,
# stale generated client. Run BEFORE pushing to avoid Vercel failure loops.
#
# Usage: bash scripts/smoke-pre-push.sh

set -e

echo "━━━ Smoke test: reproducing Vercel build locally ━━━"

# 1. Verify all imported files are tracked in git (catches "module not found" class)
echo "▶ Checking for untracked imports..."
UNTRACKED=$(git ls-files --others --exclude-standard -- 'lib/**/*.ts' 'app/**/*.ts' 'components/**/*.ts' 'components/**/*.tsx' 2>/dev/null || true)
if [ -n "$UNTRACKED" ]; then
  echo "  ⚠ Untracked TS files found — make sure none are imported by tracked files:"
  echo "$UNTRACKED" | sed 's/^/    /'
fi

# 2. Fresh Prisma generate (matches Vercel's build cache miss)
echo "▶ Fresh prisma generate..."
pnpm prisma:generate > /dev/null

# 3. TypeScript check (authoritative)
echo "▶ pnpm type-check..."
pnpm type-check

# 4. Turbopack build (same engine Vercel uses for Next 16)
echo "▶ next build --turbopack..."
npx next build --turbopack 2>&1 | tee /tmp/smoke-build.log | tail -5
if grep -qE "Build error occurred|Module not found|Turbopack build failed|Type error:" /tmp/smoke-build.log; then
  echo "✘ Build failed — check /tmp/smoke-build.log"
  exit 1
fi

echo "━━━ ✓ Smoke passed — safe to push ━━━"
