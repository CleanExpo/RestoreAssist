#!/usr/bin/env bash
#
# RestoreAssist - run the unit suite the CI way (with a real Postgres).
#
# WHY: 16+ test files are gated with `describe.skipIf(!process.env.DATABASE_URL)`.
# Without a DB they SILENTLY SKIP, so a plain `vitest run` is not CI-representative
# (see scripts/ci/check-test-parity.mjs). This script stands up the SAME Postgres
# image CI uses (pgvector 0.8.6-pg16, pinned by digest), applies migrations, exports DATABASE_URL,
# and runs vitest - so "green here" means "green in CI".
#
# Mirrors .github/workflows/pr-checks.yml (`unit-tests` job / Unit Tests).
#
# Usage:
#   npm run test:db --                 # full suite against an ephemeral DB
#   npm run test:db -- <vitest args>   # e.g. npm run test:db -- lib/setup
#
# Requires Docker. Each worktree gets its own container (ra-ci-pg-<hash of the
# worktree path>) on a port Docker picks, so two worktrees can run side by side.
# RA_CI_PG_NAME and RA_CI_PG_PORT override the name and port.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
IMAGE=pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b
CONTAINER=${RA_CI_PG_NAME:-ra-ci-pg-$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(process.argv[1]).digest("hex").slice(0,8))' "$ROOT")}
PORT=${RA_CI_PG_PORT:-}
trap 'echo "test:db failed: container=$CONTAINER port=${PORT:-unassigned}" >&2' ERR

# A worktree whose node_modules is a symlink shares one generated Prisma
# client with other worktrees; a run elsewhere regenerates it under this one.
NM_REAL=$(cd "$ROOT/node_modules" 2>/dev/null && pwd -P || true)
if [ -z "$NM_REAL" ] || [ "${NM_REAL#"$ROOT"/}" = "$NM_REAL" ]; then
  if [ "${RA_CI_PG_SHARED_CLIENT_OK:-}" = "1" ]; then
    echo "test:db: shared-client override active, node_modules=${NM_REAL:-<missing>}" >&2
  else
    echo "test:db refused: node_modules resolves outside this worktree (${NM_REAL:-<missing>})." >&2
    echo "Run npm ci in this worktree, or set RA_CI_PG_SHARED_CLIENT_OK=1 for a single run." >&2
    exit 1
  fi
fi

# Refuse a non-local Postgres in the environment we were given, before any
# docker call. Same function as the vitest setup file; it never prints a URL.
node "$ROOT/scripts/ci/assert-local-test-db.mjs"

if ! printf '%s' "$CONTAINER" | grep -Eq '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$'; then
  echo "test:db refused: RA_CI_PG_NAME must match ^[a-zA-Z0-9][a-zA-Z0-9_.-]*\$" >&2
  exit 1
fi

# Check the DAEMON, not just the binary. A CLI with no reachable daemon passed
# this guard and failed 20 lines later with a raw Docker API socket error, which
# reads as a broken script rather than a missing service -- and reached the
# release gate as an opaque B3 failure.
if ! command -v docker >/dev/null 2>&1; then
  echo "test:db needs Docker (CI uses a digest-pinned pgvector 0.8.6-pg16 service)." >&2
  echo "Install Docker, or run only the non-DB suites with: npm run test:unit" >&2
  exit 127
fi
if ! docker info >/dev/null 2>&1; then
  echo "test:db found the docker CLI but no reachable daemon." >&2
  echo "Start Docker, or stand up Postgres yourself and export DATABASE_URL," >&2
  echo "DIRECT_URL and RELEASE_DB_PROFILE=1 before running vitest directly." >&2
  echo "The database must be UTF8: 20260825123000_canonical_email_identity calls" >&2
  echo "chr() beyond U+00FF and fails on a SQL_ASCII or LATIN1 cluster." >&2
  exit 127
fi

# Name first. A running container with this name belongs to a live run of this
# worktree: refuse rather than kill it. A stopped one is this worktree's
# leftover (the name hashes the worktree path): remove it.
STATE=$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)
if [ "$STATE" = "true" ]; then
  echo "test:db refused: container $CONTAINER is already running (another run of this worktree?)." >&2
  echo "If it is a leftover, remove it with: docker rm -f $CONTAINER" >&2
  exit 1
elif [ -n "$STATE" ]; then
  # Stopped also covers a peer's container that is created but not yet
  # started. Its run label starts with the peer's pid: if that process is
  # alive, leave the container alone.
  OWNER=$(docker inspect -f '{{index .Config.Labels "ra-ci-pg.run"}}' "$CONTAINER" 2>/dev/null || true)
  if [ -n "$OWNER" ] && [ "$OWNER" != "<no value>" ] && kill -0 "${OWNER%%.*}" 2>/dev/null; then
    echo "test:db refused: container $CONTAINER is being started by a live run (pid ${OWNER%%.*})." >&2
    exit 1
  fi
  docker rm -f "$CONTAINER" >/dev/null
fi

if [ -n "$PORT" ]; then
  if ! node -e 'const s=require("net").createServer();s.once("error",()=>process.exit(1));s.listen(+process.argv[1],"127.0.0.1",()=>s.close())' "$PORT"; then
    echo "test:db refused: RA_CI_PG_PORT=$PORT is already in use on 127.0.0.1." >&2
    exit 1
  fi
  PUBLISH="127.0.0.1:${PORT}:5432"
else
  PUBLISH="127.0.0.1::5432"
fi

echo "==> Starting ephemeral Postgres ($IMAGE) as $CONTAINER"
# Remove only what this run created: by the id docker run returns, or, if the
# run failed after creating, by this run's own label. Never by name, which a
# concurrent run of this worktree may own (it wins the create, we get a
# name conflict and must leave it alone).
RUN_LABEL="ra-ci-pg.run=$$.$RANDOM.$(date +%s)"
if ! CID=$(docker run -d --name "$CONTAINER" --label "$RUN_LABEL" \
  -e POSTGRES_USER=ci -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=ci \
  -p "$PUBLISH" "$IMAGE"); then
  for own in $(docker ps -aq --filter "label=$RUN_LABEL" 2>/dev/null); do
    docker rm -f "$own" >/dev/null 2>&1 || true
  done
  echo "test:db failed: docker run did not start $CONTAINER" >&2
  exit 1
fi
cleanup() { docker rm -f "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
PORT=$(docker port "$CID" 5432/tcp | head -n 1 | sed 's/.*://')
echo "==> $CONTAINER listening on 127.0.0.1:$PORT"

export DATABASE_URL="postgresql://ci:ci@localhost:${PORT}/ci"
export DIRECT_URL="$DATABASE_URL"
export RELEASE_DB_PROFILE=1
node "$ROOT/scripts/ci/assert-local-test-db.mjs"

echo "==> Waiting for Postgres to accept connections"
for i in $(seq 1 30); do
  if docker exec "$CID" pg_isready -U ci -d ci >/dev/null 2>&1; then break; fi
  sleep 1
  if [ "$i" = "30" ]; then echo "Postgres did not become ready" >&2; exit 1; fi
done

echo "==> Generating Prisma client"
npx --no-install prisma generate >/dev/null

# Mirror CI: mark CONCURRENTLY-index migrations as applied (Supabase-only syntax
# that fails on plain pgvector). Keep this list in sync with pr-checks.yml.
echo "==> Pre-resolving CONCURRENTLY migrations (matches CI)"
for mig in \
  20260407_n1_performance_indexes \
  20260407_perf_composite_indexes \
  20260516010000_inspection_close_terminal_index \
  20260828213100_job_file_audit_intake_replay_guard_index; do
  npx --no-install prisma migrate resolve --applied "$mig" >/dev/null 2>&1 || true
done

echo "==> Applying migrations"
npx --no-install prisma migrate deploy >/dev/null

echo "==> Applying and verifying paid-audit replay index"
scripts/ci/apply-and-verify-job-file-audit-replay-index.sh

echo "==> Verifying CI parity (no env-gated suite will skip)"
node scripts/ci/check-test-parity.mjs --strict

echo "==> Running vitest with DATABASE_URL set"
npx --no-install vitest run --config config/vitest.config.js "$@"
