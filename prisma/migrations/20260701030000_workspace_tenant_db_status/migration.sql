-- Cutover onboarding (G1): per-workspace tenant-DB lifecycle status.
--
-- "none" (the default) means the workspace uses the shared database exactly as
-- today — fully backward compatible. "ready" gates first-claim onto the
-- workspace's own database. Values: none | provisioning | ready | error.
--
-- Additive only — one nullable-with-default column, no existing data altered.
-- Safe to apply via the normal migrate-deploy path.

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "tenantDbStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Workspace" ADD COLUMN "tenantDbConnectionEnc" TEXT;
