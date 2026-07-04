-- RA-6988 — DB unique backstop against the DR-NRPG inbound-webhook dedup TOCTOU.
--
-- The route's findUnique(DrNrpgJobSync)+isStaleReplay dedup guard is a
-- read-then-decide check, not atomic: two concurrent redeliveries of the same
-- event can both read no/stale prior row and both reach the job.dispatched
-- auto-create → TWO Inspection rows for one job. This NEW, deliberately EMPTY
-- table's unique key lets the DB reject the second insert (P2002), closing the
-- race — mirroring the merged MYOB/Xero P2002 backstop (RA-1265).
--
-- Deliberately NOT an index over DrNrpgWebhookLog: that table stores a row per
-- duplicate delivery on purpose, so a unique index there would fail on existing
-- prod data.
--
-- Deploy-safe: the table is created empty, so its unique index cannot fail on
-- existing data. Fully additive + idempotent (IF NOT EXISTS throughout) — no
-- destructive DROP, no bare ALTER that could fail on existing rows.

CREATE TABLE IF NOT EXISTS "DrNrpgWebhookEvent" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "drNrpgJobId" TEXT NOT NULL,
    "eventTimestamp" TIMESTAMP(3) NOT NULL,
    "eventType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrNrpgWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- The atomic dedup key: a true replay of one event collides here; two distinct
-- same-second events differ by eventType and both pass.
CREATE UNIQUE INDEX IF NOT EXISTS "DrNrpgWebhookEvent_integrationId_drNrpgJobId_eventTimestamp_eventType_key"
    ON "DrNrpgWebhookEvent" ("integrationId", "drNrpgJobId", "eventTimestamp", "eventType");

CREATE INDEX IF NOT EXISTS "DrNrpgWebhookEvent_integrationId_idx"
    ON "DrNrpgWebhookEvent" ("integrationId");

-- FK to the owning integration (cascade delete), matching DrNrpgJobSync.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DrNrpgWebhookEvent_integrationId_fkey'
    ) THEN
        ALTER TABLE "DrNrpgWebhookEvent"
            ADD CONSTRAINT "DrNrpgWebhookEvent_integrationId_fkey"
            FOREIGN KEY ("integrationId") REFERENCES "DrNrpgIntegration" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
