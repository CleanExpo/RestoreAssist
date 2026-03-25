-- Add InspectionLayout enum
CREATE TYPE "InspectionLayout" AS ENUM ('ROOM_FIRST', 'TIMELINE', 'QUICK_CAPTURE');

-- Add RoomType enum
CREATE TYPE "RoomType" AS ENUM (
  'MASTER_BEDROOM', 'BEDROOM', 'BATHROOM', 'ENSUITE', 'KITCHEN',
  'LIVING_ROOM', 'FAMILY_ROOM', 'DINING_ROOM', 'LAUNDRY', 'HALLWAY',
  'GARAGE', 'ATTIC', 'BASEMENT', 'CRAWL_SPACE', 'OFFICE', 'STUDY',
  'OUTDOOR', 'ROOF_CAVITY', 'SUBFLOOR', 'STAIRWELL', 'OTHER'
);

-- Add AnnotationType enum
CREATE TYPE "AnnotationType" AS ENUM (
  'ARROW', 'CIRCLE', 'RECTANGLE', 'TEXT', 'FREEHAND', 'MEASUREMENT', 'DAMAGE_ZONE'
);

-- Add inspectionLayout preference to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "inspectionLayout" "InspectionLayout" NOT NULL DEFAULT 'ROOM_FIRST';

-- Create Room table
CREATE TABLE IF NOT EXISTS "Room" (
  "id"           TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "type"         "RoomType" NOT NULL DEFAULT 'OTHER',
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "thumbnailUrl" TEXT,
  "floorPlanData" TEXT,
  "length"       DOUBLE PRECISION,
  "width"        DOUBLE PRECISION,
  "height"       DOUBLE PRECISION,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- Create RoomAnnotation table
CREATE TABLE IF NOT EXISTS "RoomAnnotation" (
  "id"        TEXT NOT NULL,
  "roomId"    TEXT NOT NULL,
  "type"      "AnnotationType" NOT NULL,
  "data"      TEXT NOT NULL,
  "photoId"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RoomAnnotation_pkey" PRIMARY KEY ("id")
);

-- Add FK: Room → Inspection
ALTER TABLE "Room"
  ADD CONSTRAINT "Room_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add FK: RoomAnnotation → Room
ALTER TABLE "RoomAnnotation"
  ADD CONSTRAINT "RoomAnnotation_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add roomId FK to InspectionPhoto
ALTER TABLE "InspectionPhoto" ADD COLUMN IF NOT EXISTS "roomId" TEXT;
ALTER TABLE "InspectionPhoto"
  ADD CONSTRAINT "InspectionPhoto_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add roomId FK to MoistureReading
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "roomId" TEXT;
ALTER TABLE "MoistureReading"
  ADD CONSTRAINT "MoistureReading_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add roomId FK to AffectedArea
ALTER TABLE "AffectedArea" ADD COLUMN IF NOT EXISTS "roomId" TEXT;
ALTER TABLE "AffectedArea"
  ADD CONSTRAINT "AffectedArea_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add roomId FK to ScopeItem
ALTER TABLE "ScopeItem" ADD COLUMN IF NOT EXISTS "roomId" TEXT;
ALTER TABLE "ScopeItem"
  ADD CONSTRAINT "ScopeItem_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add Inspection → rooms relation index
CREATE INDEX IF NOT EXISTS "Room_inspectionId_idx" ON "Room"("inspectionId");
CREATE INDEX IF NOT EXISTS "RoomAnnotation_roomId_idx" ON "RoomAnnotation"("roomId");
