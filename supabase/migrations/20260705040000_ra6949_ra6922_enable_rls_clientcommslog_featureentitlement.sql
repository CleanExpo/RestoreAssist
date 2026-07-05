-- Close anon-key exposure: enable RLS (default-deny) on two public tables that
-- shipped without it. App uses the postgres role (bypasses RLS), so default-deny
-- affects only anon/authenticated — matches DrNrpgWebhookEvent service-only pattern.
-- Tenant policies can be layered later under RA-6677.
ALTER TABLE public."FeatureEntitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClientCommsLog" ENABLE ROW LEVEL SECURITY;
