#!/usr/bin/env bash
# Full-functionality program (waves 0–6) — unit verification gate
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Wave program unit verification ==="
pnpm exec vitest run --config config/vitest.config.js \
  lib/api/__tests__/parse-iso-query.test.ts \
  lib/automation/__tests__/v1-auth.test.ts \
  lib/evidence/__tests__/field-capture-time.test.ts \
  lib/evidence/__tests__/wave0-claim-bridge.test.ts \
  lib/evidence/__tests__/claim-type.test.ts \
  lib/evidence/__tests__/supplementary-evidence-counts.test.ts \
  lib/evidence/__tests__/ensure-inspection-workflow.test.ts \
  lib/evidence/__tests__/submission-gate.test.ts \
  lib/evidence/__tests__/field-evidence-audit.test.ts \
  lib/completeness/__tests__/inbox-stall-summary.test.ts \
  lib/operations/__tests__/ \
  lib/integrations/__tests__/oauth-live-probe.test.ts \
  lib/export/__tests__/scope-adjuster-csv.test.ts \
  lib/analytics/__tests__/job-margin.test.ts \
  lib/reports/__tests__/manager-send-gate.test.ts \
  lib/cloud-mirror/__tests__/catalog.onedrive-hidden.test.ts \
  app/api/integrations/health/__tests__/sync-receipts.test.ts \
  app/api/reports/\[id\]/send/__tests__/route.test.ts

echo "Done — wave program unit gate passed."