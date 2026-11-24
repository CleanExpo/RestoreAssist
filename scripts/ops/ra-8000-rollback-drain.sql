-- RA-8000 slice 1b rollback drain (R1). Run by Phill BEFORE and AFTER redeploying
-- the pre-1b code. One statement, idempotent, safe in either order.
--
-- Why: the pre-1b client cannot read a row whose status is AWAITING_APPROVAL, so
-- every such row (and the PAUSED workflow holding it) is closed first.
-- CANCELLED wins over PENDING: a PENDING drain would let a step run without the
-- confirmation the contractor was promised, and while the 1b image still serves
-- it would re-pause the task. Affected contractors re-run the assessment.
--
-- Record the count before and after: the "after" count must be 0.
--   SELECT count(*) FROM "AgentTask" WHERE status = 'AWAITING_APPROVAL';
--   SELECT count(*) FROM "AgentWorkflow" WHERE status = 'PAUSED';
-- Never drop the enum value or the columns (R2).
WITH awaiting AS (
  SELECT id, "workflowId" FROM "AgentTask" WHERE status = 'AWAITING_APPROVAL'
),
dependents AS (
  WITH RECURSIVE d(id) AS (
    SELECT t.id FROM "AgentTask" t, awaiting a
    WHERE t.status = 'PENDING' AND a.id = ANY (t."dependsOnTaskIds")
    UNION
    SELECT t.id FROM "AgentTask" t JOIN d ON d.id = ANY (t."dependsOnTaskIds")
    WHERE t.status = 'PENDING'
  )
  SELECT id FROM d
),
skipped AS (
  UPDATE "AgentTask"
  SET status = 'SKIPPED', "errorCode" = 'ROLLBACK_1B'
  WHERE id IN (SELECT id FROM dependents)
  RETURNING id
),
closed AS (
  UPDATE "AgentWorkflow"
  SET status = 'CANCELLED', "completedAt" = (now() AT TIME ZONE 'UTC')
  WHERE status = 'PAUSED' AND id IN (SELECT "workflowId" FROM awaiting)
  RETURNING id
)
UPDATE "AgentTask"
SET status = 'CANCELLED', "errorCode" = 'ROLLBACK_1B'
WHERE status = 'AWAITING_APPROVAL'
   OR (
     status IN ('PENDING', 'READY')
     AND "workflowId" IN (SELECT "workflowId" FROM awaiting)
     AND id NOT IN (SELECT id FROM dependents)
   );
