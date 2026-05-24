-- RA-5169: AgentTask.agentSlug is a NOT NULL column, so ON DELETE SET NULL
-- (set by migration 20260407_ondelete_integrity_fixes) is logically invalid —
-- Postgres would raise a NOT NULL constraint violation at delete time, so
-- the practical runtime effect is already RESTRICT. This migration aligns
-- the FK action with what actually happens, eliminating the Prisma validate
-- warning and clarifying intent for future schema readers.
--
-- This is a no-op at the data level: zero rows are altered, no constraint
-- failures possible on apply (we are only relabelling the action; the column
-- definition is unchanged).
--
-- Reversion: re-run the old constraint with ON DELETE SET NULL.

ALTER TABLE "AgentTask" DROP CONSTRAINT IF EXISTS "AgentTask_agentSlug_fkey";
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_agentSlug_fkey"
    FOREIGN KEY ("agentSlug") REFERENCES "AgentDefinition"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
