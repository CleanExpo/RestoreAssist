-- CreateTable
CREATE TABLE "RestorationIncident" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "waterCategory" "WaterCategory",
    "damageClass" "DamageClass",
    "lossSource" "LossSourceType",
    "hazards" TEXT[],
    "remediationDays" INTEGER,
    "outcome" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "sourceInspectionHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestorationIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestorationIncident_sourceInspectionHash_key" ON "RestorationIncident"("sourceInspectionHash");

-- CreateIndex
CREATE INDEX "RestorationIncident_state_postcode_idx" ON "RestorationIncident"("state", "postcode");

-- CreateIndex
CREATE INDEX "RestorationIncident_waterCategory_damageClass_idx" ON "RestorationIncident"("waterCategory", "damageClass");

-- CreateIndex
CREATE INDEX "RestorationIncident_capturedAt_idx" ON "RestorationIncident"("capturedAt");


-- RA-6917: RestorationIncident is a cross-org, de-identified analytics table
-- accessed only by server/service-role code. Enable RLS with NO policy so the
-- default-deny baseline blocks any anon/authenticated client key outright
-- (service role BYPASSRLS). This is the same service-only posture as
-- PropertyLookup / StorageRestoreJob.
ALTER TABLE "RestorationIncident" ENABLE ROW LEVEL SECURITY;
