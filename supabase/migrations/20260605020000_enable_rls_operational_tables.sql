-- Mirror of Prisma migration 20260605020000_enable_rls_operational_tables.
-- Keeps Supabase-side schema evidence aligned with production Prisma migrations.

ALTER TABLE "ClientMutation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FieldCaptureEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdempotencyRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitHit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VoiceCopilotObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VoiceCopilotSession" ENABLE ROW LEVEL SECURITY;
