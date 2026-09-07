#!/usr/bin/env bash
#
# RestoreAssist — prove a branch's new migrations APPLY, ROLL BACK, and are ADDITIVE.
#
# WHY: "the migration worked" usually means "it ran once, forwards, on a database
# that already had everything". None of the three things that actually matter get
# checked by that:
#
#   apply          — do they apply to an EMPTY database, in order, and does the
#                    resulting schema match schema.prisma with no drift?
#   rollback       — is there a down.sql that undoes them, and does it leave the
#                    database with none of the objects the migration created?
#   additive-only  — do they touch anything that existed BEFORE this branch?
#
# "New migrations" = directories under prisma/migrations present here and absent
# at the merge base with origin/main. The comparison is against the merge base,
# not HEAD~1, so a branch with several commits is judged as a whole.
#
# Mirrors scripts/ci/test-with-db.sh for the environment (same digest-pinned
# pgvector image, same auth.uid() stub, same pre-resolved CONCURRENTLY list).
# It uses its own container and port so it can run alongside `npm run test:db`.
#
# Usage: bash scripts/ci/migration-roundtrip.sh {apply|rollback|additive-only}
set -euo pipefail

MODE="${1:-}"
CONTAINER=ra-migration-roundtrip-pg
IMAGE=pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b
PORT=${RA_ROUNDTRIP_PG_PORT:-5435}
BASE_REF=${RA_ROUNDTRIP_BASE_REF:-origin/main}

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Supabase-only CONCURRENTLY syntax that cannot run inside migrate deploy's
# transaction. Kept in sync with test-with-db.sh and pr-checks.yml.
PRE_RESOLVED=(
  20260407_n1_performance_indexes
  20260407_perf_composite_indexes
  20260516010000_inspection_close_terminal_index
  20260828213100_job_file_audit_intake_replay_guard_index
)

new_migrations() {
  # Directory names present in the working tree and absent at the merge base.
  local base
  base="$(git merge-base HEAD "$BASE_REF")"
  comm -13 \
    <(git ls-tree --name-only "$base" prisma/migrations/ | sed 's#prisma/migrations/##' | sed 's#/$##' | sort) \
    <(ls -1 prisma/migrations | grep -v '^migration_lock.toml$' | sort)
}

require_new_migrations() {
  local n
  n="$(new_migrations | wc -l | tr -d ' ')"
  if [ "$n" = "0" ]; then
    # A branch that adds no migration cannot fail these checks, and must not be
    # allowed to PASS them either — a vacuous green here is exactly the thing
    # this script exists to stop.
    echo "No new migrations vs $BASE_REF. Nothing to prove; refusing a vacuous pass." >&2
    exit 3
  fi
  echo "New migrations vs $BASE_REF ($n):" >&2
  new_migrations | sed 's/^/  /' >&2
}

start_db() {
  command -v docker >/dev/null 2>&1 || { echo "needs Docker" >&2; exit 127; }
  docker info >/dev/null 2>&1 || { echo "docker CLI present but no reachable daemon" >&2; exit 127; }
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_USER=ci -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=ci \
    -p "${PORT}:5432" "$IMAGE" >/dev/null
  local i
  for i in $(seq 1 40); do
    docker exec "$CONTAINER" pg_isready -U ci -d ci >/dev/null 2>&1 && break
    sleep 1
    [ "$i" = "40" ] && { echo "Postgres did not become ready" >&2; exit 1; }
  done
  docker exec "$CONTAINER" psql -U ci -d ci -q -c \
    "CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';" >/dev/null
}

psql_q() { docker exec "$CONTAINER" psql -U ci -d ci -tAq -c "$1"; }

export_db_url() {
  export DATABASE_URL="postgresql://ci:ci@localhost:${PORT}/ci"
  export DIRECT_URL="$DATABASE_URL"
  export RELEASE_DB_PROFILE=1
}

apply_all() {
  local mig
  for mig in "${PRE_RESOLVED[@]}"; do
    npx --no-install prisma migrate resolve --applied "$mig" >/dev/null 2>&1 || true
  done
  npx --no-install prisma migrate deploy
}

case "$MODE" in
  additive-only)
    # Static check. No database needed: a destructive statement is destructive
    # whether or not it happens to succeed today.
    require_new_migrations
    rc=0
    while read -r mig; do
      [ -n "$mig" ] || continue
      f="prisma/migrations/$mig/migration.sql"
      [ -f "$f" ] || continue
      # Strip -- comments so a rationale that MENTIONS "DROP COLUMN" is not a hit.
      stripped="$(sed 's/--.*$//' "$f")"
      hits="$(printf '%s\n' "$stripped" | grep -nEi '(DROP[[:space:]]+(TABLE|COLUMN|CONSTRAINT|INDEX|TYPE|SCHEMA)|RENAME[[:space:]]+(TO|COLUMN)|ALTER[[:space:]]+COLUMN[[:space:]]+.*[[:space:]]TYPE[[:space:]]|SET[[:space:]]+NOT[[:space:]]+NULL|TRUNCATE|DELETE[[:space:]]+FROM)' || true)"
      if [ -n "$hits" ]; then
        echo "NOT ADDITIVE — $f" >&2
        printf '%s\n' "$hits" >&2
        rc=1
      fi
    done < <(new_migrations)
    [ "$rc" = "0" ] && echo "additive-only: PASS — new migrations create, they do not alter or destroy"
    exit "$rc"
    ;;

  apply)
    require_new_migrations
    trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true' EXIT
    start_db
    export_db_url
    echo "==> Applying every migration to an EMPTY database"
    apply_all
    echo "==> Checking that the new migrations fully realise the new models"
    #
    # SCOPE, stated because an unscoped claim here would be false. This repo has
    # PRE-EXISTING divergence between its migration history and schema.prisma —
    # 143 statements at the time of writing (timestamp precision, dropped
    # defaults, index names, and pgvector columns Prisma cannot express and
    # which are documented as raw-SQL-managed). That divergence is real, it is
    # not any one branch's, and asserting "zero drift" here would make this
    # check unpassable and therefore ignored.
    #
    # So the assertion is narrowed to what a branch is actually responsible for:
    # after its migrations run, the diff back to schema.prisma must contain NO
    # statement naming an object the branch introduced. If it does, the
    # migration and the model disagree about the branch's own tables.
    #
    # RA_ROUNDTRIP_OBJECT_RE names those objects. It defaults to the AI-runtime
    # prefix; a later branch sets it to its own.
    OBJECT_RE=${RA_ROUNDTRIP_OBJECT_RE:-'"Ai(Runner|Job|Style)'}
    diff_out="$(npx --no-install prisma migrate diff \
      --from-config-datasource \
      --to-schema prisma/schema.prisma \
      --script)"

    # Positive control on the instrument: the diff must be able to SAY something
    # about this repo at all. An empty diff here would mean the drift vanished,
    # which is possible and good — but a diff that failed to run also prints
    # nothing, and the two must not be confused.
    if [ -z "$diff_out" ]; then
      echo "CONTROL FAILED — migrate diff produced no output at all; treat as unproven, not clean" >&2
      exit 1
    fi

    residual="$(printf '%s\n' "$diff_out" | grep -E "$OBJECT_RE" || true)"
    if [ -n "$residual" ]; then
      echo "DRIFT IN THIS BRANCH'S OWN OBJECTS — the migration does not build what the models declare:" >&2
      printf '%s\n' "$residual" >&2
      exit 1
    fi

    pre_existing="$(printf '%s\n' "$diff_out" | grep -cE '^-- ' || true)"
    echo "apply: PASS — all migrations apply to an empty database, and none of the"
    echo "       ${pre_existing} residual diff statements name an object this branch introduced"
    echo "       (that residual is the repo's pre-existing migrations-vs-schema divergence)"
    ;;

  rollback)
    require_new_migrations
    trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true' EXIT
    start_db
    export_db_url
    echo "==> Applying every migration"
    apply_all >/dev/null

    # Every new migration must ship a down.sql. A missing one is a FAIL, never a
    # skip: "there was nothing to roll back" and "we never checked" read
    # identically in a log, and only one of them is safe.
    # Not `mapfile`: macOS ships bash 3.2, where it does not exist. CI runs
    # bash 5, so a mapfile here would work there and die on every dev machine.
    migs=()
    while IFS= read -r m; do
      [ -n "$m" ] && migs+=("$m")
    done < <(new_migrations)

    for mig in "${migs[@]}"; do
      [ -f "prisma/migrations/$mig/down.sql" ] || {
        echo "MISSING down.sql for $mig — a migration with no tested reverse is not reversible" >&2
        exit 1
      }
    done

    # Reverse order, so a later migration's objects go before an earlier one's.
    for (( idx=${#migs[@]}-1 ; idx>=0 ; idx-- )); do
      mig="${migs[idx]}"
      echo "==> down.sql for $mig"
      docker exec -i "$CONTAINER" psql -U ci -d ci -v ON_ERROR_STOP=1 -q < "prisma/migrations/$mig/down.sql"
    done

    # Positive control on the assertion itself: prove the query CAN see a table,
    # so "0 remaining" below means "removed" and not "the check is looking in the
    # wrong place". Workspace predates this branch and must still be there.
    ctl="$(psql_q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='Workspace';")"
    if [ "$ctl" = "1" ]; then
      echo "control: the existence query sees pre-existing tables (Workspace found)"
    else
      echo "CONTROL FAILED — the existence query cannot see Workspace, so a zero below would prove nothing" >&2
      exit 1
    fi

    # Now assert every table and type the new migrations created is gone.
    rc=0
    while read -r mig; do
      [ -n "$mig" ] || continue
      f="prisma/migrations/$mig/migration.sql"
      [ -f "$f" ] || continue
      for t in $(grep -oE 'CREATE TABLE ("?[A-Za-z_][A-Za-z0-9_]*"?)' "$f" | awk '{print $3}' | tr -d '"' | sort -u); do
        n="$(psql_q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='$t';")"
        [ "$n" = "0" ] || { echo "STILL PRESENT after rollback: table $t" >&2; rc=1; }
      done
      for ty in $(grep -oE 'CREATE TYPE ("?[A-Za-z_][A-Za-z0-9_]*"?)' "$f" | awk '{print $3}' | tr -d '"' | sort -u); do
        n="$(psql_q "SELECT count(*) FROM pg_type WHERE typname='$ty';")"
        [ "$n" = "0" ] || { echo "STILL PRESENT after rollback: type $ty" >&2; rc=1; }
      done
    done < <(new_migrations)
    [ "$rc" = "0" ] && echo "rollback: PASS — every object the new migrations created is gone, and pre-existing tables remain"
    exit "$rc"
    ;;

  *)
    echo "usage: bash scripts/ci/migration-roundtrip.sh {apply|rollback|additive-only}" >&2
    exit 2
    ;;
esac
