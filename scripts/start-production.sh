#!/usr/bin/env sh
# Production startup is non-mutating. Database migrations are a separately
# approved release operation and must never be inferred from process startup.
set -eu

: "${DATABASE_URL:?[start] ERROR: DATABASE_URL is required.}"
: "${CREDENTIAL_ENCRYPTION_KEY:?[start] ERROR: CREDENTIAL_ENCRYPTION_KEY is required.}"
: "${NEXTAUTH_SECRET:?[start] ERROR: NEXTAUTH_SECRET is required.}"
: "${NEXTAUTH_URL:?[start] ERROR: NEXTAUTH_URL is required.}"
: "${GOOGLE_CLIENT_ID:?[start] ERROR: GOOGLE_CLIENT_ID is required.}"
: "${GOOGLE_CLIENT_SECRET:?[start] ERROR: GOOGLE_CLIENT_SECRET is required.}"
: "${NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID:?[start] ERROR: NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID is required.}"
: "${STRIPE_WEBHOOK_SECRET:?[start] ERROR: STRIPE_WEBHOOK_SECRET is required.}"

echo "[start] starting Next.js without applying or resolving migrations"
exec npx --no-install next start
