-- RA-7694: structured room observations (odour, visible growth, staining).
--
-- Additive only: three new enums and one new table, with its indexes, foreign
-- keys and value checks. No existing table or column is changed. Reverse:
-- down.sql in this folder.
--
-- "RoomObservation_sketchRoomId_fkey" is ON DELETE SET NULL: the table keeps a
-- "roomLabel" copy of the room name, so the report still names the room if the
-- sketch room is later removed.

-- CreateEnum
CREATE TYPE "RoomObservationKind" AS ENUM ('ODOUR', 'VISIBLE_GROWTH', 'STAINING');

-- CreateEnum
CREATE TYPE "RoomObservationBasis" AS ENUM ('OBSERVED', 'MEASURED', 'HYPOTHESISED');

-- CreateEnum
CREATE TYPE "RoomOdourPattern" AS ENUM ('CONSTANT', 'INTERMITTENT');

-- CreateTable
CREATE TABLE "RoomObservation" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "sketchRoomId" TEXT,
    "roomLabel" TEXT NOT NULL,
    "kind" "RoomObservationKind" NOT NULL,
    "basis" "RoomObservationBasis" NOT NULL DEFAULT 'OBSERVED',
    "odourDescriptor" TEXT,
    "odourIntensity" INTEGER,
    "odourPattern" "RoomOdourPattern",
    "areaM2" DOUBLE PRECISION,
    "surface" TEXT,
    "detail" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "capturedByUserId" TEXT,
    "observedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomObservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoomObservation_odourIntensity_check" CHECK ("odourIntensity" IS NULL OR "odourIntensity" BETWEEN 1 AND 3),
    CONSTRAINT "RoomObservation_areaM2_check" CHECK ("areaM2" IS NULL OR ("areaM2" >= 0 AND "areaM2" <= 10000))
);

-- CreateIndex
CREATE INDEX "RoomObservation_inspectionId_observedAt_idx" ON "RoomObservation"("inspectionId", "observedAt");

-- CreateIndex
CREATE INDEX "RoomObservation_sketchRoomId_idx" ON "RoomObservation"("sketchRoomId");

-- AddForeignKey
ALTER TABLE "RoomObservation" ADD CONSTRAINT "RoomObservation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomObservation" ADD CONSTRAINT "RoomObservation_sketchRoomId_fkey" FOREIGN KEY ("sketchRoomId") REFERENCES "SketchRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Default-deny for the Supabase API roles, as every tenant table has; the app
-- reaches this table through Prisma as the table owner.
ALTER TABLE "RoomObservation" ENABLE ROW LEVEL SECURITY;
