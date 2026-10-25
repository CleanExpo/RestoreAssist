-- Reverse of 20261025120000_ra8069_credit_note_number_unique_per_owner.
--
-- Restores the platform-wide unique index on "creditNoteNumber" and the plain
-- ("userId", "creditNoteNumber") index, and drops the per-owner unique one.
-- Fails if two owners already hold the same number; resolve those rows first.

CREATE UNIQUE INDEX "CreditNote_creditNoteNumber_key" ON "CreditNote"("creditNoteNumber");

CREATE INDEX IF NOT EXISTS "CreditNote_userId_creditNoteNumber_idx" ON "CreditNote"("userId", "creditNoteNumber");

DROP INDEX IF EXISTS "CreditNote_userId_creditNoteNumber_key";
