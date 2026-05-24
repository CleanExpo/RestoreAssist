-- RA-5178: Honour the SetNull intent on AgentTask.agentSlug by making the
-- column nullable. Previously the column was NOT NULL with ON DELETE
-- RESTRICT (RA-5169), which blocked AgentDefinition removal. The original
-- 20260407_ondelete_integrity_fixes migration aspired to SetNull behaviour
-- so that "renaming/removing a slug does not cascade-delete tasks" — this
-- migration delivers that aspiration.
--
-- After this migration:
--   - Deleting an AgentDefinition row sets AgentTask.agentSlug = NULL on
--     every referencing task (preserves task history)
--   - lib/agents/executor.ts handles agentSlug = NULL by failing the task
--     with an AGENT_DEFINITION_REMOVED error (task is non-executable but
--     remains in the system for audit)
--   - lib/agents/state-manager.ts skips orphan tasks when assembling
--     completedOutputs (null agentSlug can't be a useful object key)
--
-- Data-level impact: zero rows altered, no constraint failures possible
-- on apply (the column moves from NOT NULL to NULL — strictly looser).

ALTER TABLE "AgentTask" ALTER COLUMN "agentSlug" DROP NOT NULL;
ALTER TABLE "AgentTask" DROP CONSTRAINT IF EXISTS "AgentTask_agentSlug_fkey";
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_agentSlug_fkey"
    FOREIGN KEY ("agentSlug") REFERENCES "AgentDefinition"("slug") ON DELETE SET NULL ON UPDATE CASCADE;
