-- Reverse of 20261118120000_ra_8428_invoice_sync_cursor.
--
-- Revert the application code BEFORE running this: the sync-invoices cron
-- built from the new schema reads and writes this table on every run.
-- Dropping it loses only backstop cursor positions; the next run of the old
-- code falls back to Integration."lastSyncAt".

SET lock_timeout = '5s';

DROP TABLE IF EXISTS "InvoiceSyncCursor";
