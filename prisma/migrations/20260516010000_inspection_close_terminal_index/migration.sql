-- SP-A (Wave 1) — Terminal-status partial index (index-only migration).
--
-- Split from `20260516000000_inspection_close_terminal_state` because
-- `CREATE INDEX CONCURRENTLY` cannot run inside Prisma's transaction
-- wrapper. CI pre-resolves this migration via the workflow's
-- "Pre-resolve CONCURRENTLY migrations" step (RA-1548 pattern) — the
-- index is created in Supabase prod by its non-transactional mechanism
-- but skipped in the ephemeral pgvector:pg16 CI environment, which
-- doesn't run any test that depends on this index.
--
-- Index purpose: SP-C's Completed tab will scan rows only in the
-- terminal statuses. The partial WHERE clause keeps the index small.
--
-- Spec ref: docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md §8.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Inspection_terminal_status_idx"
  ON "Inspection"("status")
  WHERE "status" IN ('IN_BILLING', 'CLOSED', 'ARCHIVED');
