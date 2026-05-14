-- SP-A (Wave 1) — Job-Close Terminal State (schema deltas).
--
-- Additive migration. No destructive ops.
--   1. Extend `InspectionStatus` with three new values (IN_BILLING, CLOSED, ARCHIVED).
--      Existing `COMPLETED` value is retained — SP-C will handle the
--      deprecation path separately.
--   2. Add four nullable columns to `Inspection`:
--        - closeSummary            TEXT      (client-facing summary, AI draft → user edit)
--        - completedAt             TIMESTAMP (set when close-button pressed)
--        - closePackageStorageKey  TEXT      (SP-E fire-and-forget hook writes here)
--        - handoverCompletedAt     TIMESTAMP (SP-J precondition; soft gap until SP-J ships)
--
-- The partial CREATE INDEX CONCURRENTLY lives in the sibling migration
-- `20260516010000_inspection_close_terminal_index` so CI can pre-resolve
-- only the index step without skipping these column ADDs.
--
-- Spec ref: docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md §8.

-- 1. Enum extension. Each value in its own statement (Postgres requirement).
ALTER TYPE "InspectionStatus" ADD VALUE IF NOT EXISTS 'IN_BILLING';
ALTER TYPE "InspectionStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
ALTER TYPE "InspectionStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- 2. New columns on Inspection.
ALTER TABLE "Inspection"
  ADD COLUMN IF NOT EXISTS "closeSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closePackageStorageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "handoverCompletedAt" TIMESTAMP(3);
