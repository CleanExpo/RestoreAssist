-- Homeowner self-capture quarantine sidecar (D4). Additive; applied to prod via Supabase MCP.
ALTER TABLE "ClaimSketch" ADD COLUMN IF NOT EXISTS "pendingHomeownerCapture" JSONB;
