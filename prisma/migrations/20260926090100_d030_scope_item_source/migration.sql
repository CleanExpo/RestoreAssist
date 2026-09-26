-- D-030 (prelaunch audit): record which scope items AI scope generation wrote.
--
-- WHY
--   AI rows and a technician's own rows were both stored with
--   autoDetermined = false, and regenerating a scope deleted every
--   autoDetermined = false row, so it deleted the technician's work.
--
-- WHAT IT ADDS
--   One nullable TEXT column. The application writes 'ai_generate_scope' on
--   rows AI scope generation creates, and a regenerate deletes only those.
--
-- ADDITIVE
--   ALTER TABLE ... ADD COLUMN with a nullable type. Existing rows get NULL,
--   so rows written by AI before this change are kept on the next
--   regenerate rather than guessed at.
--
-- REVERSIBLE
--   down.sql drops exactly this column.

ALTER TABLE "ScopeItem" ADD COLUMN "source" TEXT;
