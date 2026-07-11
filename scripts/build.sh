#!/usr/bin/env sh
# Build pipeline:
#   1. DIRECT_URL falls back to DATABASE_URL when unset (DO App Platform + Vercel Preview both lack a separate session-mode URL).
#   2. `prisma migrate deploy` only runs when we actually have a DB to migrate — production builds only.
#      Vercel Preview/Development deployments don't see DATABASE_URL, so migrate deploy would P1012.
#      DigitalOcean's App Platform always runs production, so migrate deploy always executes there.
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
      # RA-1807 pre-flight (non-fatal): `prisma migrate deploy` DDL silently
      # no-ops against Supabase's transaction pooler. DIRECT_URL falls back to
      # DATABASE_URL (line 11) when unset — on hosts without a separate direct
      # URL (e.g. DO App Platform) that means migrate runs on the :6543 pooler.
      # Warn loudly so a no-op is diagnosable up-front; check-schema-drift.mjs
      # below is still the hard fail-closed gate.
      if [ "$DIRECT_URL" = "$DATABASE_URL" ] || echo "$DIRECT_URL" | grep -q ':6543'; then
        echo "[build] WARNING: DIRECT_URL is unset or points at the transaction pooler (:6543) — 'prisma migrate deploy' DDL may silently no-op. Set DIRECT_URL to the direct :5432 connection to avoid schema drift. (RA-1807)"
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
