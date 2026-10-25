-- RA-8069: credit-note numbers are unique per owner, not per platform.
--
-- WHY
--   Every business numbers its credit notes from its own sequence
--   (CN-{year}-0001, -0002, ...), but "CreditNote_creditNoteNumber_key" made
--   the number unique across ALL users. The first business to issue a credit
--   note took CN-{year}-0001; every other business then hit a unique
--   violation (409) on every attempt. D-022 fixed the same clash for
--   invoices; this is the credit-note half.
--
-- WHAT IT CHANGES
--   Adds a unique index on ("userId", "creditNoteNumber"), then drops the
--   platform-wide unique index on "creditNoteNumber" and the plain index on
--   ("userId", "creditNoteNumber"), which the new unique index replaces.
--
-- NOT ADDITIVE, ON PURPOSE
--   `migration-roundtrip.sh additive-only` flags the DROP INDEX lines. The
--   drops only relax or replace constraints: no column, row or data is
--   removed, and every existing row already satisfies the new index because
--   it satisfied the stricter old one. The new index is created first, so
--   there is no moment with no uniqueness at all.
--
-- REVERSIBLE
--   down.sql restores the platform-wide index. That fails once two owners
--   hold the same number, which is the state this migration exists to allow.

CREATE UNIQUE INDEX "CreditNote_userId_creditNoteNumber_key" ON "CreditNote"("userId", "creditNoteNumber");

DROP INDEX "CreditNote_creditNoteNumber_key";

DROP INDEX IF EXISTS "CreditNote_userId_creditNoteNumber_idx";
