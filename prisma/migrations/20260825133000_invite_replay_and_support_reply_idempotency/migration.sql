ALTER TABLE "UserInvite"
  ADD COLUMN "acceptancePayloadHash" TEXT;

ALTER TABLE "SupportTicketReply"
  ADD COLUMN "deliveryKey" TEXT,
  ADD COLUMN "ticketStatus" TEXT;

-- Existing replies predate durable HTTP idempotency. Give each a stable,
-- collision-free legacy identity before making the new column mandatory.
UPDATE "SupportTicketReply"
SET "deliveryKey" = 'legacy:' || "id"
WHERE "deliveryKey" IS NULL;

UPDATE "SupportTicketReply"
SET "ticketStatus" = 'legacy_unknown'
WHERE "ticketStatus" IS NULL;

ALTER TABLE "SupportTicketReply"
  ALTER COLUMN "deliveryKey" SET NOT NULL,
  ALTER COLUMN "ticketStatus" SET NOT NULL;

CREATE UNIQUE INDEX "SupportTicketReply_deliveryKey_key"
  ON "SupportTicketReply"("deliveryKey");
