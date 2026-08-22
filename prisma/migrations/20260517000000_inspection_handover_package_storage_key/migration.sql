-- SP-J — Handover terminal-transition schema deltas.
--
-- Additive migration. No destructive ops.
--   1. Add `Inspection.handoverPackageStorageKey TEXT` — populated synchronously
--      by POST /api/inspections/[id]/handover after the ZIP lands in Supabase.
--      (`handoverCompletedAt` already exists from migration
--      20260516000000_inspection_close_terminal_state.)
--   2. Extend `MirrorJobKind` enum with `HANDOVER_PACKAGE` — the SP-E mirror
--      queue uses this kind so the handover ZIP gets mirrored to the org's
--      Google Drive without colliding with the JOB_PACKAGE composite unique.
--
-- Spec ref: docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md §9.5.

-- 1. New column on Inspection. IF NOT EXISTS for re-run safety.
ALTER TABLE "Inspection"
  ADD COLUMN IF NOT EXISTS "handoverPackageStorageKey" TEXT;

-- 2. Enum extension. Postgres requires each ADD VALUE as its own statement
--    and (for some Postgres versions) outside any transaction; the value
--    is additive so re-runs are idempotent via IF NOT EXISTS.
ALTER TYPE "MirrorJobKind" ADD VALUE IF NOT EXISTS 'HANDOVER_PACKAGE';
