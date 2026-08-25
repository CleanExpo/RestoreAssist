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
: "${GIT_SHA:?[start] ERROR: GIT_SHA is required.}"

if [ "${#GIT_SHA}" -ne 40 ]; then
  echo "[start] ERROR: GIT_SHA must be exactly 40 lowercase hexadecimal characters." >&2
  exit 1
fi
case "$GIT_SHA" in
  *[!0-9a-f]*)
    echo "[start] ERROR: GIT_SHA must be exactly 40 lowercase hexadecimal characters." >&2
    exit 1
    ;;
esac

echo "[start] RestoreAssist standalone — commit ${GIT_SHA}"
echo "[start] starting Next.js without applying or resolving migrations"
exec node server.js
