-- RA-1388 / Motion M-13 — Labour-hire per-job attestation matrix.
-- Adds labour-hire capture fields to ProgressAttestation. Populated only
-- when attestationType = 'LABOUR_HIRE_SELF'. Fair Work validation lives
-- in lib/progress/labour-hire.ts.

ALTER TABLE "ProgressAttestation"
    ADD COLUMN "labourHireHours" DECIMAL(6, 2),
    ADD COLUMN "labourHireAwardClass" TEXT,
    ADD COLUMN "labourHireSuperRate" DECIMAL(5, 4),
    ADD COLUMN "labourHirePortableLslState" TEXT,
    ADD COLUMN "labourHireInductionEvidenceId" TEXT;
