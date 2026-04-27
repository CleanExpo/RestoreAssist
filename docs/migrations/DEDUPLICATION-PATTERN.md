# Migration deduplication — the correct pattern

*RA-1361: historical damage lesson codified so it doesn't repeat.*

## The failure that triggered this doc

The 2026-01-14 migration
`prisma/migrations/20260114153713_update_schema/migration.sql:741-751`
deduped the `Integration` table by:

```sql
DELETE FROM "Integration" WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY "userId","provider"
      ORDER BY id DESC
    ) rn
    FROM "Integration" WHERE "provider" IS NOT NULL
  ) ranked WHERE rn > 1
);
```

The author commented *"assuming cuid() generates sequential IDs"* — that
assumption is wrong. `cuid()` has a millisecond-resolution timestamp
prefix, but within the same millisecond (OAuth callback double-clicks,
race-y webhook handlers) order is arbitrary. The `id DESC` rank could
pick the row holding the stale token and delete the one with the
currently-valid `accessToken` / `refreshToken`, silently breaking the
user's Xero / QuickBooks sync without any error.

## The correct pattern

**Never `ORDER BY id` to pick "latest" for dedupe.** Use temporal
columns, with `id` only as the final tie-breaker:

```sql
-- GOOD — survives the same-ms creation case
SELECT id, ROW_NUMBER() OVER (
  PARTITION BY "userId","provider"
  ORDER BY "updatedAt" DESC NULLS LAST,
           "createdAt" DESC NULLS LAST,
           id DESC
) rn FROM ...
```

For schemas that don't have `updatedAt`, add one before dedupe:

```sql
ALTER TABLE "FooBar" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL
  DEFAULT CURRENT_TIMESTAMP;
-- Backfill from the timestamp inside the cuid if absolutely needed:
-- UPDATE "FooBar" SET "updatedAt" = to_timestamp(...) ;
```

## Forward-looking guardrail

Every migration that deletes rows based on dedupe logic must include
one of:

1. An explicit `ORDER BY <temporal> DESC` for the rank step, OR
2. A `RETURNING` clause that logs which rows got deleted to a
   `_migration_dedupe_log` table for manual rollback review.

See `migrations/20260421010000_ra_1360_invoice_external_sync_unique/`
for a reference implementation (uses `externalSyncedAt DESC` +
`updatedAt DESC` ranking).

## Why we can't retroactively fix Integration

The 2026-01-14 dedupe ran against production. Deleted rows are gone.
We can't tell which users had the active token deleted vs the stale
one kept — token values aren't logged. The correct remediation when a
user reports "Xero sync broken after Jan 14" is: re-run their OAuth
flow, which regenerates fresh tokens and overwrites whatever stale row
survived the dedupe.

A Pi-SEO watchdog should flag any Integration row where
`refreshTokenExpiresAt < now()` OR `updatedAt < 2026-01-14` so ops can
preemptively prompt re-auth. Track that as a separate ticket.
