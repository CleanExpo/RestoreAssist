-- RA-7091 / RA-7090 bridge: RoomPlan capture receipts + moisture/hazard room links

CREATE TABLE IF NOT EXISTS "RoomPlanCaptureReceipt" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "clientCustodyId" TEXT,
    "floorNumber" INTEGER NOT NULL DEFAULT 0,
    "payloadJson" JSONB NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "clientSha256" TEXT,
    "evidenceItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomPlanCaptureReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RoomPlanCaptureReceipt_inspectionId_idx" ON "RoomPlanCaptureReceipt"("inspectionId");
CREATE INDEX IF NOT EXISTS "RoomPlanCaptureReceipt_inspectionId_contentSha256_idx" ON "RoomPlanCaptureReceipt"("inspectionId", "contentSha256");
CREATE INDEX IF NOT EXISTS "RoomPlanCaptureReceipt_clientCustodyId_idx" ON "RoomPlanCaptureReceipt"("clientCustodyId");

ALTER TABLE "RoomPlanCaptureReceipt"
  ADD CONSTRAINT "RoomPlanCaptureReceipt_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SketchMoistureReading" ADD COLUMN IF NOT EXISTS "sketchRoomId" TEXT;
CREATE INDEX IF NOT EXISTS "SketchMoistureReading_sketchRoomId_idx" ON "SketchMoistureReading"("sketchRoomId");
ALTER TABLE "SketchMoistureReading"
  DROP CONSTRAINT IF EXISTS "SketchMoistureReading_sketchRoomId_fkey";
ALTER TABLE "SketchMoistureReading"
  ADD CONSTRAINT "SketchMoistureReading_sketchRoomId_fkey"
  FOREIGN KEY ("sketchRoomId") REFERENCES "SketchRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Hazard" ADD COLUMN IF NOT EXISTS "sketchRoomId" TEXT;
CREATE INDEX IF NOT EXISTS "Hazard_sketchRoomId_idx" ON "Hazard"("sketchRoomId");
ALTER TABLE "Hazard"
  DROP CONSTRAINT IF EXISTS "Hazard_sketchRoomId_fkey";
ALTER TABLE "Hazard"
  ADD CONSTRAINT "Hazard_sketchRoomId_fkey"
  FOREIGN KEY ("sketchRoomId") REFERENCES "SketchRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
