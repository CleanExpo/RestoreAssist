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

export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

pnpm exec prisma generate

case "$VERCEL_ENV" in
  preview|development)
    echo "[build] VERCEL_ENV=$VERCEL_ENV — skipping prisma migrate deploy (no prod DB in this env)"
    ;;
  *)
    if [ -z "$DATABASE_URL" ]; then
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
      pnpm exec prisma migrate deploy
      # Schema drift smoke test — guards against the failure mode where
      # `prisma migrate deploy` reports success but the DDL silently no-ops.
      # We hit this on 2026-05-12 with 24 columns missing across 7 tables.
      # Drift check is fail-fast: it aborts the build before next build runs.
      node scripts/check-schema-drift.mjs
    fi
    ;;
esac

next build
