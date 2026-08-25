#!/usr/bin/env sh
# Compare the checked-out Prisma migration population with production using a
# direct session connection. Prisma's exit code is the interface: unapplied,
# divergent or failed histories must make this release check red.
set -eu

if [ -z "${PRODUCTION_DIRECT_URL:-}" ]; then
  echo "[migration-parity] ERROR: PRODUCTION_DIRECT_URL is required." >&2
  exit 1
fi

if [ -z "${EXPECTED_DIRECT_DATABASE_HOST:-}" ] || \
   [ -z "${EXPECTED_DIRECT_DATABASE_NAME:-}" ] || \
   [ -z "${EXPECTED_DIRECT_DATABASE_SCHEMA:-}" ]; then
  echo "[migration-parity] ERROR: canonical database host, name and schema are required." >&2
  exit 1
fi

DIRECT_URL="$PRODUCTION_DIRECT_URL" node scripts/assert-direct-database-url.mjs

DATABASE_URL="$PRODUCTION_DIRECT_URL" DIRECT_URL="$PRODUCTION_DIRECT_URL" \
  npx --no-install prisma migrate status

DATABASE_URL="$PRODUCTION_DIRECT_URL" DIRECT_URL="$PRODUCTION_DIRECT_URL" \
  npx --no-install prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --exit-code

DATABASE_URL="$PRODUCTION_DIRECT_URL" DIRECT_URL="$PRODUCTION_DIRECT_URL" \
  npx --no-install tsx scripts/verify-live-rls.ts
