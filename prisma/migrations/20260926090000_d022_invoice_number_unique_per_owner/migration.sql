-- D-022 (prelaunch audit): invoice numbers are unique per owner, not per platform.
--
-- WHY
--   Every invoice writer numbers from a per-user InvoiceSequence
--   (RA-{year}-0001, -0002, ...), but "Invoice_invoiceNumber_key" made the
--   number unique across ALL users. The first business to invoice in a year
--   took RA-{year}-0001; every other business then hit a unique violation on
--   every attempt, and the P2002 retry re-synced to its own max (0) and
--   collided again.
--
-- WHAT IT CHANGES
--   Adds a unique index on ("userId", "invoiceNumber"), then drops the
--   platform-wide unique index on "invoiceNumber".
--
-- NOT ADDITIVE, ON PURPOSE
--   `migration-roundtrip.sh additive-only` flags the DROP INDEX. The drop
--   only relaxes a constraint: no column, row or data is removed, and every
--   existing row already satisfies the new index because it satisfied the
--   stricter old one. The new index is created first, so there is no moment
--   with no uniqueness at all.
--
-- REVERSIBLE
--   down.sql restores the platform-wide index. That fails once two owners
--   hold the same number, which is the state this migration exists to allow.

CREATE UNIQUE INDEX "Invoice_userId_invoiceNumber_key" ON "Invoice"("userId", "invoiceNumber");

DROP INDEX "Invoice_invoiceNumber_key";
