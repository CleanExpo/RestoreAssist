#!/usr/bin/env bash
set -euo pipefail

container_name="ra-owner-acceptance-$$"
database_port="${RA_OWNER_ACCEPTANCE_DB_PORT:-55439}"
app_port="${RA_OWNER_ACCEPTANCE_APP_PORT:-43119}"
database_url="postgresql://postgres:postgres@127.0.0.1:${database_port}/restoreassist_owner_acceptance?schema=public"
server_pid=""
server_log="/tmp/restoreassist-owner-acceptance-$$.log"

cleanup() {
  local exit_status=$?
  if [[ -n "${server_pid}" ]]; then
    kill "${server_pid}" >/dev/null 2>&1 || true
    wait "${server_pid}" >/dev/null 2>&1 || true
  fi
  if (( exit_status != 0 )) && [[ -f "${server_log}" ]]; then
    echo "Owner acceptance server log (last 120 lines):" >&2
    tail -n 120 "${server_log}" >&2
  fi
  docker rm -f "${container_name}" >/dev/null 2>&1 || true
  rm -f "${server_log}"
}
trap cleanup EXIT INT TERM

# Provider credentials are deliberately unavailable in this process. The
# journey uses only the hard-guarded local acceptance fixture.
unset ANTHROPIC_API_KEY OPENAI_API_KEY GEMINI_API_KEY GOOGLE_GENERATIVE_AI_API_KEY
unset CLOUDINARY_URL CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET
unset RESEND_API_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET

export DATABASE_URL="${database_url}"
export DIRECT_URL="${database_url}"
export NEXTAUTH_URL="http://127.0.0.1:${app_port}"
export NEXT_PUBLIC_APP_URL="${NEXTAUTH_URL}"
export PLAYWRIGHT_BASE_URL="${NEXTAUTH_URL}"
export PLAYWRIGHT_HTML_OPEN="never"
export NEXTAUTH_SECRET="local-owner-acceptance-secret-not-for-deployment"
export PORTAL_SECRET="local-owner-acceptance-portal-secret-not-for-deployment"
export ALLOW_TEST_HELPERS="true"
export ALLOW_LOCAL_ACCEPTANCE_FIXTURES="true"
unset VERCEL_ENV ALLOW_TEST_HELPERS_IN_PROD_ENV

docker run --detach --rm \
  --name "${container_name}" \
  --publish "127.0.0.1:${database_port}:5432" \
  --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_DB=restoreassist_owner_acceptance \
  pgvector/pgvector:pg16 >/dev/null

for _ in $(seq 1 45); do
  if docker exec "${container_name}" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "${container_name}" pg_isready -U postgres >/dev/null

# Some historical migrations reference Supabase's auth.uid() helper.
docker exec -i "${container_name}" psql -U postgres -d restoreassist_owner_acceptance <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
SQL

pnpm prisma:generate
pnpm exec prisma migrate deploy

pnpm exec next dev --webpack --hostname 127.0.0.1 --port "${app_port}" >"${server_log}" 2>&1 &
server_pid=$!
for _ in $(seq 1 90); do
  readiness_status="$(
    curl --silent --output /dev/null --write-out '%{http_code}' \
      "${PLAYWRIGHT_BASE_URL}/login" || true
  )"
  if [[ "${readiness_status}" != "000" ]]; then
    break
  fi
  if ! kill -0 "${server_pid}" >/dev/null 2>&1; then
    tail -n 80 "${server_log}"
    exit 1
  fi
  sleep 1
done
readiness_status="$(
  curl --silent --output /dev/null --write-out '%{http_code}' \
    "${PLAYWRIGHT_BASE_URL}/login" || true
)"
if [[ "${readiness_status}" == "000" ]]; then
  tail -n 80 "${server_log}"
  exit 1
fi

# Desktop acceptance is the primary gate. Responsive/a11y smoke follows only
# after it passes, preserving an unambiguous failure order.
pnpm exec playwright test owner-lifecycle-acceptance.spec.ts \
  --config=config/playwright.config.ts \
  --project=chromium \
  --grep-invert=@smoke

pnpm exec playwright test owner-lifecycle-acceptance.spec.ts \
  --config=config/playwright.config.ts \
  --project=chromium \
  --project=mobile-chrome \
  --project=tablet-chrome \
  --grep=@smoke
