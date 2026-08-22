-- RA-417: Media Asset Tag table for auto-cataloging by multiple dimensions
-- Tags are upserted (idempotent) — safe to re-run cataloging pipeline

CREATE TABLE IF NOT EXISTS "MediaAssetTag" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "assetId"      TEXT NOT NULL,
    "workspaceId"  TEXT NOT NULL,
    "category"     TEXT NOT NULL,
    "value"        TEXT NOT NULL,
    "inspectionId" TEXT,
    "evidenceId"   TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAssetTag_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one tag per (asset, category, value) triple — enables upsert idempotency
CREATE UNIQUE INDEX IF NOT EXISTS "MediaAssetTag_assetId_category_value_key"
    ON "MediaAssetTag"("assetId", "category", "value");

-- Indexes for common filter patterns
CREATE INDEX IF NOT EXISTS "MediaAssetTag_assetId_idx"
    ON "MediaAssetTag"("assetId");

CREATE INDEX IF NOT EXISTS "MediaAssetTag_workspaceId_idx"
    ON "MediaAssetTag"("workspaceId");

CREATE INDEX IF NOT EXISTS "MediaAssetTag_category_value_idx"
    ON "MediaAssetTag"("category", "value");

CREATE INDEX IF NOT EXISTS "MediaAssetTag_inspectionId_idx"
    ON "MediaAssetTag"("inspectionId")
    WHERE "inspectionId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "MediaAssetTag_evidenceId_idx"
    ON "MediaAssetTag"("evidenceId")
    WHERE "evidenceId" IS NOT NULL;

-- Foreign keys
ALTER TABLE "MediaAssetTag"
    ADD CONSTRAINT "MediaAssetTag_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaAssetTag"
    ADD CONSTRAINT "MediaAssetTag_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaAssetTag"
    ADD CONSTRAINT "MediaAssetTag_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MediaAssetTag"
    ADD CONSTRAINT "MediaAssetTag_evidenceId_fkey"
    FOREIGN KEY ("evidenceId") REFERENCES "EvidenceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security (workspace isolation)
ALTER TABLE "MediaAssetTag" ENABLE ROW LEVEL SECURITY;
