-- Applied to prod (udooysjajglluvuxkijp) via Supabase MCP on 2026-06-16 and recorded in
-- the Supabase migration ledger; committed here for repo<->DB consistency (no drift).
--
-- SECURITY FIX (tenant-isolation bypass):
--   Six legacy commerce tables — customers, orders, order_items, products, quotes,
--   quote_items — carried always-true RLS policies for role `authenticated`:
--     authenticated_read_<t>  : SELECT USING (true)
--     authenticated_write_<t> : ALL    USING (true) WITH CHECK (true)
--   => any signed-in user could read AND write every row.
--
--   These tables are a sibling Unite-Group CRM module sharing this Supabase project
--   (snake_case, FK to `organizations`, absent from RestoreAssist's schema.prisma and
--   never covered by RA's workspace-scoped RLS migrations RA-413 / RA-4956).
--
-- FIX: drop the always-true policies and keep RLS ENABLED => default-deny for
--   anon/authenticated. Server access (service role / Prisma superuser BYPASSRLS) is
--   unaffected. Proper organization_id-scoped policies are a follow-up owned by the
--   CRM module (or confirm these tables are service-role-only and default-deny is final).
--
-- Idempotent: ENABLE RLS is a no-op when already enabled; DROP POLICY IF EXISTS re-runs cleanly.

BEGIN;

ALTER TABLE public.customers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_customers"    ON public.customers;
DROP POLICY IF EXISTS "authenticated_write_customers"   ON public.customers;
DROP POLICY IF EXISTS "authenticated_read_orders"       ON public.orders;
DROP POLICY IF EXISTS "authenticated_write_orders"      ON public.orders;
DROP POLICY IF EXISTS "authenticated_read_order_items"  ON public.order_items;
DROP POLICY IF EXISTS "authenticated_write_order_items" ON public.order_items;
DROP POLICY IF EXISTS "authenticated_read_products"     ON public.products;
DROP POLICY IF EXISTS "authenticated_write_products"    ON public.products;
DROP POLICY IF EXISTS "authenticated_read_quotes"       ON public.quotes;
DROP POLICY IF EXISTS "authenticated_write_quotes"      ON public.quotes;
DROP POLICY IF EXISTS "authenticated_read_quote_items"  ON public.quote_items;
DROP POLICY IF EXISTS "authenticated_write_quote_items" ON public.quote_items;

COMMIT;
