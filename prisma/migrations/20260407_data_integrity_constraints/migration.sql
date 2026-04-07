-- Migration: data_integrity_constraints
-- Fixes data integrity issues identified in adversarial audit:
--   1. InterviewStandardsMapping: add FK to InterviewSession (onDelete CASCADE)
--   2. Client: upgrade (userId, email) index to UNIQUE constraint
--   3. ReportApproval: upgrade (reportId, approvalType) index to UNIQUE constraint

-- 1. InterviewStandardsMapping → InterviewSession FK (orphan prevention)
--    Drop the plain index first, then add the FK constraint.
DROP INDEX IF EXISTS "InterviewStandardsMapping_interviewSessionId_idx";

ALTER TABLE "InterviewStandardsMapping"
  ADD CONSTRAINT "InterviewStandardsMapping_interviewSessionId_fkey"
  FOREIGN KEY ("interviewSessionId")
  REFERENCES "InterviewSession" ("id")
  ON DELETE CASCADE;

-- Recreate index (FK constraints do not automatically create an index in Postgres)
CREATE INDEX IF NOT EXISTS "InterviewStandardsMapping_interviewSessionId_idx"
  ON "InterviewStandardsMapping" ("interviewSessionId");

-- 2. Client (userId, email) — upgrade to UNIQUE
--    Drop the plain index before creating the unique constraint to avoid duplicate index.
DROP INDEX IF EXISTS "Client_userId_email_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "Client_userId_email_key"
  ON "Client" ("userId", "email");

-- 3. ReportApproval (reportId, approvalType) — upgrade to UNIQUE
--    NOTE: This will fail if duplicate (reportId, approvalType) rows already exist.
--    Run a dedup cleanup first if needed:
--      DELETE FROM "ReportApproval" a USING "ReportApproval" b
--        WHERE a.id > b.id AND a."reportId" = b."reportId" AND a."approvalType" = b."approvalType";
DROP INDEX IF EXISTS "ReportApproval_reportId_approvalType_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "ReportApproval_reportId_approvalType_key"
  ON "ReportApproval" ("reportId", "approvalType");
