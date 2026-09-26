-- Reverse of 20260926090000_d022_invoice_number_unique_per_owner.
--
-- Restores the platform-wide unique index on "invoiceNumber" and drops the
-- per-owner one. Fails if two owners already hold the same number; resolve
-- those rows first.

CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

DROP INDEX IF EXISTS "Invoice_userId_invoiceNumber_key";
