-- Index-only companion to 20260828213000_job_file_audit_intake_replay_guard.
-- Apply through the approved non-transactional Supabase migration path so
-- live SupportTicket writes continue while Postgres builds the uniqueness
-- boundary. CI pre-resolves this migration before Prisma migrate deploy, then
-- executes this file directly and mutation-tests the uniqueness boundary.
-- A failed concurrent build can leave an invalid same-named index. The
-- approved runner must remove only that invalid/not-ready artifact outside a
-- transaction before retrying. Never let IF NOT EXISTS hide broken state.
DO $replay_index_state_guard$
BEGIN
  IF EXISTS (
    SELECT 1
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
      AND (
        NOT index_state.indisunique
        OR NOT index_state.indisvalid
        OR NOT index_state.indisready
      )
  ) THEN
    RAISE EXCEPTION
      'Replay index exists in an unusable state; run the approved non-transactional recovery before retrying';
  END IF;
END
$replay_index_state_guard$;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "SupportTicket_externalReference_key"
  ON "SupportTicket"("externalReference");
