-- RA-6873 — Workspace.tenantDbProvisionPhase: resumable phase marker for the
-- tenant-DB provisioning worker.
--
-- Additive + idempotent + deploy-safe:
--   * A single NEW nullable column; no existing column is altered or dropped.
--   * IF NOT EXISTS makes the migration safe to re-run.
--   * Defaults to NULL, so every existing Workspace row is unchanged and no
--     runtime behaviour shifts for workspaces not using a tenant DB.
--
-- The column records which provisioning phase (validate|test|migrate|store|ready)
-- a failed attempt reached, so a retry resumes from there instead of restarting.
-- tenantDbStatus (none|provisioning|ready|error) cannot carry that detail on its
-- own, which is why a dedicated column is required rather than reusing it.

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "tenantDbProvisionPhase" TEXT;
