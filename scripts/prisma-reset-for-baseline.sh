#!/usr/bin/env sh
# Wipe public schema + apply the single Prisma baseline (`20260822000000_init`).
#
# Use when a deploy DB is stuck on P3009 after a migration squash (failed mid-chain
# history in `_prisma_migrations` + partial tables). Prefer this over
# `migrate resolve` when the schema is incomplete / non-critical.
#
# Does NOT run from scripts/build.sh — never auto-drop on deploy.
#
# Usage:
#   CONFIRM_DATA_LOSS=yes DATABASE_URL='postgresql://...' ./scripts/prisma-reset-for-baseline.sh
#
# Optional:
#   DIRECT_URL=...          # preferred for migrate if set (session :5432)
#   ALLOW_LOCALHOST=1       # required if URL host is localhost / 127.0.0.1
set -eu

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is required." >&2
  echo "  CONFIRM_DATA_LOSS=yes DATABASE_URL='postgresql://...' $0" >&2
  exit 1
fi

if [ "${CONFIRM_DATA_LOSS:-}" != "yes" ]; then
  echo "ERROR: Refusing to wipe without CONFIRM_DATA_LOSS=yes" >&2
  echo "  This DROP SCHEMA public CASCADE destroys all tables in public." >&2
  exit 1
fi

# Mask password for logs: scheme://user:***@host:port/db
mask_url() {
  printf '%s' "$1" | sed -E 's#(://[^:/@]+:)[^@]+(@)#\1***\2#'
}

host_from_url() {
  printf '%s' "$1" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://([^@/]*@)?([^:/?]+).*#\2#'
}

TARGET_URL="${DIRECT_URL:-$DATABASE_URL}"
HOST="$(host_from_url "$TARGET_URL")"
case "$HOST" in
  localhost|127.0.0.1|::1)
    if [ "${ALLOW_LOCALHOST:-}" != "1" ]; then
      echo "ERROR: Target host looks local ($HOST). Set ALLOW_LOCALHOST=1 to proceed." >&2
      exit 1
    fi
    ;;
esac

export DATABASE_URL
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

echo "[prisma-reset] target (masked): $(mask_url "$TARGET_URL")"
echo "[prisma-reset] host: $HOST"
echo "[prisma-reset] DROP SCHEMA public CASCADE + CREATE SCHEMA public …"

SQL_FILE="$(mktemp "${TMPDIR:-/tmp}/prisma-reset-XXXXXX.sql")"
trap 'rm -f "$SQL_FILE"' EXIT

cat >"$SQL_FILE" <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
GRANT ALL ON SCHEMA public TO CURRENT_USER;
SQL

npx prisma db execute --file "$SQL_FILE"

echo "[prisma-reset] prisma migrate deploy …"
npx prisma migrate deploy

echo "[prisma-reset] done — baseline should be the only applied migration."
npx prisma migrate status || true
