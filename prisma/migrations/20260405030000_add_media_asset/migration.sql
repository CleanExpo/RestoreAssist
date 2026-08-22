-- RA-416: MediaAsset schema — EXIF metadata extraction + media intelligence
-- Stores GPS, device, camera, and dimension data from every uploaded photo/video.
-- rawExifData (JSONB) provides forward-compatible full EXIF dump for future use.

-- CreateTable: MediaAsset
CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "evidenceId" TEXT,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "altitude" DOUBLE PRECISION,
  "accuracy" DOUBLE PRECISION,
  "capturedAt" TIMESTAMP(3),
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "timezone" TEXT,
  "deviceMake" TEXT,
  "deviceModel" TEXT,
  "software" TEXT,
  "lensModel" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "orientation" INTEGER,
  "colorSpace" TEXT,
  "dpiX" DOUBLE PRECISION,
  "dpiY" DOUBLE PRECISION,
  "focalLength" DOUBLE PRECISION,
  "aperture" DOUBLE PRECISION,
  "exposureTime" TEXT,
  "iso" INTEGER,
  "flash" BOOLEAN,
  "durationSeconds" DOUBLE PRECISION,
  "videoWidth" INTEGER,
  "videoHeight" INTEGER,
  "videoCodec" TEXT,
  "frameRate" DOUBLE PRECISION,
  "rawExifData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "MediaAsset_workspaceId_idx" ON "MediaAsset"("workspaceId");
CREATE INDEX "MediaAsset_inspectionId_idx" ON "MediaAsset"("inspectionId");
CREATE INDEX "MediaAsset_evidenceId_idx" ON "MediaAsset"("evidenceId");
CREATE INDEX "MediaAsset_capturedAt_idx" ON "MediaAsset"("capturedAt");
CREATE INDEX "MediaAsset_latitude_longitude_idx" ON "MediaAsset"("latitude", "longitude");
CREATE INDEX "MediaAsset_mimeType_idx" ON "MediaAsset"("mimeType");

-- ForeignKeys
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "MediaAsset" ENABLE ROW LEVEL SECURITY;

-- RLS: workspace members can view media assets in their workspace
CREATE POLICY "MediaAsset_select_member" ON "MediaAsset"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "WorkspaceMember" wm
      WHERE wm."workspaceId" = "workspaceId"
        AND wm."userId" = auth.uid()::text
        AND wm."status" = 'ACTIVE'
    )
  );
-- Inserts are server-side only (service role handles EXIF extraction)
