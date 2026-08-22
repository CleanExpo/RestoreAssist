-- RA-1231: WebhookEvent.processedAt — retention cron + last-N-events query
CREATE INDEX IF NOT EXISTS "WebhookEvent_processedAt_idx" ON "WebhookEvent"("processedAt");

-- RA-1326/1327: PropertyLookup.inspectionId cascade delete (privacy/GDPR compliance)
-- SetNull → Cascade so orphaned cache rows are cleaned up on inspection deletion.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'PropertyLookup') THEN
    ALTER TABLE "PropertyLookup"
      DROP CONSTRAINT IF EXISTS "PropertyLookup_inspectionId_fkey";
    ALTER TABLE "PropertyLookup"
      ADD CONSTRAINT "PropertyLookup_inspectionId_fkey"
      FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RA-1227: InvoiceLineItem.estimateLineItemId — add index for lookup queries
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'InvoiceLineItem') THEN
    CREATE INDEX IF NOT EXISTS "InvoiceLineItem_estimateLineItemId_idx"
      ON "InvoiceLineItem"("estimateLineItemId");
  END IF;
END $$;
