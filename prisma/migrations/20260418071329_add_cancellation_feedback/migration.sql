-- RA-1243: Capture reason + comment + plan snapshot when a user cancels.
-- Used for churn analytics. Purely additive — no data migration needed.

CREATE TABLE "CancellationFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "subscriptionPlan" TEXT,
    "tenureDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CancellationFeedback_userId_idx" ON "CancellationFeedback"("userId");
CREATE INDEX "CancellationFeedback_reason_idx" ON "CancellationFeedback"("reason");
CREATE INDEX "CancellationFeedback_createdAt_idx" ON "CancellationFeedback"("createdAt");

ALTER TABLE "CancellationFeedback"
  ADD CONSTRAINT "CancellationFeedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
