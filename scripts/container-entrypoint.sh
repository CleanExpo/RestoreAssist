#!/usr/bin/env sh
# Container startup is non-mutating. Production migrations remain a separate,
# protected release operation and are never inferred from application startup.
set -eu

: "${DATABASE_URL:?[container-start] ERROR: DATABASE_URL is required.}"
: "${CREDENTIAL_ENCRYPTION_KEY:?[container-start] ERROR: CREDENTIAL_ENCRYPTION_KEY is required.}"
: "${NEXTAUTH_SECRET:?[container-start] ERROR: NEXTAUTH_SECRET is required.}"
: "${NEXTAUTH_URL:?[container-start] ERROR: NEXTAUTH_URL is required.}"
: "${GOOGLE_CLIENT_ID:?[container-start] ERROR: GOOGLE_CLIENT_ID is required.}"
: "${GOOGLE_CLIENT_SECRET:?[container-start] ERROR: GOOGLE_CLIENT_SECRET is required.}"
: "${NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID:?[container-start] ERROR: NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID is required.}"
: "${STRIPE_WEBHOOK_SECRET:?[container-start] ERROR: STRIPE_WEBHOOK_SECRET is required.}"
: "${GIT_SHA:?[container-start] ERROR: GIT_SHA is required.}"

if [ "${#GIT_SHA}" -ne 40 ]; then
  echo "[container-start] ERROR: GIT_SHA must be exactly 40 lowercase hexadecimal characters." >&2
  exit 1
fi
case "$GIT_SHA" in
  *[!0-9a-f]*)
    echo "[container-start] ERROR: GIT_SHA must be exactly 40 lowercase hexadecimal characters." >&2
    exit 1
    ;;
esac

echo "[container-start] starting immutable RestoreAssist image at $GIT_SHA"
exec node server.js
