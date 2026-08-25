#!/usr/bin/env sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/restoreassist-start-test-XXXXXX")"
trap 'rm -rf "$fixture_root"' EXIT HUP INT TERM
mkdir -p "$fixture_root/bin"

cat >"$fixture_root/bin/npx" <<'EOF'
#!/usr/bin/env sh
printf 'npx %s\n' "$*" >> "$START_TEST_LOG"
exit 0
EOF
cat >"$fixture_root/bin/node" <<'EOF'
#!/usr/bin/env sh
printf 'node %s|DRIFT_STRICT=%s\n' "$*" "${DRIFT_STRICT:-}" >> "$START_TEST_LOG"
exit 0
EOF
chmod +x "$fixture_root/bin/npx" "$fixture_root/bin/node"

run_expect_failure() {
  description="$1"
  shift
  : >"$fixture_root/log"
  set +e
  env PATH="$fixture_root/bin:$PATH" START_TEST_LOG="$fixture_root/log" "$@" \
    sh "$repo_root/scripts/start-production.sh" >"$fixture_root/out" 2>&1
  status=$?
  set -e
  if [ "$status" -eq 0 ]; then
    echo "FAIL: $description unexpectedly exited 0" >&2
    exit 1
  fi
  if [ -s "$fixture_root/log" ]; then
    echo "FAIL: $description invoked a runtime command before rejecting input" >&2
    exit 1
  fi
}

run_expect_failure "missing DATABASE_URL" env -u DATABASE_URL
run_expect_failure "missing CREDENTIAL_ENCRYPTION_KEY" env \
  DATABASE_URL="postgresql://pool:6543/app" \
  NEXTAUTH_SECRET="test-nextauth-secret" \
  NEXTAUTH_URL="https://restoreassist.app" \
  GOOGLE_CLIENT_ID="test-google-client" \
  GOOGLE_CLIENT_SECRET="test-google-secret" \
  NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID="123456789-test.apps.googleusercontent.com" \
  STRIPE_WEBHOOK_SECRET="test-stripe-webhook" \
  -u CREDENTIAL_ENCRYPTION_KEY

: >"$fixture_root/log"
env PATH="$fixture_root/bin:$PATH" START_TEST_LOG="$fixture_root/log" \
  DATABASE_URL="postgresql://pool:6543/app" \
  CREDENTIAL_ENCRYPTION_KEY="1111111111111111111111111111111111111111111111111111111111111111" \
  NEXTAUTH_SECRET="test-nextauth-secret" \
  NEXTAUTH_URL="https://restoreassist.app" \
  GOOGLE_CLIENT_ID="test-google-client" \
  GOOGLE_CLIENT_SECRET="test-google-secret" \
  NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID="123456789-test.apps.googleusercontent.com" \
  STRIPE_WEBHOOK_SECRET="test-stripe-webhook" \
  sh "$repo_root/scripts/start-production.sh" >"$fixture_root/out" 2>&1

expected="npx --no-install next start"
observed="$(cat "$fixture_root/log")"
if [ "$observed" != "$expected" ]; then
  echo "FAIL: production startup executed anything other than Next.js" >&2
  printf 'observed:\n%s\n' "$observed" >&2
  exit 1
fi

echo "PASS: production startup requires critical secrets and starts Next.js without database mutation"
