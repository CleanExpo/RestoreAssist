-- RA-1392 / Motion M-17 — Progress framework telemetry ship-blocker.
-- Append-only event stream backing the 8 events / 4 funnels / 2 KPIs.

CREATE TABLE "ProgressTelemetryEvent" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "claimProgressId" TEXT,
    "transitionId" TEXT,
    "transitionKey" TEXT,
    "gateKey" TEXT,
    "userId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressTelemetryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProgressTelemetryEvent_eventName_createdAt_idx"
    ON "ProgressTelemetryEvent"("eventName", "createdAt");

CREATE INDEX "ProgressTelemetryEvent_claimProgressId_createdAt_idx"
    ON "ProgressTelemetryEvent"("claimProgressId", "createdAt");

CREATE INDEX "ProgressTelemetryEvent_transitionKey_createdAt_idx"
    ON "ProgressTelemetryEvent"("transitionKey", "createdAt");

CREATE INDEX "ProgressTelemetryEvent_createdAt_idx"
    ON "ProgressTelemetryEvent"("createdAt");
