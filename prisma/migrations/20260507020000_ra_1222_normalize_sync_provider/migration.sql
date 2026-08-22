-- RA-1222: Invoice.externalSyncProvider is free-form String — normalize casing.
-- Call sites historically mixed "XERO" and "Xero" causing query misses.
-- Full enum migration is deferred (requires table rewrite); this normalizes
-- existing values to uppercase and adds a check constraint to enforce valid values.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'Invoice') THEN
    -- Normalize any mixed-case values to uppercase
    UPDATE "Invoice"
    SET "externalSyncProvider" = UPPER("externalSyncProvider")
    WHERE "externalSyncProvider" IS NOT NULL
      AND "externalSyncProvider" != UPPER("externalSyncProvider");

    -- Add check constraint to prevent future drift
    ALTER TABLE "Invoice"
      DROP CONSTRAINT IF EXISTS "Invoice_externalSyncProvider_check";
    ALTER TABLE "Invoice"
      ADD CONSTRAINT "Invoice_externalSyncProvider_check"
      CHECK ("externalSyncProvider" IS NULL
        OR "externalSyncProvider" IN ('XERO', 'QUICKBOOKS', 'MYOB', 'SERVICEM8', 'ASCORA'));
  END IF;
END $$;
