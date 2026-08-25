#!/usr/bin/env sh
# Mirrors scripts/start-production.sh for the standalone container.
#
# Standalone output is started with `node server.js`, not `next start`, so the
# repo's start script cannot be reused directly. The required-env contract is
# reproduced verbatim: fail loudly at boot rather than 500 on first request.
#
# Non-mutating by design. No migration is applied or resolved here. Applying
# migrations is a separate, approved, exact-revision operation.
set -eu

: "${DATABASE_URL:?[start] ERROR: DATABASE_URL is required.}"
: "${CREDENTIAL_ENCRYPTION_KEY:?[start] ERROR: CREDENTIAL_ENCRYPTION_KEY is required.}"
: "${NEXTAUTH_SECRET:?[start] ERROR: NEXTAUTH_SECRET is required.}"
: "${NEXTAUTH_URL:?[start] ERROR: NEXTAUTH_URL is required.}"
: "${GOOGLE_CLIENT_ID:?[start] ERROR: GOOGLE_CLIENT_ID is required.}"
: "${GOOGLE_CLIENT_SECRET:?[start] ERROR: GOOGLE_CLIENT_SECRET is required.}"
: "${NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID:?[start] ERROR: NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID is required.}"
: "${STRIPE_WEBHOOK_SECRET:?[start] ERROR: STRIPE_WEBHOOK_SECRET is required.}"

echo "[start] RestoreAssist standalone — commit ${GIT_SHA:-unknown}"
echo "[start] starting Next.js without applying or resolving migrations"
exec node server.js
