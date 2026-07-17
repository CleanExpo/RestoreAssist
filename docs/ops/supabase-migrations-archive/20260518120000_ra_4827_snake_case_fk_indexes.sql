-- RA-4827 batch 4: add FK indexes for the 9 unindexed_foreign_keys advisor
-- warnings on the snake_case non-Prisma tables (customers / orders /
-- order_items / products / quotes / quote_items / users). These tables
-- are not in `prisma/schema.prisma` so the Prisma `@@index` route isn't
-- available — pure raw SQL.
--
-- Idempotent (CREATE INDEX IF NOT EXISTS). Environment-tolerant: each
-- statement wrapped in to_regclass() so envs without the table skip
-- silently.

DO $$
DECLARE
  pairs text[][] := ARRAY[
    ARRAY['customers',   'organization_id'],
    ARRAY['order_items', 'order_id'],
    ARRAY['order_items', 'product_id'],
    ARRAY['orders',      'organization_id'],
    ARRAY['products',    'organization_id'],
    ARRAY['quote_items', 'product_id'],
    ARRAY['quote_items', 'quote_id'],
    ARRAY['quotes',      'organization_id'],
    ARRAY['users',       'organization_id']
  ];
  pair text[];
  tbl text;
  col text;
  idx text;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    tbl := pair[1];
    col := pair[2];
    idx := tbl || '_' || col || '_idx';
    IF to_regclass('public.' || quote_ident(tbl)) IS NOT NULL THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)',
        idx, tbl, col
      );
    ELSE
      RAISE NOTICE 'RA-4827: skipped % — table missing in this env', idx;
    END IF;
  END LOOP;
END $$;
