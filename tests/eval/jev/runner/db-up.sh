#!/usr/bin/env bash
# JEV dev database: a long-lived local Postgres for iterating on one family.
# Same image and migration steps as scripts/ci/test-with-db.sh, but the
# container stays up between runs. The official run is `npm run jev:det`,
# which uses test-with-db.sh and a fresh database every time.
#
#   bash tests/eval/jev/runner/db-up.sh        # prints the env file path
#   set -a; . tests/eval/jev/out/dev-db.env; set +a
#   npx vitest run --config config/vitest.jev.config.js tests/eval/jev/families/j1.jev.test.ts
#   docker rm -f ra-jev-pg                     # when done
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
IMAGE=pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b
NAME=${JEV_PG_NAME:-ra-jev-pg}
ENVF="$ROOT/tests/eval/jev/out/dev-db.env"
mkdir -p "$(dirname "$ENVF")"

if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" != "true" ]; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -e POSTGRES_USER=ci -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=ci \
    -p 127.0.0.1::5432 "$IMAGE" >/dev/null
  FRESH=1
fi
PORT=$(docker port "$NAME" 5432/tcp | head -n 1 | sed 's/.*://')
export DATABASE_URL="postgresql://ci:ci@localhost:${PORT}/ci"
export DIRECT_URL="$DATABASE_URL"
export RELEASE_DB_PROFILE=1
node "$ROOT/scripts/ci/assert-local-test-db.mjs"
for i in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U ci -d ci >/dev/null 2>&1 && break
  sleep 1
done
if [ "${FRESH:-0}" = "1" ]; then
  npx --no-install prisma generate >/dev/null
  for mig in 20260407_n1_performance_indexes 20260407_perf_composite_indexes \
    20260516010000_inspection_close_terminal_index 20260828213100_job_file_audit_intake_replay_guard_index; do
    npx --no-install prisma migrate resolve --applied "$mig" >/dev/null 2>&1 || true
  done
  npx --no-install prisma migrate deploy >/dev/null
  scripts/ci/apply-and-verify-job-file-audit-replay-index.sh >/dev/null
fi
printf 'DATABASE_URL=%s\nDIRECT_URL=%s\nRELEASE_DB_PROFILE=1\n' "$DATABASE_URL" "$DATABASE_URL" > "$ENVF"
echo "$ENVF"
