-- RA-416: MediaAsset + MediaAssetTag tables
-- EXIF metadata store for all inspection photos and videos.
-- Run via: supabase db push OR paste into Supabase SQL editor.

-- ─── MediaAsset ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MediaAsset" (
  "id"               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId"      TEXT        NOT NULL,
  "inspectionId"     TEXT        NOT NULL,
  "evidenceId"       TEXT,

  -- File identity
  "originalFilename" TEXT        NOT NULL,
  "mimeType"         TEXT        NOT NULL,
  "fileSize"         INTEGER     NOT NULL,
  "storagePath"      TEXT        NOT NULL,

  -- GPS (WGS84 decimal degrees)
  "latitude"         DOUBLE PRECISION,
  "longitude"        DOUBLE PRECISION,
  "altitude"         DOUBLE PRECISION,
  "accuracy"         DOUBLE PRECISION,

  -- Timestamps
  "capturedAt"       TIMESTAMPTZ,
  "uploadedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "timezone"         TEXT,

  -- Device
  "deviceMake"       TEXT,
  "deviceModel"      TEXT,
  "software"         TEXT,
  "lensModel"        TEXT,

  -- Image dimensions
  "width"            INTEGER,
  "height"           INTEGER,
  "orientation"      INTEGER,
  "colorSpace"       TEXT,
  "dpiX"             DOUBLE PRECISION,
  "dpiY"             DOUBLE PRECISION,

  -- Camera settings
  "focalLength"      DOUBLE PRECISION,
  "aperture"         DOUBLE PRECISION,
  "exposureTime"     TEXT,
  "iso"              INTEGER,
  "flash"            BOOLEAN,

  -- Video metadata
  "durationSeconds"  DOUBLE PRECISION,
  "videoWidth"       INTEGER,
  "videoHeight"      INTEGER,
  "videoCodec"       TEXT,
  "frameRate"        DOUBLE PRECISION,

  -- Raw EXIF dump + SEO fields
  "rawExifData"      JSONB,
  "altText"          TEXT,
  "seoJsonLd"        JSONB,

  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MediaAsset_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "MediaAsset_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "MediaAsset_workspaceId_idx"       ON "MediaAsset" ("workspaceId");
CREATE INDEX IF NOT EXISTS "MediaAsset_inspectionId_idx"      ON "MediaAsset" ("inspectionId");
CREATE INDEX IF NOT EXISTS "MediaAsset_evidenceId_idx"        ON "MediaAsset" ("evidenceId");
CREATE INDEX IF NOT EXISTS "MediaAsset_capturedAt_idx"        ON "MediaAsset" ("capturedAt");
CREATE INDEX IF NOT EXISTS "MediaAsset_mimeType_idx"          ON "MediaAsset" ("mimeType");
CREATE INDEX IF NOT EXISTS "MediaAsset_gps_idx"               ON "MediaAsset" ("latitude", "longitude");

-- updatedAt trigger
CREATE OR REPLACE FUNCTION update_media_asset_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW."updatedAt" = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS media_asset_updated_at ON "MediaAsset";
CREATE TRIGGER media_asset_updated_at
  BEFORE UPDATE ON "MediaAsset"
  FOR EACH ROW EXECUTE FUNCTION update_media_asset_updated_at();

-- ─── MediaAssetTag ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MediaAssetTag" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "assetId"      TEXT NOT NULL,
  "workspaceId"  TEXT NOT NULL,
  "category"     TEXT NOT NULL, -- job | room | damage_type | date_bucket | location | technician | device
  "value"        TEXT NOT NULL,
  "inspectionId" TEXT,
  "evidenceId"   TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "MediaAssetTag_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MediaAssetTag_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE,
  CONSTRAINT "MediaAssetTag_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "MediaAssetTag_unique"
    UNIQUE ("assetId", "category", "value")
);

CREATE INDEX IF NOT EXISTS "MediaAssetTag_workspaceId_category_idx"       ON "MediaAssetTag" ("workspaceId", "category");
CREATE INDEX IF NOT EXISTS "MediaAssetTag_workspaceId_category_value_idx" ON "MediaAssetTag" ("workspaceId", "category", "value");
CREATE INDEX IF NOT EXISTS "MediaAssetTag_assetId_idx"                    ON "MediaAssetTag" ("assetId");
CREATE INDEX IF NOT EXISTS "MediaAssetTag_inspectionId_idx"               ON "MediaAssetTag" ("inspectionId");

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE "MediaAsset"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaAssetTag" ENABLE ROW LEVEL SECURITY;

-- MediaAsset: workspace members can select/insert/update/delete
CREATE POLICY "MediaAsset: workspace members select"
  ON "MediaAsset" FOR SELECT TO authenticated
  USING (is_workspace_member("workspaceId"));

CREATE POLICY "MediaAsset: workspace members insert"
  ON "MediaAsset" FOR INSERT TO authenticated
  WITH CHECK (is_workspace_member("workspaceId"));

CREATE POLICY "MediaAsset: workspace members update"
  ON "MediaAsset" FOR UPDATE TO authenticated
  USING (is_workspace_member("workspaceId"));

CREATE POLICY "MediaAsset: workspace members delete"
  ON "MediaAsset" FOR DELETE TO authenticated
  USING (is_workspace_member("workspaceId"));

-- MediaAssetTag: same workspace-scoped policies
CREATE POLICY "MediaAssetTag: workspace members select"
  ON "MediaAssetTag" FOR SELECT TO authenticated
  USING (is_workspace_member("workspaceId"));

CREATE POLICY "MediaAssetTag: workspace members insert"
  ON "MediaAssetTag" FOR INSERT TO authenticated
  WITH CHECK (is_workspace_member("workspaceId"));

CREATE POLICY "MediaAssetTag: workspace members update"
  ON "MediaAssetTag" FOR UPDATE TO authenticated
  USING (is_workspace_member("workspaceId"));

CREATE POLICY "MediaAssetTag: workspace members delete"
  ON "MediaAssetTag" FOR DELETE TO authenticated
  USING (is_workspace_member("workspaceId"));
