# Deferred: investigate `42703: column "roomId" does not exist`

**Phill hit this 2026-05-18, second occurrence.** First was during PR #1139's CI Quality Checks run; that's fixed by the `DO $$ ... END $$` gate just pushed on `cff3593e`. This second occurrence happened while Supabase MCP was down, so I can't query prod from here to verify the env.

## What we know from earlier this session (verified)

- `pg_attribute` on `udooysjajglluvuxkijp` showed `roomId` exists as `text` on `AffectedArea`, `ScopeItem`, `InspectionPhoto`
- `pg_indexes` on `udooysjajglluvuxkijp` showed `AffectedArea_roomId_idx`, `ScopeItem_roomId_idx`, `InspectionPhoto_roomId_idx` all created when batch 1 was applied via MCP

So **prod is fine**. The error is from an env without the column.

## Most likely sources of the new error

1. **Phill ran the original (un-gated) migration SQL in a non-prod env** — sandbox project, dev DB, or a manual paste into the Supabase SQL editor pointed at a different project.
2. **A Vercel build hit it on a fresh shadow DB** before the `cff3593e` push propagated.

## When Supabase MCP is back

Run this on each candidate project to confirm where the column does/doesn't exist:

```sql
SELECT
  c.relname AS table_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name=c.relname AND column_name='roomId'
  ) AS has_roomId_column,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname = c.relname || '_roomId_idx'
  ) AS has_roomId_index
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND c.relname IN ('AffectedArea','ScopeItem','InspectionPhoto')
ORDER BY c.relname;
```

Expected on `udooysjajglluvuxkijp` (prod): all three rows show `true, true`.
Expected on sandbox / fresh shadow: all three rows show `false, false` after the `cff3593e` fix lands.
