-- RA-1360: prevent duplicate Invoice rows on external-sync re-imports.
--
-- Step 1: dedupe any existing duplicates — keep the row with the newest
--   externalSyncedAt (fallback to newest updatedAt if externalSyncedAt is null),
--   re-parent InvoicePayment + InvoicePaymentAllocation rows to the keeper, then
--   delete the losers.
-- Step 2: add the composite unique constraint. Postgres NULL handling means
--   invoices with both externalSyncProvider AND externalInvoiceId null (local-
--   only invoices) never collide — exactly the desired partial-unique semantics.

BEGIN;

-- Step 1a — compute keeper rows (one per duplicate group)
CREATE TEMP TABLE _ra1360_keepers ON COMMIT DROP AS
SELECT DISTINCT ON ("externalSyncProvider", "externalInvoiceId")
       "id" AS keeper_id, "externalSyncProvider", "externalInvoiceId"
FROM "Invoice"
WHERE "externalSyncProvider" IS NOT NULL
  AND "externalInvoiceId"    IS NOT NULL
ORDER BY "externalSyncProvider",
         "externalInvoiceId",
         "externalSyncedAt" DESC NULLS LAST,
         "updatedAt"         DESC;

-- Step 1b — re-parent payments + allocations from losers to the keeper
UPDATE "InvoicePayment" p
SET "invoiceId" = k.keeper_id
FROM "Invoice" i
JOIN _ra1360_keepers k
  ON k."externalSyncProvider" = i."externalSyncProvider"
 AND k."externalInvoiceId"    = i."externalInvoiceId"
WHERE p."invoiceId" = i."id"
  AND i."id" <> k.keeper_id;

UPDATE "InvoicePaymentAllocation" a
SET "invoiceId" = k.keeper_id
FROM "Invoice" i
JOIN _ra1360_keepers k
  ON k."externalSyncProvider" = i."externalSyncProvider"
 AND k."externalInvoiceId"    = i."externalInvoiceId"
WHERE a."invoiceId" = i."id"
  AND i."id" <> k.keeper_id;

-- Step 1c — delete the loser invoice rows
DELETE FROM "Invoice" i
USING _ra1360_keepers k
WHERE k."externalSyncProvider" = i."externalSyncProvider"
  AND k."externalInvoiceId"    = i."externalInvoiceId"
  AND i."id" <> k.keeper_id;

-- Step 2 — add the composite unique constraint
CREATE UNIQUE INDEX "Invoice_external_sync_uniq"
  ON "Invoice" ("externalSyncProvider", "externalInvoiceId");

COMMIT;
