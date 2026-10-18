# P0-1 — Private evidence & sketch buckets (Supabase)

Migration: `docs/ops/supabase-migrations-archive/20260717000000_p0_1_private_evidence_sketch_buckets.sql`

Makes `evidence-optimised` and `sketch-media` **private**; app serves via signed URLs (`lib/storage/sign-stored-url.ts`).

## Apply on production Supabase

1. Supabase Dashboard → SQL → run the migration file (idempotent), **or** link via Supabase CLI:
   ```bash
   supabase db push
   ```
2. Confirm buckets: Storage → `evidence-optimised`, `sketch-media` → **Public** = off.

## Acceptance (CI or manual)

With repo secrets for the target project:

```bash
npm run e2e:p0-1
```

GitHub workflow: `.github/workflows/p0-1-private-buckets.yml` (skipped without secrets — **not a pass**).

## Rollback note

Re-public buckets only if you accept evidence URL leakage; prefer fixing signed-URL paths in app code instead.
