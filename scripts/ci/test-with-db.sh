#!/usr/bin/env bash
#
# RestoreAssist - run the unit suite the CI way (with a real Postgres).
#
# WHY: 16+ test files are gated with `describe.skipIf(!process.env.DATABASE_URL)`.
# Without a DB they SILENTLY SKIP, so a plain `vitest run` is not CI-representative
# (see scripts/ci/check-test-parity.mjs). This script stands up the SAME Postgres
# image CI uses (pgvector/pgvector:pg16), applies migrations, exports DATABASE_URL,
# and runs vitest - so "green here" means "green in CI".
#
# Mirrors .github/workflows/pr-checks.yml (Quality Checks > Unit tests).
#
# Usage:
#   pnpm test:db                 # full suite against an ephemeral DB
#   pnpm test:db <vitest args>   # e.g. pnpm test:db lib/setup
#
# Requires Docker. The container is named ra-ci-pg and is removed on exit.
set -euo pipefail

CONTAINER=ra-ci-pg
IMAGE=pgvector/pgvector:pg16
PORT=${RA_CI_PG_PORT:-5433}   # 5433 to avoid clashing with a local 5432
export DATABASE_URL="postgresql://ci:ci@localhost:${PORT}/ci"
export DIRECT_URL="$DATABASE_URL"

if ! command -v docker >/dev/null 2>&1; then
  echo "test:db needs Docker (CI uses a pgvector/pgvector:pg16 service)." >&2
  echo "Install Docker, or run only the non-DB suites with: pnpm exec vitest run" >&2
  exit 127
fi

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "==> Starting ephemeral Postgres ($IMAGE) on :$PORT"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_USER=ci -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=ci \
  -p "${PORT}:5432" "$IMAGE" >/dev/null

echo "==> Waiting for Postgres to accept connections"
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U ci -d ci >/dev/null 2>&1; then break; fi
  sleep 1
  if [ "$i" = "30" ]; then echo "Postgres did not become ready" >&2; exit 1; fi
done

# Mirror CI: stub the Supabase auth schema so migrations referencing auth.* apply.
echo "==> Bootstrapping auth.uid() stub (matches CI)"
docker exec -e PGPASSWORD=ci "$CONTAINER" psql -h localhost -U ci -d ci -c "
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS \$\$ SELECT NULL::uuid \$\$;
" >/dev/null

echo "==> Generating Prisma client"
pnpm exec prisma generate >/dev/null

# Mirror CI: mark CONCURRENTLY-index migrations as applied (Supabase-only syntax
# that fails on plain pgvector). Keep this list in sync with pr-checks.yml.
echo "==> Pre-resolving CONCURRENTLY migrations (matches CI)"
for mig in \
  20260407_n1_performance_indexes \
  20260407_perf_composite_indexes \
  20260516010000_inspection_close_terminal_index; do
  pnpm exec prisma migrate resolve --applied "$mig" >/dev/null 2>&1 || true
done

echo "==> Applying migrations"
pnpm exec prisma migrate deploy >/dev/null

echo "==> Verifying CI parity (no env-gated suite will skip)"
node scripts/ci/check-test-parity.mjs --strict

echo "==> Running vitest with DATABASE_URL set"
pnpm exec vitest run "$@"
