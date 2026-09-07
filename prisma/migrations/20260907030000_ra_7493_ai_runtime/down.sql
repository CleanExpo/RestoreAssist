-- Reverse of 20260907030000_ra_7493_ai_runtime.
--
-- Drops exactly what the forward migration creates, in dependency order:
-- suggestions reference receipts, receipts reference themselves, everything
-- references Workspace or Inspection. Indexes and foreign keys go with their
-- tables, so only the tables and the enums need naming.
--
-- Nothing here touches an object that existed before this migration. The
-- rollback half of scripts/ci/migration-roundtrip.sh runs this file and then
-- asserts, against information_schema and pg_type, that every object the
-- forward migration created is gone AND that a pre-existing table (Workspace)
-- is still standing — so a pass means "removed", not "the query was pointed
-- somewhere empty".

-- AiJobSuggestion holds the FK to AiRunnerReceipt, so it goes first.
DROP TABLE IF EXISTS "AiJobSuggestion";

-- AiRunnerReceipt has a self-referencing supersedes FK; dropping the table
-- takes the constraint with it.
DROP TABLE IF EXISTS "AiRunnerReceipt";

DROP TABLE IF EXISTS "AiStyleProfile";
DROP TABLE IF EXISTS "AiRunnerBudget";
DROP TABLE IF EXISTS "AiRunnerFlag";

-- Trigger FUNCTIONS after their tables, not before. A dropped table takes its
-- triggers with it, but leaves the function standing -- so these must be named
-- explicitly or the migration is only partly reversed. They must also come
-- AFTER the DROP TABLEs: while a trigger still references a function, Postgres
-- refuses to drop it, and the rollback half of migration-roundtrip.sh caught
-- exactly that when they were ordered the other way.
DROP FUNCTION IF EXISTS "ai_runner_receipt_freeze"();
DROP FUNCTION IF EXISTS "ai_runner_budget_monotonic"();

-- Enums last: a type cannot be dropped while a column still uses it.
DROP TYPE IF EXISTS "AiSuggestionState";
DROP TYPE IF EXISTS "AiReceiptOutcome";
DROP TYPE IF EXISTS "AiKeySource";
DROP TYPE IF EXISTS "AiBudgetScope";
DROP TYPE IF EXISTS "AiRunner";
