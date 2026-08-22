-- RA-1265 / RA-1219: proper idempotency key for third-party webhooks.
-- The previous dedup strategy (findFirst on payload JSON within a 1h
-- window) was both racy (two concurrent retries could both pass the
-- check) and lossy (retries after the 1h window were re-processed).
-- New (provider, externalEventId) unique constraint lets Prisma P2002
-- reject duplicates at insert time — atomic, permanent, no window.
--
-- externalEventId is nullable because legacy rows don't have one.
-- NULL values are treated as distinct by Postgres so the unique
-- constraint doesn't collide on historical data.

ALTER TABLE "WebhookEvent" ADD COLUMN "externalEventId" TEXT;

CREATE UNIQUE INDEX "WebhookEvent_provider_externalEventId_key"
  ON "WebhookEvent"("provider", "externalEventId");
