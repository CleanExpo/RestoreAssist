# RA-4970 — Service-Role Audit (pre-RLS-migration gate)

**Date:** 2026-05-18
**Branch:** `release/sandbox-to-main-2026-05-16-final`
**Goal:** Confirm that enabling Row-Level Security on the 119 unprotected prod tables will NOT break RestoreAssist's runtime data-access paths.

## Verdict: 🟢 GREEN — RLS migration is safe to proceed

The 119-table anon-key exposure surfaced by the Supabase advisor exists at the **PostgREST anon endpoint** (the public REST API anyone with the `NEXT_PUBLIC_SUPABASE_ANON_KEY` can call from a browser DevTools console). RestoreAssist itself does **not** depend on anon-key table access, so enabling RLS on those tables closes the external exposure without breaking any internal code path.

## Audit findings

### 1. Two Supabase JS clients exist — segregated correctly

| File | Key used | RLS-bypass? | Use sites |
|---|---|---|---|
| `lib/supabase.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | NO (subject to RLS) | 1 file — `lib/sketch-storage.ts` |
| `lib/supabase-server.ts` | `SUPABASE_SERVICE_ROLE_KEY` | YES (bypasses RLS) | 11 files — see below |

### 2. The single anon-key consumer touches Storage, NOT tables

`lib/sketch-storage.ts` is the only file importing `supabase` (anon) from `lib/supabase.ts`. It calls:
- `supabase.storage.from("sketch-media").upload(...)`
- `supabase.storage.from("sketch-media").getPublicUrl(...)`
- `supabase.storage.from("sketch-media").remove(...)`

Zero `.from("<table>")` (table) calls. RLS on `public.*` tables does not affect `storage.objects` policies. The bucket has its own documented policies (auth-INSERT, auth-DELETE-own, public-SELECT) per the file header.

### 3. Zero client-side table reads/writes

`grep -rn "supabase\.from(" app --include='*.tsx'` returns **zero matches**. No browser/React component reads or writes tables via the Supabase JS client. All client data flows through Next.js API routes.

### 4. Server-side table access uses `getSupabaseServerClient()` (service-role) — verified across 11 files

```
app/api/inspections/[id]/handover/__tests__/route.test.ts
app/api/inspections/[id]/handover/route.ts
app/api/margot/schedules/route.ts
app/api/margot/telegram/recent/route.ts
lib/margot-image-gen.ts
lib/queue/__tests__/exportClosedJobToBYOKStorage.test.ts
lib/queue/__tests__/exportHandoverPackageToBYOKStorage.test.ts
lib/queue/exportClosedJobToBYOKStorage.ts
lib/queue/exportHandoverPackageToBYOKStorage.ts
lib/storage/supabase-provider.ts
lib/supabase-server.ts (definition)
```

All 11 use `SUPABASE_SERVICE_ROLE_KEY` → bypass RLS.

### 5. Primary write path is Prisma, not Supabase JS

Bulk of RA's data access (the 442 API routes, the cron jobs, the integration syncs) goes through Prisma using `DATABASE_URL` / `DIRECT_URL`. Supabase Postgres default convention: the `DATABASE_URL` connects as the `postgres` superuser, which **bypasses RLS by definition** (`BYPASSRLS` role attribute on `postgres`).

**Verify pre-prod:** confirm RA's actual `DATABASE_URL` user in Vercel env is either `postgres` (bypass) or a role explicitly granted `BYPASSRLS`. If it connects as `authenticator` / a custom non-bypass role, Prisma writes WILL respect RLS and breakage risk reappears. Action: `vercel env pull` → inspect the URL's user field. Most Supabase Vercel templates default to `postgres`; this is the expected case.

## What the migration must still do

Audit clears the way for the migration, but does not write it. The categorisation report at `.claude/aggregation/supabase/rls-categorisation.md` already buckets the 119 tables. The migration needs to:

1. For each bucket, write the policy template (workspace / organization / user / via-* chain / public-ref / service-only / special / investigate-first).
2. For **service-only** tables (34 of them): `ENABLE ROW LEVEL SECURITY` + **no policies for anon/authenticated**. The service-role JWT bypasses; anon gets blocked. This is the desired state.
3. For **public-ref** tables (12): `ENABLE ROW LEVEL SECURITY` + `FOR SELECT USING (true)` policy for anon. Read-only public reference data stays readable.
4. For **workspace / organization / user / via-*** tables: `ENABLE ROW LEVEL SECURITY` + the policy template from the categorisation report.
5. For the **5 investigate-first tables** (BusinessProfile, EquipmentDeployment, MoistureMeter, Room, RoomAnnotation): inspect via `mcp__claude_ai_Supabase__list_tables --verbose` to identify columns/FKs, then bucket or drop. **DO NOT enable RLS on these blind.**

## Next atomic unit

Investigate the 5 prod-only tables (`BusinessProfile`, `EquipmentDeployment`, `MoistureMeter`, `Room`, `RoomAnnotation`). They exist in `restoreassist-prod-2026` but not in `prisma/schema.prisma` or `supabase/migrations/`. Likely sources: Supabase dashboard edits, or an earlier schema since dropped from Prisma. Decision tree:

- If they have **zero rows AND zero foreign keys pointing at them** → drop them.
- If they have data OR FKs → bucket them per the categorisation rules + add them to `prisma/schema.prisma`.

After that → write the migration → sandbox apply → prod apply.

## Closes

- [x] `lib/supabase/server.ts` audit (file is at `lib/supabase-server.ts` — note the hyphen, not a slash)
- [x] 11 service-role caller verification
- [x] Confirmed zero client-side table writes
- [x] Confirmed sketch-storage is Storage-only
- [ ] Verify `DATABASE_URL` user in Vercel env is `postgres` (or `BYPASSRLS`) — single CLI command, not blocking the migration draft
- [ ] Investigate the 5 prod-only tables
- [ ] Write + apply migration

## Related artifacts

- `.claude/aggregation/supabase/rls-categorisation.md` — 119-table bucketing
- `.claude/aggregation/supabase/state.md` — original RLS finding
- Linear `RA-4970` — P0 ticket carrying the work
