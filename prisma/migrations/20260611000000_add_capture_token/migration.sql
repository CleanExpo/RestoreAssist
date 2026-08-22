-- Homeowner self-capture token (spec §2). Additive; applied to prod via Supabase MCP.
CREATE TABLE IF NOT EXISTS "CaptureToken" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaptureToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CaptureToken_tokenHash_key" ON "CaptureToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "CaptureToken_inspectionId_idx" ON "CaptureToken"("inspectionId");
ALTER TABLE "CaptureToken" DROP CONSTRAINT IF EXISTS "CaptureToken_inspectionId_fkey";
ALTER TABLE "CaptureToken" ADD CONSTRAINT "CaptureToken_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
