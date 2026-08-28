#!/usr/bin/env bash
set -euo pipefail

# Prisma records index-only CONCURRENTLY migrations as applied in ephemeral CI
# before migrate deploy. The replay index is a correctness boundary, not a
# performance-only index, so CI must execute its SQL and prove it rejects a
# duplicate fulfilment key after the column migration has run.

ci_database_url="${DIRECT_URL:-${DATABASE_URL:-}}"

case "$ci_database_url" in
  postgresql://*@localhost:*/*|postgresql://*@127.0.0.1:*/*|postgres://*@localhost:*/*|postgres://*@127.0.0.1:*/*)
    ;;
  *)
    echo "Refusing to apply the replay-index CI probe outside local ephemeral Postgres." >&2
    exit 2
    ;;
esac

migration_file="prisma/migrations/20260828213100_job_file_audit_intake_replay_guard_index/migration.sql"
if [[ ! -f "$migration_file" ]]; then
  echo "Replay-index migration is missing: $migration_file" >&2
  exit 2
fi

index_name='SupportTicket_externalReference_key'
probe_reference='stripe:job-file-audit:ci-replay-probe'

index_state() {
  psql "$ci_database_url" -X -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT COALESCE((
  SELECT CASE
    WHEN index_state.indisunique
      AND index_state.indisvalid
      AND index_state.indisready THEN 'valid'
    WHEN NOT index_state.indisvalid
      OR NOT index_state.indisready THEN 'recoverable'
    ELSE 'unexpected'
  END
  FROM pg_class index_relation
  JOIN pg_namespace index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_index index_state
    ON index_state.indexrelid = index_relation.oid
  JOIN pg_class table_relation
    ON table_relation.oid = index_state.indrelid
  WHERE index_namespace.nspname = current_schema()
    AND index_relation.relname = 'SupportTicket_externalReference_key'
    AND table_relation.relname = 'SupportTicket'
), 'absent');
SQL
}

index_oid() {
  psql "$ci_database_url" -X -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT COALESCE((
  SELECT index_relation.oid::text
  FROM pg_class index_relation
  JOIN pg_namespace index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  WHERE index_namespace.nspname = current_schema()
    AND index_relation.relname = 'SupportTicket_externalReference_key'
), 'absent');
SQL
}

drop_recoverable_index() {
  local current_state
  current_state="$(index_state)"
  if [[ "$current_state" != "recoverable" ]]; then
    echo "Refusing to drop replay index in state: $current_state" >&2
    return 1
  fi
  # PostgreSQL forbids DROP INDEX CONCURRENTLY inside a transaction. The
  # catalog check immediately above limits cleanup to invalid/not-ready state.
  psql "$ci_database_url" -X -v ON_ERROR_STOP=1 \
    -c "DROP INDEX CONCURRENTLY \"$index_name\""
}

cleanup_probe_rows() {
  psql "$ci_database_url" -X -v ON_ERROR_STOP=1 \
    -v probe_reference="$probe_reference" <<'SQL'
DELETE FROM "SupportTicket"
WHERE "id" IN ('ci-replay-index-probe-1', 'ci-replay-index-probe-2')
   OR "externalReference" = :'probe_reference';
SQL
}

initial_state="$(index_state)"
initial_oid="$(index_oid)"

case "$initial_state" in
  absent)
    # Reproduce PostgreSQL's failed-build residue on a fresh ephemeral DB. The
    # first build must fail on duplicates and leave the actual named index
    # invalid; the same recovery path used for a retry must then repair it.
    cleanup_probe_rows
    psql "$ci_database_url" -X -v ON_ERROR_STOP=1 \
      -v probe_reference="$probe_reference" <<'SQL'
INSERT INTO "SupportTicket"
  ("id", "email", "name", "subject", "body", "updatedAt", "externalReference")
VALUES
  ('ci-replay-index-probe-1', 'ci@example.invalid', 'CI probe', 'CI probe', 'CI probe', NOW(), :'probe_reference'),
  ('ci-replay-index-probe-2', 'ci@example.invalid', 'CI probe', 'CI probe', 'CI probe', NOW(), :'probe_reference');
SQL
    if psql "$ci_database_url" -X -v ON_ERROR_STOP=1 -f "$migration_file"; then
      cleanup_probe_rows
      echo "Replay-index mutation unexpectedly accepted duplicate keys." >&2
      exit 1
    fi
    cleanup_probe_rows
    if [[ "$(index_state)" != "recoverable" ]]; then
      echo "Failed concurrent build did not leave the expected recoverable index state." >&2
      exit 1
    fi
    drop_recoverable_index
    ;;
  recoverable)
    drop_recoverable_index
    ;;
  valid)
    echo "Replay index is already valid; preserving it for the idempotent retry proof."
    ;;
  *)
    echo "Replay index has an unexpected state; refusing automatic cleanup." >&2
    exit 1
    ;;
esac

psql "$ci_database_url" -X -v ON_ERROR_STOP=1 -f "$migration_file"

if [[ "$initial_state" == "valid" && "$(index_oid)" != "$initial_oid" ]]; then
  echo "A valid replay index was replaced during retry." >&2
  exit 1
fi

psql "$ci_database_url" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

DO $probe$
DECLARE
  duplicate_rejected boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class index_relation
    JOIN pg_index index_state
      ON index_state.indexrelid = index_relation.oid
    WHERE index_relation.relname = 'SupportTicket_externalReference_key'
      AND index_state.indisunique
      AND index_state.indisvalid
      AND index_state.indisready
  ) THEN
    RAISE EXCEPTION 'Replay index is absent, invalid, non-unique, or not ready';
  END IF;

  INSERT INTO "SupportTicket"
    ("id", "email", "name", "subject", "body", "updatedAt", "externalReference")
  VALUES
    ('ci-replay-index-probe-1', 'ci@example.invalid', 'CI probe', 'CI probe', 'CI probe', NOW(), 'stripe:job-file-audit:ci-replay-probe');

  BEGIN
    INSERT INTO "SupportTicket"
      ("id", "email", "name", "subject", "body", "updatedAt", "externalReference")
    VALUES
      ('ci-replay-index-probe-2', 'ci@example.invalid', 'CI probe', 'CI probe', 'CI probe', NOW(), 'stripe:job-file-audit:ci-replay-probe');
  EXCEPTION
    WHEN unique_violation THEN
      duplicate_rejected := true;
  END;

  IF NOT duplicate_rejected THEN
    RAISE EXCEPTION 'Replay index accepted a duplicate external reference';
  END IF;
END
$probe$;

ROLLBACK;
SQL

echo "Replay index exists, is valid and ready, and rejects duplicate fulfilment keys."
