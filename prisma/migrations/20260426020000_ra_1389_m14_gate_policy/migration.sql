-- RA-1389 / Motion M-14 — 16-gate hard/soft/audit classification.
-- Adds non-blocking-gap recording to ProgressTransition.

ALTER TABLE "ProgressTransition"
    ADD COLUMN "softGaps" JSONB,
    ADD COLUMN "auditGaps" JSONB;
