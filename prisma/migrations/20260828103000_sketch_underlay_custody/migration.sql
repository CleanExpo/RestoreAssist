-- Track B: durable, content-bound custody for imported floor-plan references.
-- Reference artwork stays private and is never a report/export source.
CREATE TABLE "SketchUnderlayReference" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "sketchId" TEXT,
    "floorNumber" INTEGER NOT NULL DEFAULT 0,
    "storagePath" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourcePageUrl" TEXT,
    "sourceImageUrl" TEXT,
    "contentSha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sourceSizeBytes" INTEGER NOT NULL,
    "storedSizeBytes" INTEGER NOT NULL,
    "attestationVersion" TEXT NOT NULL,
    "attestationStatement" TEXT NOT NULL,
    "holdsRights" BOOLEAN NOT NULL,
    "compliesWithSourceTerms" BOOLEAN NOT NULL,
    "attestedByUserId" TEXT NOT NULL,
    "attestedAt" TIMESTAMP(3) NOT NULL,
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationMethod" TEXT,
    "verificationJson" JSONB,
    "replacedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SketchUnderlayReference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SketchUnderlayReference_inspectionId_floorNumber_replacedAt_removedAt_idx"
  ON "SketchUnderlayReference"("inspectionId", "floorNumber", "replacedAt", "removedAt");
CREATE INDEX "SketchUnderlayReference_sketchId_idx"
  ON "SketchUnderlayReference"("sketchId");
CREATE INDEX "SketchUnderlayReference_contentSha256_idx"
  ON "SketchUnderlayReference"("contentSha256");
CREATE UNIQUE INDEX "SketchUnderlayReference_one_active_per_floor_key"
  ON "SketchUnderlayReference"("inspectionId", "floorNumber")
  WHERE "replacedAt" IS NULL AND "removedAt" IS NULL;

ALTER TABLE "SketchUnderlayReference"
  ADD CONSTRAINT "SketchUnderlayReference_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SketchUnderlayReference"
  ADD CONSTRAINT "SketchUnderlayReference_sketchId_fkey"
  FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Server-owned custody ledger: Prisma/service-role handlers are the only
-- intended writers/readers. Browser roles get default-deny even if this table
-- is later exposed through PostgREST.
ALTER TABLE "SketchUnderlayReference" ENABLE ROW LEVEL SECURITY;

-- The nullable sketch link intentionally uses SET NULL so custody survives a
-- sketch deletion. A composite FK cannot combine that behaviour with the
-- required inspectionId, so a trigger enforces the same-inspection invariant.
CREATE OR REPLACE FUNCTION enforce_underlay_sketch_inspection()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."sketchId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."ClaimSketch" s
    WHERE s."id" = NEW."sketchId"
      AND s."inspectionId" = NEW."inspectionId"
  ) THEN
    RAISE EXCEPTION 'SketchUnderlayReference sketch must belong to its inspection';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "SketchUnderlayReference_same_inspection"
BEFORE INSERT OR UPDATE OF "sketchId", "inspectionId"
ON "SketchUnderlayReference"
FOR EACH ROW EXECUTE FUNCTION enforce_underlay_sketch_inspection();

-- Sketch graph children are server-route owned. Default-deny prevents direct
-- PostgREST writes from bypassing the parent-tenancy checks in those routes.
ALTER TABLE "SketchRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidencePin" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "EvidencePin"
  ADD CONSTRAINT "EvidencePin_inspectionPhotoId_fkey"
  FOREIGN KEY ("inspectionPhotoId") REFERENCES "InspectionPhoto"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

CREATE OR REPLACE FUNCTION enforce_evidence_pin_parentage()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."sketchRoomId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."SketchRoom" r
    WHERE r."id" = NEW."sketchRoomId" AND r."sketchId" = NEW."sketchId"
  ) THEN
    RAISE EXCEPTION 'EvidencePin room must belong to its sketch';
  END IF;
  IF NEW."inspectionPhotoId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public."InspectionPhoto" p
    JOIN public."ClaimSketch" s ON s."inspectionId" = p."inspectionId"
    WHERE p."id" = NEW."inspectionPhotoId" AND s."id" = NEW."sketchId"
  ) THEN
    RAISE EXCEPTION 'EvidencePin photo must belong to its sketch inspection';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "EvidencePin_same_parentage"
BEFORE INSERT OR UPDATE OF "sketchId", "sketchRoomId", "inspectionPhotoId"
ON "EvidencePin"
FOR EACH ROW EXECUTE FUNCTION enforce_evidence_pin_parentage();
