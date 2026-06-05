-- Enable Row Level Security on operational/server-owned tables that were
-- introduced by recent Prisma migrations without RLS. These tables are written
-- through server-side application code, not exposed as direct client tables.
-- No anon/authenticated PostgREST policies are added intentionally: direct
-- client access should be denied while the server-side DB role continues to use
-- Prisma for operational writes.

ALTER TABLE "ClientMutation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FieldCaptureEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdempotencyRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitHit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VoiceCopilotObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VoiceCopilotSession" ENABLE ROW LEVEL SECURITY;
