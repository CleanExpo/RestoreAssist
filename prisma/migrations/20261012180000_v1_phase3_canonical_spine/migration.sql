-- V1 Phase 3 — client / insurer spine, scope sketch link, scheduling (P5-1 base)
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "insurerProfileId" TEXT;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "insurerTemplateId" TEXT;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "claimNumber" TEXT;

ALTER TABLE "ScopeItem" ADD COLUMN IF NOT EXISTS "sketchRoomId" TEXT;

CREATE INDEX IF NOT EXISTS "Inspection_clientId_idx" ON "Inspection"("clientId");
CREATE INDEX IF NOT EXISTS "Inspection_insurerProfileId_idx" ON "Inspection"("insurerProfileId");
CREATE INDEX IF NOT EXISTS "Inspection_claimNumber_idx" ON "Inspection"("claimNumber");
CREATE INDEX IF NOT EXISTS "ScopeItem_sketchRoomId_idx" ON "ScopeItem"("sketchRoomId");

DO $$ BEGIN
  ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_insurerProfileId_fkey"
    FOREIGN KEY ("insurerProfileId") REFERENCES "InsurerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ScopeItem" ADD CONSTRAINT "ScopeItem_sketchRoomId_fkey"
    FOREIGN KEY ("sketchRoomId") REFERENCES "SketchRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "JobAppointmentStatus" AS ENUM ('SCHEDULED', 'ACKNOWLEDGED', 'CANCELLED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "JobAppointment" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Site visit',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "JobAppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "notes" TEXT,
  "assignedUserId" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobAppointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "JobAppointment_inspectionId_startsAt_idx" ON "JobAppointment"("inspectionId", "startsAt");
CREATE INDEX IF NOT EXISTS "JobAppointment_assignedUserId_startsAt_idx" ON "JobAppointment"("assignedUserId", "startsAt");
CREATE INDEX IF NOT EXISTS "JobAppointment_status_idx" ON "JobAppointment"("status");

DO $$ BEGIN
  ALTER TABLE "JobAppointment" ADD CONSTRAINT "JobAppointment_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "JobAppointment" ADD CONSTRAINT "JobAppointment_assignedUserId_fkey"
    FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "JobAppointment" ADD CONSTRAINT "JobAppointment_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
