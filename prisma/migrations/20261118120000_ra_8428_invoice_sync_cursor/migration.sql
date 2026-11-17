-- RA-8428: the hourly invoice-sync backstop gets its own cursor.
--
-- WHY
--   GET /api/cron/sync-invoices used Integration."lastSyncAt" as its cursor,
--   took the 50 oldest changed invoices, then set the cursor to "now", so
--   invoice 51 onwards was never swept. The manual Sync button, client import
--   and the OAuth callback write the same column, so pressing Sync on one
--   invoice hid every other unswept edit. This table belongs to the cron
--   alone; "lastSyncAt" keeps its display meaning and is no longer read by it.
--
-- WHAT IT ADDS
--   InvoiceSyncCursor, one row per accounting integration:
--     cursorAt, cursorId  (updatedAt, id) of the last invoice queued (keyset)
--     sweptAt             when the cron last visited the integration; the
--                         round-robin order, so integration 101 is reached
--
-- CANNOT FAIL ON EXISTING ROWS
--   New table, no rows, no change to any existing table. The cron seeds a
--   cursor from "lastSyncAt" the first time it visits each integration, so
--   nothing already swept is queued again.
--
-- DEPLOY ORDER
--   Apply this migration before the code that reads it reaches production.
--   Until then only the sync-invoices cron fails (recorded by runCronJob);
--   no other Integration query names this table.

CREATE TABLE "InvoiceSyncCursor" (
    "integrationId" TEXT NOT NULL,
    "cursorAt" TIMESTAMP(3) NOT NULL,
    "cursorId" TEXT,
    "sweptAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSyncCursor_pkey" PRIMARY KEY ("integrationId")
);

CREATE INDEX "InvoiceSyncCursor_sweptAt_idx" ON "InvoiceSyncCursor"("sweptAt");

ALTER TABLE "InvoiceSyncCursor" ADD CONSTRAINT "InvoiceSyncCursor_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Service-only table: RLS on, no policy, so anon and authenticated are denied.
-- The cron writes through the server connection (table owner, RLS not forced).
ALTER TABLE "InvoiceSyncCursor" ENABLE ROW LEVEL SECURITY;
