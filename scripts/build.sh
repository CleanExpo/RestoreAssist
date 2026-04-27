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

npx prisma generate

case "$VERCEL_ENV" in
  preview|development)
    echo "[build] VERCEL_ENV=$VERCEL_ENV — skipping prisma migrate deploy (no prod DB in this env)"
    ;;
  *)
    if [ -z "$DATABASE_URL" ]; then
      echo "[build] DATABASE_URL unset — skipping prisma migrate deploy (probably a local 'next build' without env)"
    else
      npx prisma migrate deploy
    fi
    ;;
esac

next build
