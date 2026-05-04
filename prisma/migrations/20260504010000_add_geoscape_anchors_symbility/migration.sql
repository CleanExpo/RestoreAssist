-- Sketch V3 — Phase 2 (Geoscape + Nearmap), Phase 4 (GeometryAnchor),
-- Phase 3 (SymbilityExport append-only).

-- CreateTable: GeoscapeFootprint (Phase 2)
CREATE TABLE "GeoscapeFootprint" (
    "id" TEXT NOT NULL,
    "gnafPid" TEXT,
    "buildingId" TEXT,
    "geomGeoJson" JSONB NOT NULL,
    "storeyCount" INTEGER,
    "roofMaterial" TEXT,
    "capturedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "addressKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoscapeFootprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable: NearmapTile (Phase 2)
CREATE TABLE "NearmapTile" (
    "id" TEXT NOT NULL,
    "footprintId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "bbox" JSONB NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "zoomLevel" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NearmapTile_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GeometryAnchor (Phase 4)
CREATE TABLE "GeometryAnchor" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "geometryType" TEXT NOT NULL,
    "geometryId" TEXT NOT NULL,
    "moistureReadingId" TEXT,
    "inspectionPhotoId" TEXT,
    "attestationId" TEXT,
    "voiceNoteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeometryAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SymbilityExport (Phase 3, append-only)
CREATE TABLE "SymbilityExport" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "floorPlanIds" TEXT[],
    "xmlPayload" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SymbilityExport_pkey" PRIMARY KEY ("id")
);

-- Indexes: GeoscapeFootprint
CREATE UNIQUE INDEX "GeoscapeFootprint_gnafPid_key" ON "GeoscapeFootprint"("gnafPid");
CREATE UNIQUE INDEX "GeoscapeFootprint_buildingId_key" ON "GeoscapeFootprint"("buildingId");
CREATE INDEX "GeoscapeFootprint_addressKey_idx" ON "GeoscapeFootprint"("addressKey");
CREATE INDEX "GeoscapeFootprint_expiresAt_idx" ON "GeoscapeFootprint"("expiresAt");

-- Indexes: NearmapTile
CREATE INDEX "NearmapTile_footprintId_idx" ON "NearmapTile"("footprintId");

-- Indexes: GeometryAnchor
CREATE INDEX "GeometryAnchor_geometryType_geometryId_idx" ON "GeometryAnchor"("geometryType", "geometryId");
CREATE INDEX "GeometryAnchor_floorPlanId_idx" ON "GeometryAnchor"("floorPlanId");
CREATE INDEX "GeometryAnchor_moistureReadingId_idx" ON "GeometryAnchor"("moistureReadingId");
CREATE INDEX "GeometryAnchor_inspectionPhotoId_idx" ON "GeometryAnchor"("inspectionPhotoId");
CREATE INDEX "GeometryAnchor_attestationId_idx" ON "GeometryAnchor"("attestationId");

-- Indexes: SymbilityExport
CREATE INDEX "SymbilityExport_inspectionId_idx" ON "SymbilityExport"("inspectionId");
CREATE INDEX "SymbilityExport_createdAt_idx" ON "SymbilityExport"("createdAt");

-- Foreign keys
ALTER TABLE "NearmapTile" ADD CONSTRAINT "NearmapTile_footprintId_fkey"
    FOREIGN KEY ("footprintId") REFERENCES "GeoscapeFootprint"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only enforcement on SymbilityExport (Rule 22 — append-only audit).
-- Postgres trigger blocks UPDATE / DELETE so application-level bugs can't
-- silently mutate exported claim data.
CREATE OR REPLACE FUNCTION block_symbility_export_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'SymbilityExport rows are append-only (id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER symbility_export_no_update
    BEFORE UPDATE ON "SymbilityExport"
    FOR EACH ROW EXECUTE FUNCTION block_symbility_export_mutation();

CREATE TRIGGER symbility_export_no_delete
    BEFORE DELETE ON "SymbilityExport"
    FOR EACH ROW EXECUTE FUNCTION block_symbility_export_mutation();
