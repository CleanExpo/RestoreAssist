#!/usr/bin/env bash
#
# RA-4956 — runnable RLS tenant-isolation harness.
#
# Applies the REAL RA-4956 migration to an EPHEMERAL Postgres, seeds two
# tenants, and asserts row isolation under the `authenticated` role. Exits
# non-zero on any isolation breach.
#
# THIS NEVER TOUCHES A REMOTE / PROD DATABASE. It requires a DATABASE_URL that
# points at a local, disposable Postgres. The script refuses obvious prod hosts.
#
# ── One-command usage ───────────────────────────────────────────────────────
#
#   Option 1 — Supabase local stack (recommended; provides auth.* natively):
#       supabase start                 # in repo root, needs Docker
#       DATABASE_URL="$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
#         scripts/rls-harness/run.sh
#
#   Option 2 — disposable docker postgres (no Supabase CLI needed):
#       docker run -d --rm --name ra-rls-pg -e POSTGRES_PASSWORD=pw \
#         -p 55432:5432 postgres:16
#       DATABASE_URL="postgres://postgres:pw@localhost:55432/postgres" \
#         scripts/rls-harness/run.sh
#       docker rm -f ra-rls-pg
#
#   Option 3 — Makefile shortcut (spins up + tears down docker for you):
#       make -f scripts/rls-harness/Makefile rls-test
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/prisma/migrations/20260614000000_ra_4956_tenant_scoped_rls_policies/migration.sql"
ENABLE_MIGRATION="$REPO/docs/ops/supabase-migrations-archive/20260518_enable_rls_phase_1_close_anon_exposure.sql"

: "${DATABASE_URL:?Set DATABASE_URL to a LOCAL/EPHEMERAL Postgres (see header).}"

# ── Safety: refuse anything that looks like a managed/remote/prod database ───
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*|*amazonaws*|*neon.tech*|*render.com*|*railway*|*.app/*|*pooler.*)
    echo "REFUSING: DATABASE_URL looks remote/managed. This harness is LOCAL-ONLY." >&2
    exit 2
    ;;
esac
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*|*@db:*|*@postgres:*|*host.docker.internal*) ;;
  *)
    echo "REFUSING: DATABASE_URL host is not localhost/known-local. Aborting for safety." >&2
    echo "  (Edit this guard only if you are CERTAIN the target is disposable.)" >&2
    exit 2
    ;;
esac

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet)

echo "── [1/5] Supabase compatibility shim (auth.uid, roles)…"
"${PSQL[@]}" -f "$HERE/00_supabase_shim.sql"

echo "── [2/5] Minimal real-schema subset…"
"${PSQL[@]}" -f "$HERE/01_schema_min.sql"

echo "── [3/5] Apply RA-4970 ENABLE-RLS migration (real file, env-tolerant)…"
"${PSQL[@]}" -f "$ENABLE_MIGRATION"

echo "── [4/5] Apply RA-4956 tenant-policy migration (real file, UNMODIFIED)…"
"${PSQL[@]}" -f "$MIGRATION"

echo "── [5/5] Seed two tenants + assert isolation…"
"${PSQL[@]}" -f "$HERE/02_seed.sql"
"${PSQL[@]}" -f "$HERE/03_assert_isolation.sql"

echo ""
echo "✓✓ RA-4956 RLS harness completed — tenant isolation verified against $DATABASE_URL"
