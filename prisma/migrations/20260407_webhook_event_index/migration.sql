-- Add composite index on WebhookEvent(provider, integrationId)
-- Improves query performance when webhook retry logic filters by provider + integrationId
CREATE INDEX IF NOT EXISTS "WebhookEvent_provider_integrationId_idx"
    ON "WebhookEvent"("provider", "integrationId");
