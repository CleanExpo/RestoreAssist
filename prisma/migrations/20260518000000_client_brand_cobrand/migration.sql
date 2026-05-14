-- P1 #10 (RA-4859..4868) — client co-brand on handover packages.
--
-- Additive migration. No destructive ops, no data backfill.
--   - Client.brandLogoUrl      TEXT NULL — HTTPS URL of the client's logo
--                                          (rendered in report.pdf + invoice.pdf header)
--   - Client.brandPrimaryColor TEXT NULL — 6-char hex (e.g. "#1C2E47")
--                                          used as the PDF accent colour
--
-- Both columns default to NULL; when either is NULL the PDF generator
-- falls back to the RestoreAssist defaults (lib/clients/brand.ts).
-- Validation (hex format, HTTPS-only) is enforced in the application
-- layer at create/update time, NOT at the DB level — keeps the schema
-- flexible for future brand-asset shapes without a destructive migration.

ALTER TABLE "Client"
  ADD COLUMN "brandLogoUrl" TEXT,
  ADD COLUMN "brandPrimaryColor" TEXT;
