#!/usr/bin/env bash
# W5-4 — operations smoke (non-production)
set -euo pipefail

if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  echo "Refusing to run W5-4 on production." >&2
  exit 1
fi

echo "=== Wave 5 operations smoke ==="
bash scripts/wave-program-verify.sh

echo ""
echo "Manual (manager session):"
echo "  GET /api/operations/completeness-inbox  → data + summary"
echo "  GET /api/operations/program-status      → waves + operations + slo"
echo "  /dashboard/operations/completeness-inbox → Program status panel"
echo ""
echo "Optional (server must be up):"
echo "  SLO_BASE_URL=http://127.0.0.1:3000 pnpm exec tsx scripts/slo-load-harness.ts"
echo ""
echo "Doc: docs/internal/planning/WAVE-PILOT-RUNBOOKS.md (W5-1, W5-5)"
echo "Done."