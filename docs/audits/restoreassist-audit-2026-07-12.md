# RestoreAssist audit — 2026-07-12

Read-only repo⇄prod audit (14-agent parallel sweep) of RestoreAssist at `origin/main` `6437dd7c`
against live prod Supabase `udooysjajglluvuxkijp` (219 public tables, 208 Prisma models, 229
ledger rows, RLS enabled on all tables). Same playbook as the Synthex parity audit. Nothing was
written; all prod queries read-only.

**Bottom line:** security posture is good (no anon-write surface, full RLS, SECURITY DEFINER
functions hardened) — materially cleaner than Synthex. The real work is (1) three founder-gated P0s,
(2) live RA-1807 schema drift with its root cause still present, and (3) a large but low-urgency
performance + hygiene backlog.

## P0 — three known escalations, all code-merged but founder-gated (0 of 3 resolved)

1. **RA-6678 — ABR onboarding is provably dead in prod.** The CONFIG_ERROR/MALFORMED code split is
   live (`lib/integrations/abr/client.ts:6,10`), but prod shows **0 successful ABR lookups ever**
   (`AbnLookupCache` empty), 0 READY hydration jobs, 8 orphaned RUNNING + 13 ERROR. Blocked on the
   founder setting `ABR_API_GUID` (+ `ABR_BASE_URL`) in prod env. **Caveat:** the 13 errors are
   `MALFORMED`, not `CONFIG_ERROR`, so the data can't itself prove the GUID is unset — the founder
   verification must run one known-valid ABN and read the result (CONFIG_ERROR ⇒ unset; MALFORMED ⇒
   wrong value/ABR down; READY ⇒ fixed).
2. **RA-1807 — schema-drift repair is docs-only; root cause still live.** Commit `113a8906`/PR #1889
   added only a runbook; the gated prod DDL apply has not run, and `scripts/build.sh:11` still does
   `DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"` — the exact pooler-fallback that silently no-ops
   `migrate deploy` DDL. Table-level drift looks largely resolved (all runbook smoke-test tables
   exist), but column-level zero-drift was never verified live.
3. **RA-6688 — release gate cannot reach go-live.** Evidence scaffolding merged (PR #1887), but
   D1/D3/E1/E2/F1 are all `status:deferred`, no `release-gate-report.json` exists, and the gate's
   "no open P0/P1" rule is violated by RA-6678 + RA-1807.

## P1 — highest-value fixes I can build

- **RA-1807 root cause not eliminated.** `build.sh:11`'s DIRECT_URL→DATABASE_URL fallback should
  **fail the build** (not warn) when DIRECT_URL resolves to the pooler / `:6543`, so drift can't recur
  on deploy. Currently only mitigated by a non-fatal warning + a scalar-only drift gate.
- **6 tables RLS-enabled with ZERO policies (deny-all silent-write risk).** `ClientCommsLog`,
  `DrNrpgWebhookEvent`, `FeatureEntitlement`, `RestorationIncident`, `StorageRestoreJob`,
  `SupportTicketReply`. Same shape as Synthex `auth_events`: secure against exposure, but any
  browser/authenticated-key write to these fails **silently**. Confirm each is service-role-only; add
  tenant-scoped policies where client writes are intended.
- **380 `auth_rls_initplan` warnings across 182 tables (performance).** RLS predicates call
  `auth.*()` per-row instead of once. Fix pattern: wrap in a scalar subselect —
  `USING (user_id = (select auth.uid()))`. A scripted migration across the 182 tables; the single most
  material scale finding.

## Live RA-1807 drift — the specific broken constraints (blocking, from schema parity)

Partial migrations left prod out of sync in ways that break features today:

- **`Integration`** — prod kept BOTH the old `(userId, provider)` unique AND the new
  `(userId, workspaceId, provider)`; the DROP of the old narrow unique never applied → a user still
  can't connect the same provider (e.g. Xero) to two workspaces, defeating RA-1226.
- **`EnvironmentalData`** — prod still has `UNIQUE (inspectionId)`; the schema removed it to make the
  table a time-series → a 2nd reading per inspection fails on the stale unique constraint.
- **`XeroAccountCodeMapping`** — prod has a `userId` column that is **NOT NULL, no default** and is
  absent from the Prisma model → any Prisma `.create()` (which can't know about it) raises a NOT NULL
  violation. `category` is also NOT NULL in prod vs nullable in schema.

## Orphans + co-tenancy (governance)

The 219-vs-208 delta is fully explained: 1 ledger + **10 foreign-module tables belonging to a sibling
Unite-Group CRM/commerce module co-tenanted in RA's Supabase project** (`customers`, `orders`,
`products`, `quotes`, `order_items`, `quote_items`, `organizations`, `users`, `profiles`, `audit_logs`).
Six hold seeded rows; zero RestoreAssist code touches any of them. **P2 residual:** `organizations`
carries an always-true `authenticated` SELECT policy (`qual=true`) the June commerce remediation
missed — drop it (default-deny) or scope it. Broader question for the owner: should another product's
customer data live in RA's prod project at all?

## P2 / hygiene (batchable enhancements)

- Ledger: 28 rows have no repo migration folder (history not reproducible from the tree); 58 rows have
  `applied_steps_count=0` (the drift-injection vector); duplicate/rolled-back `voice_copilot` cluster.
- Drift gate coverage hole: `check-schema-drift.mjs` diffs only scalar columns — a no-op'd
  enum/index/constraint migration passes undetected (exactly the recent enum/index migrations).
- Advisors: 4 unindexed FKs, no PK on `VerificationToken`, duplicate index on `MediaAsset`, pgvector in
  `public` schema, leaked-password protection disabled (dashboard toggle).
- Repo hygiene: tracked `.DS_Store`×3 + `supabase/.temp/cli-latest` (gitignored-but-tracked), ~12 stale
  root reports, completed one-shot drift/ASC/cloudinary scripts, `vendor/opensrc` (234KB unused dev
  tree), 104-file `scripts/` grab-bag (only ~14 wired).

## Founder / owner action queue

1. RA-6678: set `ABR_API_GUID` (+ `ABR_BASE_URL`) in prod, redeploy, verify one known-valid ABN.
2. RA-1807: set `DIRECT_URL`→`udooy` `:5432` on the prod host, then run the repair runbook Steps 1–5.
3. RA-6688: attach D1/D3/E1/E2/F1 evidence, create the 3 Vercel alert rules, run the gate scorer.
4. Enable leaked-password protection (Auth settings).
5. Decide the sibling-CRM co-tenancy question (`organizations` policy + whether that data belongs here).

## Not a security exposure (positive controls)
No anon write policies; no unrestricted `WITH CHECK(true)`; both SECURITY DEFINER functions pin
`search_path`; correct live project confirmed (`udooysjajglluvuxkijp`, not the empty legacy ref).
