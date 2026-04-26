-- RA-1390 / Motion M-15 — Monthly 5% override governance report.
-- One row per (month, gate) summarising SOFT-gap overrides.

CREATE TABLE "OverrideGovernanceReport" (
    "id" TEXT NOT NULL,
    "reportMonth" DATE NOT NULL,
    "gateKey" TEXT NOT NULL,
    "transitionCount" INTEGER NOT NULL,
    "overrideCount" INTEGER NOT NULL,
    "overrideRate" DOUBLE PRECISION NOT NULL,
    "isBreached" BOOLEAN NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OverrideGovernanceReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OverrideGovernanceReport_reportMonth_gateKey_key"
    ON "OverrideGovernanceReport"("reportMonth", "gateKey");

CREATE INDEX "OverrideGovernanceReport_reportMonth_idx"
    ON "OverrideGovernanceReport"("reportMonth");

CREATE INDEX "OverrideGovernanceReport_isBreached_reportMonth_idx"
    ON "OverrideGovernanceReport"("isBreached", "reportMonth");
