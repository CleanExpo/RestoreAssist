-- RA-7090 slice 2 (review round 1, MUST-FIX 3)
-- publicKeyId is now DERIVED server-side from the SPKI bytes, so the same key
-- material always maps to the same id and a revoked key cannot be
-- re-registered under a fresh alias. This adds the belt-and-braces
-- constraint: one public key can never be registered twice under one account.
--
-- publicKeyPem moves from unbounded TEXT to VARCHAR(4096) so it is indexable
-- (an Ed25519 SPKI PEM is ~113 chars; the route already caps input at 4096).

ALTER TABLE "DeviceSigningKey"
  ALTER COLUMN "publicKeyPem" TYPE VARCHAR(4096);

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceSigningKey_userId_publicKeyPem_key"
  ON "DeviceSigningKey"("userId", "publicKeyPem");
