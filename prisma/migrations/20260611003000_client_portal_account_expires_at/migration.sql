-- Client portal link expiry (security review must-fix). Additive; applied via Supabase MCP.
ALTER TABLE "ClientPortalAccount" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
