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

psql "$ci_database_url" -X -v ON_ERROR_STOP=1 -f "$migration_file"

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
