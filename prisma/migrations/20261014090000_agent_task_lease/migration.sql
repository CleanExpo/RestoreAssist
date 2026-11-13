-- RA-7999 slice 1a: fencing lease on every AgentTask claim (additive only).
-- Old code ignores these nullable columns, so a code rollback needs no schema change.
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "leaseOwner" TEXT;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3);

-- Invariant: a task that is not RUNNING holds no lease. Existing rows all have
-- NULL leases, so the constraint validates without a backfill.
DO $$ BEGIN
  ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_lease_only_while_running"
    CHECK ("status" = 'RUNNING' OR ("leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The sweep reads RUNNING rows by lease expiry.
CREATE INDEX IF NOT EXISTS "AgentTask_status_leaseExpiresAt_idx" ON "AgentTask"("status", "leaseExpiresAt");
