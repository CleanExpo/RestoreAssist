#!/usr/bin/env bash
# W1-5 — non-production journey smoke (RA-7228 / RA-8184)
set -euo pipefail

if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  echo "Refusing to run W1-5 on production (VERCEL_ENV=production)." >&2
  exit 1
fi

echo "=== W1-5 staging journey ==="
echo "1) Seed (optional — run manually if DB empty):"
echo "   npx tsx prisma/seed-demo.ts"
echo "   npx tsx prisma/seed-demo-inspection.ts"
echo ""
echo "2) Unit checks (trust layer):"
pnpm exec vitest run \
  lib/evidence/__tests__/field-capture-time.test.ts \
  app/api/integrations/health/__tests__/sync-receipts.test.ts \
  lib/integrations/__tests__/oauth-live-probe.test.ts

echo ""
echo "3) Optional Playwright:"
echo "   pnpm exec playwright test e2e/walkthrough --project=chromium"
echo ""
echo "Manual RA-8184 checklist: see wave program runbooks PR (W1-5)"
echo "Done."