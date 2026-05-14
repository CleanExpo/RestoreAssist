-- SP-3 T2 — SubscriptionEvent table for Stripe webhook idempotency + audit history.
-- New table only; no destructive changes. The stripeEventId UNIQUE index is the
-- idempotency key — `recordSubscriptionEvent()` dedupes on it before insert.

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "stripeEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionEvent_stripeEventId_key" ON "SubscriptionEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_userId_createdAt_idx" ON "SubscriptionEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_eventType_idx" ON "SubscriptionEvent"("eventType");

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
