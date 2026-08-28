-- Index-only companion to 20260828213000_job_file_audit_intake_replay_guard.
-- Apply through the approved non-transactional Supabase migration path so
-- live SupportTicket writes continue while Postgres builds the uniqueness
-- boundary. CI pre-resolves this migration before Prisma migrate deploy.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "SupportTicket_externalReference_key"
  ON "SupportTicket"("externalReference");
