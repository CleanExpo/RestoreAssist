-- RA-1270: enable inbound webhooks for Ascora integration.
-- webhookSecret is nullable so existing integrations keep working;
-- users opt in by setting it via the integration settings UI.

ALTER TABLE "AscoraIntegration" ADD COLUMN "webhookSecret" TEXT;
ALTER TABLE "AscoraIntegration" ADD COLUMN "lastWebhookAt" TIMESTAMP(3);
