-- P2 / V1 P2-5 — dedupe external accounting payments at the DB layer
CREATE UNIQUE INDEX IF NOT EXISTS "InvoicePayment_external_provider_unique"
  ON "InvoicePayment" ("externalProvider", "externalPaymentId")
  WHERE "externalPaymentId" IS NOT NULL AND "externalProvider" IS NOT NULL;
