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
      # 2026-06-03: Resolve previously-half-applied migration.
      # The migration 20260524231500_add_voice_copilot_sessions partially applied (table exists)
      # but the Prisma migrations tracker still shows it as failed/pending.
      # Marking it as applied allows deploy to proceed.
      echo "[build] Resolving half-applied migration 20260524231500_add_voice_copilot_sessions ($($(dirname $0)/get_version)...)"
      pnpm exec prisma migrate resolve --applied "20260524231500_add_voice_copilot_sessions" || true

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
