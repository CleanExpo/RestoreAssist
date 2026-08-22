-- RA-1246: Activation funnel events.
-- Tracks signup → first report conversion for product analytics.

CREATE TABLE "ActivationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivationEvent_userId_eventName_idx" ON "ActivationEvent"("userId", "eventName");
CREATE INDEX "ActivationEvent_createdAt_idx" ON "ActivationEvent"("createdAt");

ALTER TABLE "ActivationEvent" ADD CONSTRAINT "ActivationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
