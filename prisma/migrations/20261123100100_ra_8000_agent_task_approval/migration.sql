-- RA-8000 slice 1b, migration 2 of 2: approval columns on AgentTask.
-- Additive. requiresApproval has a constant default, so adding it rewrites no rows.
-- approvedBy is TEXT with no foreign key: it always equals the workflow owner's id.
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "requiresApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "approvalRequestedAt" TIMESTAMP(3);
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;

-- Invariant: a task waiting for approval records when it began waiting. No row
-- has the new status yet, so the constraint validates without a backfill.
DO $$ BEGIN
  ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_awaiting_approval_has_request_time"
    CHECK ("status" <> 'AWAITING_APPROVAL' OR "approvalRequestedAt" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
