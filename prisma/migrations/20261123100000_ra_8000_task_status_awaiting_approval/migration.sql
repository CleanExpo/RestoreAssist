-- RA-8000 slice 1b, migration 1 of 2: the AWAITING_APPROVAL task status.
-- This is the only statement in the file: PostgreSQL cannot use a new enum
-- value in the transaction that adds it, so the CHECK that names it is in the
-- next migration. The value can never be removed (see the rollback plan in the PR).
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'AWAITING_APPROVAL';
