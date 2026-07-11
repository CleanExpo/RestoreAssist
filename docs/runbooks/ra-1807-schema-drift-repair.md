---
type: runbook
name: ra-1807-schema-drift-repair
description: One-time repair for RA-1807 prod schema drift — backfill the tables/columns that `prisma migrate deploy` recorded as applied but never created.
severity: P0
owner: founder + DB operator (Rana)
---

# Runbook — RA-1807 Prod Schema Drift Repair (Option C)

One-time, additive repair to bring the **production** DB schema up to `prisma/schema.prisma`. Use after the root cause (below) is fixed, to backfill the ~37 tables + columns that were recorded in `_prisma_migrations` as applied but whose DDL silently no-op'd.

## Root cause (fix this FIRST — do not run the repair before it's fixed)

`prisma migrate deploy` DDL **silently no-ops against Supabase's transaction pooler** (port `6543`). `scripts/build.sh` sets `DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"` — so when `DIRECT_URL` is unset, migrate runs on the pooler and the tables are never created, while the migration row still records success.

**Precondition:** on the production host (**Vercel** — DigitalOcean App Platform was decommissioned in `85ea27d8`), `DIRECT_URL` must point at the Supabase **udooy direct connection on port `5432`** (NOT the `6543` pooler). Confirm this env var before proceeding. As of WS1 (RA-1807 remediation) `scripts/build.sh` **fails the build** when `DIRECT_URL` is unset / equal to `DATABASE_URL` / points at `:6543`, so a misconfigured host can no longer silently drift — but the env var must still be set correctly for the deploy (and this repair) to succeed.

## Who / gating

- **Read-only steps (1–3):** safe, run any time.
- **Apply step (4):** a **gated production DDL write** — founder-authorised, in a maintenance window, with a fresh backup. Do not run unattended.

## Prerequisites

- The prod **DIRECT** connection string (`:5432`), exported as `DIRECT_URL`. Never use the `:6543` pooler for this repair — DDL will no-op again.
- `psql` client + repo checkout with deps installed (`pnpm install`, `pnpm exec prisma generate`).

---

## Step 1 — Audit current drift (read-only)

Get the exact, current list of missing tables/columns:

```sh
DIRECT_URL="<prod :5432 direct url>" \
  DATABASE_URL="$DIRECT_URL" \
  npx tsx scripts/audit-prod-drift.ts
```

Save the output — it's the ground-truth list you'll reconcile against in Step 5.

## Step 2 — Generate the repair SQL (read-only)

`migrate diff` computes exactly what prod is missing versus the schema:

```sh
npx prisma migrate diff \
  --from-url "$DIRECT_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > ra1807-repair.sql
```

`--from-url` = current prod state, `--to-schema-datamodel` = desired schema → the script is the delta to apply to prod. Nothing is written to the DB yet.

## Step 3 — Review the SQL (mandatory human gate)

The repair must be **additive only** — `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`, `CREATE INDEX`, `ADD CONSTRAINT`, `CREATE EXTENSION` (pgvector).

```sh
grep -inE 'drop |truncate |delete ' ra1807-repair.sql
```

**If that finds anything, STOP.** `migrate diff` will emit `DROP` for objects that exist in prod but not in `schema.prisma` (legacy columns are "dormant drift" per `audit-prod-drift.ts`). Dropping them can destroy data. Hand-edit `ra1807-repair.sql` to remove every destructive statement — keep only the additive ones — or escalate before continuing. Confirm the ~37 audited tables appear as `CREATE TABLE`.

## Step 4 — Apply (GATED prod write — backup first)

1. **Take a fresh backup / PITR snapshot** of the prod DB (Supabase dashboard → Database → Backups, or `pg_dump`). Record the restore point.
2. Apply the reviewed SQL over the **direct `:5432`** connection, all-or-nothing:

```sh
psql "$DIRECT_URL" --single-transaction -v ON_ERROR_STOP=1 -f ra1807-repair.sql
```

`--single-transaction` + `ON_ERROR_STOP=1` means any error rolls the whole thing back — no partial apply. **Leave `_prisma_migrations` untouched** (Option C): its rows already say "applied," and going forward migrations apply correctly now that `DIRECT_URL` is the direct connection.

## Step 5 — Verify

```sh
# 1. Drift audit should now report zero missing.
DIRECT_URL="$DIRECT_URL" DATABASE_URL="$DIRECT_URL" npx tsx scripts/audit-prod-drift.ts   # expect: no missing

# 2. Build-pipeline drift check should pass.
DIRECT_URL="$DIRECT_URL" DATABASE_URL="$DIRECT_URL" node scripts/check-schema-drift.mjs    # expect: exit 0
```

Then smoke-test 2–3 features that were 500ing on the missing tables — e.g. Authority forms (`FormTemplate`), Voice notes (`VoiceNote`), LIDAR/floor plans (`LidarScan`/`FloorPlan`).

## Step 6 — Rollback

- A mid-apply failure auto-rolls back (single transaction) — no action needed beyond re-reviewing the SQL.
- A problem discovered **after** commit: restore from the Step-4 snapshot. Because the repair is additive, the practical blast radius is new empty tables/columns, but restore is the clean path if anything is off.

## After the repair

- Once merged, `scripts/build.sh` emits a warning if `DIRECT_URL` is on the pooler (RA-1807 pre-flight), and `check-schema-drift.mjs` hard-fails the build on any future drift — so this should not recur while `DIRECT_URL` stays on `:5432`.
- Unblocks **RA-1720** (Phase-5 cutover) and **RA-1757** (App Store submission), both of which assumed schema parity.
