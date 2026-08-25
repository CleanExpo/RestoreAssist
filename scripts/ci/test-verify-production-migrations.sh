#!/usr/bin/env sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/restoreassist-migration-parity-test-XXXXXX")"
trap 'rm -rf "$fixture_root"' EXIT HUP INT TERM
mkdir -p "$fixture_root/bin"

printf '%s\n' '#!/usr/bin/env sh' \
  'printf '\''npx %s|DATABASE_URL=%s|DIRECT_URL=%s\n'\'' "$*" "$DATABASE_URL" "$DIRECT_URL" >> "$MIGRATION_TEST_LOG"' \
  'exit "${MIGRATION_TEST_NPX_EXIT:-0}"' >"$fixture_root/bin/npx"
chmod +x "$fixture_root/bin/npx"

expect_rejection() {
  description="$1"
  shift
  : >"$fixture_root/log"
  set +e
  env PATH="$fixture_root/bin:$PATH" MIGRATION_TEST_LOG="$fixture_root/log" "$@" \
    sh "$repo_root/scripts/verify-production-migrations.sh" >"$fixture_root/out" 2>&1
  status=$?
  set -e
  if [ "$status" -eq 0 ] || [ -s "$fixture_root/log" ]; then
    echo "FAIL: $description did not reject before invoking Prisma" >&2
    exit 1
  fi
}

expect_rejection "missing direct URL" env
expect_rejection "transaction pooler URL" env \
  PRODUCTION_DIRECT_URL="postgresql://pool:6543/app" \
  EXPECTED_DIRECT_DATABASE_HOST="db.udooysjajglluvuxkijp.supabase.co" \
  EXPECTED_DIRECT_DATABASE_NAME="app" \
  EXPECTED_DIRECT_DATABASE_SCHEMA="public"

: >"$fixture_root/log"
env PATH="$fixture_root/bin:$PATH" MIGRATION_TEST_LOG="$fixture_root/log" \
  PRODUCTION_DIRECT_URL="postgresql://user:pass@db.udooysjajglluvuxkijp.supabase.co:5432/app" \
  EXPECTED_DIRECT_DATABASE_HOST="db.udooysjajglluvuxkijp.supabase.co" \
  EXPECTED_DIRECT_DATABASE_NAME="app" \
  EXPECTED_DIRECT_DATABASE_SCHEMA="public" \
  sh "$repo_root/scripts/verify-production-migrations.sh"
grep -q 'npx --no-install prisma migrate status|DATABASE_URL=postgresql://user:pass@db.udooysjajglluvuxkijp.supabase.co:5432/app|DIRECT_URL=postgresql://user:pass@db.udooysjajglluvuxkijp.supabase.co:5432/app' "$fixture_root/log"
grep -q 'npx --no-install prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --exit-code|DATABASE_URL=postgresql://user:pass@db.udooysjajglluvuxkijp.supabase.co:5432/app|DIRECT_URL=postgresql://user:pass@db.udooysjajglluvuxkijp.supabase.co:5432/app' "$fixture_root/log"
grep -q 'npx --no-install tsx scripts/verify-live-rls.ts|DATABASE_URL=postgresql://user:pass@db.udooysjajglluvuxkijp.supabase.co:5432/app|DIRECT_URL=postgresql://user:pass@db.udooysjajglluvuxkijp.supabase.co:5432/app' "$fixture_root/log"

set +e
env PATH="$fixture_root/bin:$PATH" MIGRATION_TEST_LOG="$fixture_root/log" \
  MIGRATION_TEST_NPX_EXIT=7 \
  PRODUCTION_DIRECT_URL="postgresql://user:pass@db.udooysjajglluvuxkijp.supabase.co:5432/app" \
  EXPECTED_DIRECT_DATABASE_HOST="db.udooysjajglluvuxkijp.supabase.co" \
  EXPECTED_DIRECT_DATABASE_NAME="app" \
  EXPECTED_DIRECT_DATABASE_SCHEMA="public" \
  sh "$repo_root/scripts/verify-production-migrations.sh" >/dev/null 2>&1
status=$?
set -e
if [ "$status" -ne 7 ]; then
  echo "FAIL: Prisma failure exit was masked; expected 7, observed $status" >&2
  exit 1
fi

echo "PASS: production migration verifier rejects missing/pooled URLs, binds both Prisma URLs, runs status plus supported-schema diff, and preserves Prisma failure exit codes"
