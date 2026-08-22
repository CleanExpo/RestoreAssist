#!/usr/bin/env sh
# Build pipeline (Vercel-only; DigitalOcean App Platform was decommissioned in 85ea27d8):
#   1. `prisma migrate deploy` runs on production builds only. Vercel
#      Preview/Development deployments don't see DATABASE_URL, so migrate deploy
#      would P1012 — those envs skip it.
#   2. RA-1807 FAIL-CLOSED: migrate DDL silently no-ops against Supabase's :6543
#      transaction pooler, so we HARD-FAIL the build when DIRECT_URL points at the
#      :6543 pooler. A direct :5432 connection passes (including CI's ephemeral
#      :5432 where DIRECT_URL == DATABASE_URL). (This was previously a non-fatal
#      warning — the silent no-op that a warning can't stop is how prod drifted.)
#   3. `prisma generate` always runs — only needs the schema, no env resolution.
#   4. `next build` runs last.
set -e

echo "[build] starting RestoreAssist build pipeline (prisma generate → migrate deploy when applicable → next build)"
echo "[build] NODE_ENV=${NODE_ENV:-unset} VERCEL_ENV=${VERCEL_ENV:-unset} HEROKU=${HEROKU:-unset}"

export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

npx prisma generate

case "$VERCEL_ENV" in
  preview|development)
    echo "[build] VERCEL_ENV=$VERCEL_ENV — skipping prisma migrate deploy (no prod DB in this env)"
    ;;
  *)
    if [ -z "$DATABASE_URL" ]; then
      # Cross-verifier finding (codex, PR #1972): lib/prisma.ts is now lazy, so a
      # production build without DATABASE_URL would SUCCEED and then 500 at the
      # first query. Fail the build instead — on Vercel production this env var
      # is mandatory. Local 'next build' without env (VERCEL_ENV unset) stays
      # allowed for hermetic build verification.
      if [ "$VERCEL_ENV" = "production" ]; then
        echo "[build] ERROR: VERCEL_ENV=production but DATABASE_URL is unset — refusing to ship a build that would 500 at first query (lazy PrismaClient)." >&2
        exit 1
      fi
      echo "[build] DATABASE_URL unset — skipping prisma migrate deploy (probably a local 'next build' without env)"
    else
      # RA-1807 fail-closed pre-flight: the drift vector is the :6543 TRANSACTION
      # POOLER, on which `prisma migrate deploy` DDL silently no-ops while
      # _prisma_migrations records success. Fail ONLY on that. DIRECT_URL falls
      # back to DATABASE_URL (line 15) when unset, so an unset DIRECT_URL against a
      # pooler DATABASE_URL is still caught here — while a direct :5432 connection
      # is fine even when DIRECT_URL == DATABASE_URL (CI's single ephemeral :5432,
      # or any host with no separate pooler URL). Do NOT reject equality per se.
      if echo "$DIRECT_URL" | grep -q ':6543'; then
        echo "[build] ERROR: DIRECT_URL points at the :6543 transaction pooler — 'prisma migrate deploy' DDL silently no-ops there (the RA-1807 drift root cause)." >&2
        echo "[build]        Set DIRECT_URL to the direct :5432 session connection on the deploy host, then redeploy." >&2
        exit 1
      fi
      # Heroku / managed Postgres: Node pg treats sslmode=require as verify-full,
      # which fails on self-signed chains (SELF_SIGNED_CERT_IN_CHAIN). Prisma
      # Heroku docs: use sslmode=no-verify. Scoped to this build shell only —
      # does not rewrite Config Vars / runtime app env permanently.
      eval "$(node scripts/lib/pg-ssl-for-migrate.mjs --export-shell)"

      # Capture migrate output so we can print a recovery hint on P3009 without
      # auto-dropping anything in production builds.
      migrate_log="$(mktemp "${TMPDIR:-/tmp}/prisma-migrate-XXXXXX.log")"
      if ! npx prisma migrate deploy >"$migrate_log" 2>&1; then
        cat "$migrate_log" >&2
        if grep -q 'P3009' "$migrate_log"; then
          echo "[build] ERROR: Prisma P3009 — target DB still has a failed migration recorded in _prisma_migrations (often left behind after a squash to 20260822000000_init)." >&2
          echo "[build]        This build will NOT wipe the database. For a fresh/non-critical app DB, reset then redeploy:" >&2
          echo "[build]          CONFIRM_DATA_LOSS=yes DATABASE_URL='postgresql://…' ./scripts/prisma-reset-for-baseline.sh" >&2
          echo "[build]        Or manually: DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;" >&2
          echo "[build]        then re-run this deploy so only 20260822000000_init applies." >&2
        fi
        rm -f "$migrate_log"
        exit 1
      fi
      cat "$migrate_log"
      rm -f "$migrate_log"
      # Schema drift smoke test — guards against the failure mode where
      # `prisma migrate deploy` reports success but the DDL silently no-ops.
      # We hit this on 2026-05-12 with 24 columns missing across 7 tables.
      #
      # Fail-closed by default (CI / local). On Heroku (DYNO / HEROKU_APP_NAME),
      # post-squash DBs can report residual drift or TLS/connect flakes that
      # must not block deploys. Default: warn + continue on Heroku. Escape hatches:
      #   SKIP_SCHEMA_DRIFT_CHECK=1 — always warn+continue (any host)
      #   SKIP_SCHEMA_DRIFT_CHECK=0 — force fail-closed even on Heroku
      skip_drift="${SKIP_SCHEMA_DRIFT_CHECK:-}"
      if [ -z "$skip_drift" ] && { [ -n "${DYNO:-}" ] || [ -n "${HEROKU_APP_NAME:-}" ]; }; then
        skip_drift=1
        echo "[build] Heroku detected (DYNO/HEROKU_APP_NAME) — schema drift check is warn-only (SKIP_SCHEMA_DRIFT_CHECK unset; set =0 to fail-closed)"
      fi
      if [ "$skip_drift" = "1" ]; then
        if ! SKIP_SCHEMA_DRIFT_CHECK=1 node scripts/check-schema-drift.mjs; then
          echo "[build] WARN: schema drift check exited non-zero with SKIP_SCHEMA_DRIFT_CHECK=1 — continuing deploy" >&2
        fi
      else
        node scripts/check-schema-drift.mjs
      fi
    fi
    ;;
esac

next build
