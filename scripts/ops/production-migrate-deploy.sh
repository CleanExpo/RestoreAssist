#!/usr/bin/env bash
# Run prisma migrate deploy against DATABASE_URL (production or staging).
# Usage: DATABASE_URL='postgresql://...' ./scripts/ops/production-migrate-deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

echo "Running prisma migrate deploy…"
npx prisma migrate deploy

echo "Done. Verify GET /api/inspections and /api/health on the target app."
