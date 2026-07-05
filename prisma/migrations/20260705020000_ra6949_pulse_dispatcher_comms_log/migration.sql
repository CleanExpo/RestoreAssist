-- RA-6949 (epic RA-6948, Restoration Pulse P0) — notification dispatcher
-- foundation: the per-job ClientCommsLog + the two Pulse control flags.
--
-- Three changes, all additive + idempotent + deploy-safe (prisma migrate deploy):
--   1. ClientCommsLog — NEW table. Its unique index cannot fail on existing
--      data because the table starts empty. Records every SEND and every
--      SUPPRESSION the dispatcher performs.
--   2. Inspection.pulseEnabled — NEW BOOLEAN column, NOT NULL DEFAULT false.
--      The per-job Pulse kill switch (default OFF for safe pilot rollout).
--   3. Client.pulseOptOut — NEW BOOLEAN column, NOT NULL DEFAULT false.
--      The per-homeowner unsubscribe.
--
-- No existing table or column is altered or dropped; the DEFAULT on both new
-- columns backfills existing rows so the NOT NULL cannot fail. IF NOT EXISTS
-- makes a replay a no-op (Postgres 12+).

-- CreateTable: ClientCommsLog
CREATE TABLE IF NOT EXISTS "ClientCommsLog" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "suppressionReason" TEXT,
  "providerMessageId" TEXT,
  "templateKey" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientCommsLog_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "ClientCommsLog_idempotencyKey_key" ON "ClientCommsLog"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "ClientCommsLog_inspectionId_idx" ON "ClientCommsLog"("inspectionId");
CREATE INDEX IF NOT EXISTS "ClientCommsLog_status_idx" ON "ClientCommsLog"("status");
CREATE INDEX IF NOT EXISTS "ClientCommsLog_eventType_idx" ON "ClientCommsLog"("eventType");
CREATE INDEX IF NOT EXISTS "ClientCommsLog_createdAt_idx" ON "ClientCommsLog"("createdAt");

-- ForeignKey (guarded — ADD CONSTRAINT has no IF NOT EXISTS in Postgres).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClientCommsLog_inspectionId_fkey'
  ) THEN
    ALTER TABLE "ClientCommsLog"
      ADD CONSTRAINT "ClientCommsLog_inspectionId_fkey"
      FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AlterTable: Inspection.pulseEnabled (per-job Pulse kill switch, default OFF).
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "pulseEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Client.pulseOptOut (per-homeowner unsubscribe, default off).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "pulseOptOut" BOOLEAN NOT NULL DEFAULT false;
