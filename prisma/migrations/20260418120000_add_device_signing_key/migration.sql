-- RA-1386 (Board M-10): DeviceSigningKey — Ed25519 keypair per device.
-- Used by C2PA-style manifests and in-house e-signature (M-18b).
-- Private key never leaves the device; server only knows publicKeyPem.

CREATE TABLE "DeviceSigningKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "publicKeyId" TEXT NOT NULL,
  "publicKeyPem" TEXT NOT NULL,
  "deviceUuid" TEXT,
  "devicePlatform" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),

  CONSTRAINT "DeviceSigningKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceSigningKey_publicKeyId_key" ON "DeviceSigningKey"("publicKeyId");
CREATE INDEX "DeviceSigningKey_userId_idx" ON "DeviceSigningKey"("userId");
CREATE INDEX "DeviceSigningKey_publicKeyId_idx" ON "DeviceSigningKey"("publicKeyId");
CREATE INDEX "DeviceSigningKey_revokedAt_idx" ON "DeviceSigningKey"("revokedAt");

ALTER TABLE "DeviceSigningKey"
  ADD CONSTRAINT "DeviceSigningKey_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
