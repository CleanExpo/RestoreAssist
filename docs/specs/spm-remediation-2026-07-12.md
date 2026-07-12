# SPM spec — RestoreAssist remediation (2026-07-12)

> Decision-grade specification produced by `/spm`. Read-only inputs; this file authorises no
> write on its own. Source audit: `docs/audits/restoreassist-audit-2026-07-12.md` (14-agent
> parallel sweep). Repo `CleanExpo/RestoreAssist` @ `origin/main 6437dd7c`. Prod Supabase LIVE
> `udooysjajglluvuxkijp`. This is a **REDUCE-SCOPE** remediation: security posture is already
> good (all tables RLS-on, no anon-write surface, both SECURITY DEFINER functions pin
> `search_path`). leveling_version 1.0, board_version 1.0, Tier **T3**.

---

## 1 Task

Remediate the findings of the 2026-07-12 RestoreAssist audit down to a buildable, release-gated
set of workstreams. Concretely: eliminate the **RA-1807 schema-drift root cause** in the build
pipeline, author (but do not autonomously apply) the **destructive drift-repair migration** for
the three broken prod constraints, **extend the drift gate** so a no-op'd index/constraint/enum
migration can never pass undetected again, add a **forward CI guardrail** against RLS-InitPlan
regression, and **document the 6 deny-all tables** as intentional service-role-only. Everything
that touches prod state (`WS0` env batch, `WS2` DDL apply) is a **founder gate**, not an
autonomous step. The 380-policy RLS mass-rewrite, the co-tenancy question, and repo hygiene are
explicitly de-scoped out of the release-blocking core into separate non-gating follow-ups.

## 2 Project context

- **Product.** RestoreAssist — restoration-industry field/inspection SaaS. Second product to run
  the audit → spec → remediate playbook after Synthex.
- **Repo.** `D:\RestoreAssist`, `CleanExpo/RestoreAssist`, `origin/main 6437dd7c`. Local `tsc`
  is RED because `prisma:generate` fails on this box with a TLS cert error — verification is
  **per-file / live-SQL**, never whole-repo `tsc` (see §13, must_fix `j3`).
- **Prod.** Supabase `udooysjajglluvuxkijp` (219 public tables, 208 Prisma models, 229 ledger
  rows, RLS enabled on all tables). Confirmed the correct live project, not the empty legacy ref.
- **Deploy target.** **Vercel-only** (`.claude/WORKFLOWS.md:50-55`, `restoreassist.app` on the
  `unite-group/restoreassist` project). DigitalOcean was decommissioned in commit `85ea27d8`
  (`.do/app.yaml` + the DO workflow deleted) — build/runbook DO narration is now stale (ops
  must_fix `o1`).
- **Standing posture.** RestoreAssist is materially cleaner than Synthex: no anon-write, full
  RLS, hardened SECURITY DEFINER. The real work is drift + a low-urgency perf/hygiene backlog.

## 3 Problem statement

Four live problem clusters, in priority order:

1. **RA-1807 drift root cause is still resident in the build.** `scripts/build.sh:11` runs
   `export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"`; when `DIRECT_URL` is unset (or is the
   `:6543` transaction pooler) `prisma migrate deploy` DDL **silently no-ops** while the ledger
   marks the row finished. `build.sh:29-31` only *warns*; it does not fail the build. Result: 58
   ledger rows carry `applied_steps_count=0` and three constraints are broken in prod today.
2. **Three prod constraints break features now.** From live schema-parity (audit §"Live RA-1807
   drift"): `Integration` kept BOTH the old `(userId, provider)` unique AND the new
   `(userId, workspaceId, provider)` (defeats RA-1226 multi-workspace connect);
   `EnvironmentalData` still has `UNIQUE (inspectionId)` (blocks a 2nd time-series reading,
   contradicting the `schema.prisma:2263-2265` intent); `XeroAccountCodeMapping` has a prod-only
   `userId` NOT NULL/no-default column absent from the model (`schema.prisma:1324-1327`) plus
   `category` NOT NULL in prod vs nullable in schema — any Prisma `.create()` raises a NOT NULL
   violation. A **fourth**, undocumented prod unique `XeroAccountCodeMapping_userId_category_damageType_key`
   exists in neither the schema nor RA-6996 (data must_fix `d2`).
3. **The drift gate cannot see the bugs it needs to.** `scripts/check-schema-drift.mjs:9-13,14-17`
   diffs only *scalar columns*; it is blind to indexes, unique constraints, enums, and
   nullability — i.e. blind to all three live drift bugs.
4. **RLS-InitPlan regression has already recurred once.** RA-4827
   (`supabase/migrations/20260518100000_ra_4827_auth_rls_initplan_batch.sql`) drove
   `auth_rls_initplan` to 0; RA-4956 (`supabase/migrations/20260614000000_ra_4956_tenant_scoped_rls_policies.sql`,
   2026-06-14) reintroduced 27 unwrapped `auth.uid()` across 24 new policies. Live advisor now
   reports **380** `auth_rls_initplan` WARN / 0 ERROR across 182 tables. There is no forward
   guard preventing the *next* regression.

Two governance residuals (not release-blocking): 6 RLS-on/zero-policy deny-all tables whose
service-role-only intent is undocumented, and 10 sibling-CRM co-tenant tables + an always-true
`organizations` SELECT policy that belong to another product's owner.

## 4 Desired outcome

- The build **fails closed** on a pooler/`:6543` `DIRECT_URL` before it can no-op DDL again.
- The three (buildable) drift constraints are corrected by a **hand-authored, single-transaction,
  duplicate-guarded** migration whose APPLY is founder-gated, proven on a branch first, and
  verified in prod by **live readback** — never by the ledger.
- The drift gate **fails** on a fixture reproducing today's prod and **passes** post-repair, and
  now covers unique indexes + table constraints + column nullability.
- A CI lint **rejects any new `CREATE POLICY`** with a bare `auth.*()` predicate — the cheap,
  high-value recurrence fix.
- The 6 deny-all tables are **documented and asserted** service-role-only; no policy is added.
- Everything prod-mutating is executed only in the **two founder sessions** (A: Vercel env batch;
  B: gated DDL apply). No autonomous step ever holds the prod `:5432` write credential.

## 5 Scope

### IN (release-blocking core — buildable this run)

- **WS1** build.sh fail-closed (+ strip DO narration).
- **WS2** drift-repair migration (author + branch-prove; APPLY founder-gated).
- **WS3** extend `check-schema-drift.mjs` to indexes/constraints/nullability (prerequisite).
- **WS4** CI lint against bare-`auth.*()` new policies.
- **WS5** deny-all documentation + guard test (no prod change).

### IN but FOUNDER-GATED (not autonomous)

- **WS0 / Session A** Vercel Production env batch + one redeploy + read-only verify.
- **WS2 apply / Session B** gated DDL apply via the RA-1807 runbook Step 4.
- `XeroAccountCodeMapping.userId` DROP — documented recommendation, carved OUT of the autonomous
  migration file (must_fix `a3`, `j2`).

### OUT (spec'd, explicitly NON-blocking follow-ups)

- **WS6** 380-policy `auth_rls_initplan` one-time rewrite — deferred behind a measured trigger.
- **WS7** `organizations` always-true policy + 10 co-tenant CRM tables — **owner decision**, not a
  build (must_fix `s6`).
- **WS8** repo hygiene (`.DS_Store`, stale reports, one-shot scripts, unindexed FKs, etc.) —
  separate janitorial PR. `pgvector public→schema` move deferred to its own spec.
- Re-emitting the RA-1807 / RA-6688 / RA-6678 handoffs — those artifacts already exist (runbook
  #1889, scaffolding #1887, code merged); scope is the **new** artifacts only (must_fix `j6`).

## 6 Existing capability review

Before proposing new work, the board inventoried what already exists so we build the delta, not a
re-package (must_fix `j6`):

| Capability | Exists as | Gap this spec closes |
|---|---|---|
| Drift smoke test | `scripts/check-schema-drift.mjs` (scalar-only, `:9-13`) | Blind to index/constraint/nullability → WS3 extends it |
| Build pipeline gate | `scripts/build.sh:29-31` (warn-only) | Warns instead of failing → WS1 `exit 1` |
| RA-1807 repair procedure | `docs/runbooks/ra-1807-schema-drift-repair.md` (Step 4 gated, PITR + single-txn + `ON_ERROR_STOP`) | Runbook is additive-only, STOPs on DROP → WS2 authors the destructive migration it can't (`q1`) |
| RLS coverage audit | `scripts/audit-rls-coverage.ts` (anchor families + `SERVICE_ONLY` set) | Deny-all tables not in `SERVICE_ONLY` → WS5 extends set |
| Prior InitPlan fix | `supabase/migrations/…_ra_4827_…batch.sql` | One-shot; no forward guard → WS4 lint |
| RLS test harness | `test/rls/run.sh` (localhost-only; refuses managed/pooler hosts) | The prod-impossibility guard for §13 (ii) |
| Dedup discipline | `docs/migrations/DEDUPLICATION-PATTERN.md` | "Don't guess ledger order" → we do NOT backfill 28 rows (`d6`) |

Conclusion: no new subsystem is warranted. Every workstream is an extension of, or a guard around,
existing tooling.

## 7 Specialist board receipt

- **Tier T3.** Axes F2 I2 N1 X2 S2, sum 9; I=2 and S=2 auto-promote. leveling_version 1.0,
  board_version 1.0. No project board override; no operator pin. NEXUS wrapper applied,
  Delegation + Memory stripped.
- **6 seats convened in parallel** (requested model tiers, all returned `needs-work`):
  - architect — Opus, 0.80
  - security-reviewer — Opus, 0.86
  - qa-verification-lead — Opus, 0.80
  - devils-advocate-judge — Opus, 0.82, **score 58/100 REDUCE SCOPE**
  - domain-specialist/data — Sonnet, 0.83, **escalate=true** (Xero founder-gate)
  - ops-cost-realist — Sonnet, 0.80
- **`verdict_split = 0.00`** (6/6 needs-work — unanimous criticism). **`fix_overlap` high-canonical**:
  all seats converge on sequencing, verify-by-readback, RLS-scope-carefully-or-defer,
  Xero-founder-gated, deny-all-keep-default-deny, co-tenancy-defer, extend-drift-gate.
- **Ramp.** Unanimous-criticism ⇒ fold ALL `must_fix`, no round 2. No security fail ≥ 0.8 ⇒ no
  hard floor.
- **Adversarial verify pass: DONE** (non-author Opus, post-draft against this document). Returned
  **2 blocking + 1 minor** findings, all folded: **AV-1** — the WS4 RLS lint must scan BOTH
  `prisma/migrations/**` and `supabase/migrations/**` (verified live: `CREATE POLICY` in 7 prisma +
  9 supabase files, incl. 5 prisma-only RLS files) → §9 / §11 / AC-16 / §14; **AV-2** — the WS3
  gate must assert per-object + bidirectional (extra-in-DB) detection, not an aggregate FAIL that
  the `category` mismatch alone satisfies → §11 / §14 / AC-15; **AV-3 (minor)** — §10 over-claimed
  the Xero `.create()` fix (only `category` clears autonomously; `userId` persists behind the
  founder gate). No finding invalidated the REDUCE-SCOPE structure.

## 8 Judge challenge

The devil's-advocate judge scored the **pre-fold** shape **58/100 — REDUCE SCOPE**. Its six
challenges (`j1`–`j6`) are all folded into this spec:

- **`j1` — CUT the RLS mass-rewrite from the release-blocking core.** Live table sizes prove only
  `IicrcChunk` (~40k RAG-ref) and `CronJobRun` (~22k log) are large; every per-tenant table is
  < 100 rows. A 380-policy rewrite on a customer-facing app risks data exposure for a perf win no
  user can feel. → **WS6, deferred, non-gating.** The forward guardrail (WS4) is the real value.
- **`j2` — separate founder-gated from buildable.** Drift-repair APPLY is `DIRECT_URL`-gated; the
  Xero `userId` DROP is RA-6996-deferred. → carved out of the autonomous file.
- **`j3` — verification must be live-SQL, not ledger/`tsc`.** RA local `tsc` is RED
  (`prisma:generate` TLS on this box). → §13 uses live SQL + harness EXPLAIN + branch row-counts.
- **`j4` — branch-prove the DROP-uniques before prod.** → §13 (iii) Supabase branch, WS2 gate.
- **`j5` — demote hygiene to a SEPARATE janitorial PR** (zero user outcome, must not share a
  branch with RLS/constraint changes). → **WS8.**
- **`j6` — the "3-P0 founder runbook" is largely re-packaging** (RA-1807 runbook #1889, RA-6688
  scaffolding #1887, RA-6678 code merged). Scope to the NEW artifacts only. → §6 + §5 OUT.

## 9 Proposed solution (workstreams)

All `must_fix` codes reference the originating seat (A=architect, S=security, Q=qa, J=judge,
D=data, O=ops).

**WS0 — FOUNDER, Session A (Vercel Production env; ~15 min, one redeploy).** Batch all env writes
into one session (O `o4`): `ABR_API_GUID` + `ABR_BASE_URL` (RA-6678); `DIRECT_URL` → `udooy`
`:5432` (RA-1807 root cause, A `a2`, D `d4`); 3 RA-6688 Vercel alert rules; Supabase
leaked-password toggle (owner console). One redeploy → engineer **read-only** verify:
`scripts/audit-prod-drift.ts` / `check-schema-drift.mjs` clean, plus one known-valid ABN lookup
producing a READY hydration job + an `AbnLookupCache` row (the RA-6678 caveat — the 13 MALFORMED
errors can't themselves prove the GUID is unset; audit §P0.1).

**WS1 — BUILD (`scripts/build.sh`).** Replace the `build.sh:30` WARNING echo with `exit 1` inside
the `VERCEL_ENV=production` else block (`build.sh:19-38`), asserting `DIRECT_URL` resolves to a
direct `:5432` host — **not** `:6543`, **not** equal to `DATABASE_URL` — before
`prisma migrate deploy` (`build.sh:32`). Strike the DO narration from `build.sh:1-8,23-26` and
`docs/runbooks/ra-1807-schema-drift-repair.md` (O `o1`). **Sequencing invariant (A `a1`, `a2`,
O `o2`):** this fail-close must land **after / atomic-with** WS0's `DIRECT_URL` fix, or the next
prod deploy bricks. The `preview|development` and local-no-`DATABASE_URL` branches already skip
migrate (`build.sh:16-21`) and are safe (O `o2`).

**WS2 — BUILD (`prisma/migrations/`); APPLY founder-gated Session B.** One hand-authored,
single-transaction, `ON_ERROR_STOP` drift-repair migration, paired with `schema.prisma` edits so
`check-schema-drift.mjs` stays green:

- `DROP INDEX IF EXISTS "Integration_userId_provider_key"` (D `d1` — it is an INDEX, not a
  constraint; `ALTER TABLE … DROP CONSTRAINT` errors `42704`).
- `DROP INDEX IF EXISTS "EnvironmentalData_inspectionId_key"` (D `d1`).
- `DROP INDEX IF EXISTS "XeroAccountCodeMapping_userId_category_damageType_key"` (the hidden 4th
  unique; D `d2`).
- `ALTER TABLE "XeroAccountCodeMapping" ALTER COLUMN "category" DROP NOT NULL`.

Each DROP is preceded by an embedded `HAVING count(*) > 1` duplicate-guard assertion. The
`XeroAccountCodeMapping.userId` DROP is a **FOUNDER-GATED CARVE-OUT** — documented recommendation
is DROP (empty table, `integrationId`-keyed) but it is **not** in the autonomous file (A `a3`,
D escalate). This migration is **destructive** and therefore a separate hand-authored file with
its own gate — the RA-1807 runbook is additive-only and would STOP on the DROP (Q `q1`).
Post-apply verify is **live-SQL** (`pg_indexes` / `information_schema.columns`), never the ledger
(A `a4`, J `j3`). Functional post-checks: a 2nd `EnvironmentalData` reading per `inspectionId`
succeeds; the same provider connects to a 2nd workspace.

**WS3 — BUILD, PREREQUISITE (`scripts/check-schema-drift.mjs`).** Extend the scalar-only diff
(`:9-13`) to also diff unique indexes (`pg_indexes`), table constraints
(`information_schema.table_constraints`), and column nullability. It must emit a **per-object,
bidirectional (extra-in-DB) FAIL** on a fixture reproducing current stale-constraint prod and
**PASS** post-repair (Q `q3`, O `o3`, AV-2). This is a prerequisite, not hygiene: without it WS2's
paired schema edit could itself silently drift.

**WS4 — BUILD, cheap/high-value (CI lint).** A repo/CI check that rejects any new `CREATE POLICY`
whose predicate calls bare `auth.*()` instead of `(select auth.*())`. It must scan **BOTH**
migration roots — `prisma/migrations/**` AND `supabase/migrations/**` — because `CREATE POLICY`
demonstrably lives in both (RA-4956 is mirrored across the two, and 5 workspace/evidence/media RLS
files exist *only* under `prisma/migrations/`); a lint scoped to `supabase/migrations/` alone would
miss a prisma-only regression (adversarial-verify AV-1). This is the true recurrence fix for the
RA-4827 → RA-4956 regression (D `d3`) and is where the judge (`j1`) locates the value.

**WS5 — BUILD, docs/guard only (NO prod change).** Document the 6 deny-all tables (`ClientCommsLog`,
`DrNrpgWebhookEvent`, `FeatureEntitlement`, `RestorationIncident`, `StorageRestoreJob`,
`SupportTicketReply`) as intentional service-role-only, extending the `SERVICE_ONLY` set in
`scripts/audit-rls-coverage.ts` (per RA-6917/6949/6922). Add a test asserting no
authenticated `supabase-js` write path targets them. **Keep default-deny; add NO policies** — all
writes go through the Prisma owner connection which bypasses RLS, and the anon `supabase-js` key
is storage-only (S `s5`).

**WS6 — DEFERRED, non-gating (`supabase/migrations/`).** The 380-policy `auth_rls_initplan`
one-time rewrite: in-place `ALTER POLICY` (never DROP+CREATE), wrapping **only** zero-arg `auth.*`
(`uid`/`role`/`jwt`/`email`) — **never** `is_workspace_owner`/`is_workspace_member` (S `s1`).
Skip the 46 already-wrapped policies (S `s2`). Target list generated from the **live advisor**
(exactly 380), not a hardcoded number (D `d5` — a grep found 426/194, over/under-fix risk).
Gated by the semantic-equivalence proof in §12. Spec'd but explicitly **not** release-blocking.

**WS7 — ESCALATE, owner decision (not a build).** The `organizations` always-true SELECT policy
(`qual=true`) is a real cross-tenant leak, but its removal — and whether the 10 sibling-CRM
tables belong in RA's project at all — is the sibling-CRM owner's call. Do **not** bundle a
unilateral drop (S `s6`). This spec asserts only: no new RA code depends on the 10 foreign tables,
backed by a regression check.

**WS8 — SEPARATE janitorial PR, non-blocking.** Repo hygiene: `git rm` tracked `.DS_Store`×3 +
`supabase/.temp/cli-latest`; stale root reports → `docs/archive`; one-shot drift/ASC/cloudinary
scripts → `scripts/ops-archive`; `vendor/opensrc` keep/kill; 4 unindexed FKs; `VerificationToken`
PK; `MediaAsset` duplicate index; document the prisma-vs-supabase migration boundary. `pgvector
public→schema` move DEFERRED to its own spec (high-risk, breaks embedding search). Leaked-password
is an owner console toggle (an acceptance checkbox in WS0, not a code deliverable).

## 10 UX

This remediation is **infrastructure-facing**; there is no end-user UI surface. The relevant "UX"
is developer + founder experience:

- **Founder UX.** Collapse all prod touches to **2 sessions** (O `o4`): Session A ≈ 15 min (env
  batch + one redeploy + read-only verify), Session B ≈ 30–45 min (gated DDL apply after A is
  verified). Cut the dead "confirm Vercel vs DO with Rana" step — deploy target is settled
  Vercel-only (O `o1`).
- **Developer UX.** A failed build now prints an actionable message ("`DIRECT_URL` points at the
  `:6543` pooler — set the direct `:5432` connection, RA-1807") instead of a warning that scrolls
  past. The WS4 lint fails a PR with the exact offending policy name and the `(select …)` fix.
- **Restoration-user outcome (indirect).** After WS2 apply: a 2nd environmental reading per
  inspection saves (time-series restored); the same integration provider connects to a 2nd
  workspace (RA-1226 restored); Xero mapping `.create()` stops raising the **`category`** NOT NULL
  violation. The **`userId`** NOT NULL violation **persists** until the founder-gated
  `XeroAccountCodeMapping.userId` DROP (carved out of WS2 — §5 / AC-7), so `.create()` is not fully
  unblocked by the autonomous run alone (adversarial-verify AV-3).

## 11 Technical design

- **Build gate (WS1).** POSIX `sh`. In the production else block (`build.sh:19-38`), before
  `prisma migrate deploy`: resolve `DIRECT_URL`; if empty, `== $DATABASE_URL`, or matches `:6543`
  → `echo` diagnostic + `exit 1`. `set -e` (`build.sh:9`) already aborts on any failure below.
  Vercel is the only host that reaches this block (`VERCEL_ENV=production`).
- **Drift-repair migration (WS2).** Single `BEGIN … COMMIT` with `ON_ERROR_STOP` (mirrors runbook
  Step 4's PITR + single-txn + `ON_ERROR_STOP`). Each DROP guarded by a preceding
  `DO $$ BEGIN IF (SELECT count(*) … GROUP BY … HAVING count(*) > 1) THEN RAISE …` so a real
  duplicate aborts instead of silently losing data. `DROP INDEX IF EXISTS` (not
  `ALTER TABLE DROP CONSTRAINT`) because these are indexes (D `d1`). Paired `schema.prisma` edits
  keep WS3 green.
- **Drift gate extension (WS3).** Add three comparators to `check-schema-drift.mjs`: unique
  indexes via `pg_indexes`, constraints via `information_schema.table_constraints`, nullability
  via `information_schema.columns.is_nullable`. Each comparator must be **bidirectional** — report
  an object present in the DB but absent from the schema (extra-in-DB), not only a schema object
  missing from the DB; all three live drift bugs are *extra-in-DB* uniques, so a one-directional
  (schema→DB) diff would miss them. Each drift object is reported on its **own** failure line so a
  fixture can assert per-object detection (§15 AC-15). Same `DIRECT_URL`→`DATABASE_URL` read
  pattern the script already uses (`check-schema-drift.mjs:17`) — note this pattern is itself why
  the pooler fallback must be fixed (WS0/WS1) for the gate to read the right host.
- **RLS lint (WS4).** Static scan of new/changed `CREATE POLICY` statements across **BOTH**
  `prisma/migrations/**` AND `supabase/migrations/**` (the RA-4956 regression is present in both
  roots, and `prisma/migrations/` carries RLS files with no supabase mirror); regex require
  `(select auth.` wherever a zero-arg `auth.*()` appears in a predicate. Runs in CI; fails on a
  bad-policy fixture in **either** root (§14).
- **Deny-all guard (WS5).** Extend `SERVICE_ONLY` in `scripts/audit-rls-coverage.ts`; add a test
  that greps the app's `supabase-js` (anon/authenticated) call sites and asserts none write the 6
  tables.
- **RLS rewrite (WS6, deferred).** In-place `ALTER POLICY` preserving `cmd` / `permissive` /
  `roles` (143 public vs 302 authenticated) / BOTH `qual` and `with_check` (S `s3`). Global
  per-predicate regex wrapping zero-arg `auth.*` only. Target list from `get_advisors(perf)`.
- **Ledger.** Do **not** backfill the 28 no-repo-folder rows (`DEDUPLICATION-PATTERN.md`, D `d6`).
  The 58 `applied_steps_count=0` rows are diagnostic evidence of the no-op vector, not something to
  rewrite.

## 12 Security

- **Deny-all tables stay default-deny (S `s5`).** The 6 RLS-on/zero-policy tables are secure
  against exposure today; adding tenant policies would *open* a write path. All legitimate writes
  are Prisma owner-connection (bypasses RLS); the anon `supabase-js` key is storage-only. WS5 adds
  documentation + a guard test, **no policy**.
- **RLS rewrite must not corrupt policies (S `s1`, `s4`).** WS6 wraps ONLY zero-arg `auth.*`; a
  naive "wrap any fn" regex would corrupt every workspace policy that passes a per-row column arg
  to `is_workspace_owner`/`is_workspace_member`. The **semantic-equivalence gate** is mandatory:
  snapshot `pg_policies` before; after, regexp-unwrap the new predicate and assert BYTE-IDENTICAL
  `qual`/`with_check`, identical `cmd`/`roles`/`permissive`, identical policy set, advisor
  before/after, plus a tenant-isolation behavioural suite per anchor family. An InitPlan firing in
  EXPLAIN is **not** proof of equivalence.
- **`organizations` always-true policy is a real leak — but not ours to drop (S `s6`).** Removal
  is the sibling-CRM owner's call; escalate (WS7), do not bundle a unilateral drop.
- **Forward guardrail is the security win (D `d3`).** WS4 prevents the RA-4956-style reintroduction
  of unwrapped predicates in new policies — cheap, high-value, and the reason the mass-rewrite can
  safely defer.
- **Positive controls preserved (audit §"Not a security exposure").** No anon write policies; no
  unrestricted `WITH CHECK(true)`; both SECURITY DEFINER functions pin `search_path`. Nothing in
  this spec regresses those.
- **Credential isolation (Q `q4`).** No autonomous step holds the prod `:5432` write credential.
  All prod writes are the two founder sessions.

## 13 Verification plan

Sandbox-policy T3 — four environments, each producing a distinct proof class:

- **(i) unit / lint = repo / CI, no DB** → `{proven}`. WS1 shell assertion, WS3 gate on a fixture,
  WS4 lint on a fixture, WS5 guard test.
- **(ii) localhost postgres harness `test/rls/` (`run.sh` refuses managed/pooler hosts — the
  prod-impossibility guard)** → `{proven}`. EXPLAIN **InitPlan-shape** proofs with a **negative
  control** (pre-rewrite plan shows per-row `auth.uid()`); empty tables prove nothing (Q `q4`).
- **(iii) Supabase branch via `create_branch` (`confirm_cost`-gated, create-then-delete same
  session)** → `{proven-on-branch}`. Migration-applies-cleanly + **SEEDED** row-count equivalence.
  Optional per runbook (O `o6`) since read-only runbook Steps 1–3 already validate additive-only.
- **(iv) prod READ-ONLY via MCP** → object re-verification only (`pg_indexes`, `pg_policies`,
  `get_advisors`, `information_schema.columns`).
- **ALL prod WRITES = founder gate (Sessions A/B)** → `{proven-after-founder-gate}`. This is the
  honest ceiling: WS0 and the WS2 apply are only reachable via the founder, and are the sole way
  to prove *prod* is fixed (Q `q2` — `{proven-on-branch}` ≠ `{proven-after-founder-gate}`).
- **Never** verify by the ledger (`finished_at` is set on no-ops) or by whole-repo `tsc` (RED on
  this box; verify per-file). Independent readback only (A `a4`, J `j3`).

## 14 Loop & stress testing

- **Idempotency.** Re-run each migration twice on the branch; the 2nd run is a no-op
  (`DROP INDEX IF EXISTS` + guarded). Re-running WS1 build with a good `DIRECT_URL` passes; with a
  `:6543` `DIRECT_URL` fails deterministically.
- **WS3 gate fixture.** A fixture DB reproducing current prod (three stale extra-in-DB uniques
  present, `category` NOT NULL) must make the extended gate emit a **distinct FAIL per object**
  (each of the three uniques individually + the `category` nullability individually — an aggregate
  FAIL is insufficient, since `category` alone produces one and would hide a comparator blind to
  the uniques); the post-repair fixture must make it **PASS**. Assert the extra-in-DB uniques are
  caught by the **bidirectional** comparator, not only schema-missing columns.
- **WS4 lint fixture.** A `CREATE POLICY … USING (user_id = auth.uid())` fixture must be
  **rejected** whether it lives under `prisma/migrations/` or `supabase/migrations/`; the
  `(select auth.uid())` form **accepted** in both roots.
- **WS2 duplicate-guard.** A seeded branch row that violates a to-be-dropped unique must trigger
  the embedded `HAVING count(*) > 1` abort rather than silent data loss.
- **Negative control (WS6, if built).** Pre-rewrite EXPLAIN must show per-row `auth.uid()`;
  post-rewrite must show a single InitPlan — and the semantic-equivalence gate must independently
  confirm byte-identical predicates.
- **Rollback (O `o5`).** `Integration` unique is trivially re-addable. `EnvironmentalData`
  unique-drop is a **soft one-way door** (reversible only until a real 2nd reading lands
  post-drop). Runbook Step 4 carries PITR + single-txn + `ON_ERROR_STOP`.

## 15 Acceptance criteria — the 100/100 contract

Each criterion is traceable to an originating `must_fix` (seat code) and/or workstream. Numbered
AC-1 … AC-28.

**Build gate (WS1)**
1. **AC-1** `scripts/build.sh` production else block (`:19-38`) contains `exit 1` (not a warning)
   when `DIRECT_URL` is empty, `== $DATABASE_URL`, or matches `:6543`. *(A `a2`, O `o2`, WS1)*
2. **AC-2** The fail-close asserts a **direct `:5432` host AND no `:6543`** before
   `prisma migrate deploy` (`:32`). *(A `a2`, D `d4`, WS1)*
3. **AC-3** WS1 lands **after / atomic-with** WS0's `DIRECT_URL` fix; a dry-run proves a prod
   deploy with the old pooler `DIRECT_URL` now fails fast rather than no-op'ing. *(A `a1`, WS0→WS1)*
4. **AC-4** All DigitalOcean narration is struck from `build.sh:1-8,23-26` and
   `docs/runbooks/ra-1807-schema-drift-repair.md`; deploy-target references read Vercel-only. *(O `o1`)*

**Drift-repair migration (WS2)**
5. **AC-5** A single `prisma/migrations/` file (single-txn, `ON_ERROR_STOP`) drops
   `Integration_userId_provider_key`, `EnvironmentalData_inspectionId_key`, and
   `XeroAccountCodeMapping_userId_category_damageType_key` via `DROP INDEX IF EXISTS` (not
   `DROP CONSTRAINT`). *(D `d1`, `d2`, WS2)*
6. **AC-6** The migration includes `ALTER TABLE "XeroAccountCodeMapping" ALTER COLUMN "category"
   DROP NOT NULL`. *(A `a3`, WS2)*
7. **AC-7** The migration does **NOT** contain any `XeroAccountCodeMapping.userId` DROP; that DROP
   is documented as a founder-gated recommendation only. *(A `a3`, J `j2`, D escalate, WS2)*
8. **AC-8** Each DROP is preceded by an embedded duplicate-guard (`HAVING count(*) > 1`) that
   aborts the transaction on a real duplicate. *(WS2, §14)*
9. **AC-9** Paired `schema.prisma` edits accompany the migration so the extended drift gate (WS3)
   is green against the intended post-repair schema. *(WS2, WS3)*
10. **AC-10** The migration applies cleanly on a Supabase branch and is a no-op on a 2nd run
    (`{proven-on-branch}`). *(J `j4`, §13 (iii), §14)*
11. **AC-11** Post-apply verification is **live-SQL readback** (`pg_indexes` /
    `information_schema.columns`), explicitly **not** the ledger. *(A `a4`, J `j3`, WS2)*
12. **AC-12** Functional post-checks pass on the branch: a 2nd `EnvironmentalData` reading per
    `inspectionId` succeeds; the same provider connects to a 2nd workspace. *(WS2, §14)*
13. **AC-13** The WS2 prod APPLY is executed **only** in founder Session B (never autonomous); the
    proof class is recorded as `{proven-after-founder-gate}`. *(Q `q2`, `q4`, §13)*

**Drift gate extension (WS3)**
14. **AC-14** `scripts/check-schema-drift.mjs` diffs unique indexes, table constraints, and column
    nullability in addition to scalar columns. *(Q `q3`, O `o3`, WS3)*
15. **AC-15** The extended gate detects each drift object **individually** (not merely an aggregate
    FAIL — the `category` nullability mismatch alone would yield that and mask a comparator blind to
    the uniques): on a fixture reproducing current prod it emits a **distinct FAIL per object** for
    each of `Integration_userId_provider_key`, `EnvironmentalData_inspectionId_key`,
    `XeroAccountCodeMapping_userId_category_damageType_key` (all **extra-in-DB**) AND for the
    `XeroAccountCodeMapping.category` NOT-NULL mismatch; on the post-repair fixture it **PASSES**.
    The index/constraint comparators must be **bidirectional** — flagging objects present in the DB
    but absent from schema, not only the reverse. *(Q `q3`, §14, WS3, adversarial-verify AV-2)*

**RLS forward guardrail (WS4)**
16. **AC-16** A CI lint rejects any new `CREATE POLICY` with a bare `auth.*()` predicate and
    requires `(select auth.*())`, scanning **BOTH** `prisma/migrations/**` AND
    `supabase/migrations/**` (RLS policies live in both roots — verified 7 prisma + 9 supabase
    files — so a supabase-only scan misses prisma-only regressions). *(D `d3`, WS4, adversarial-verify AV-1)*
17. **AC-17** The lint rejects a bad-policy fixture and accepts the wrapped form. *(WS4, §14)*

**Deny-all documentation + guard (WS5)**
18. **AC-18** The 6 deny-all tables (`ClientCommsLog`, `DrNrpgWebhookEvent`, `FeatureEntitlement`,
    `RestorationIncident`, `StorageRestoreJob`, `SupportTicketReply`) are added to the
    `SERVICE_ONLY` set in `scripts/audit-rls-coverage.ts` and documented as intentional
    service-role-only. *(S `s5`, WS5)*
19. **AC-19** A test asserts no authenticated `supabase-js` write path targets those 6 tables; **no
    RLS policy is added** to any of them (they remain default-deny). *(S `s5`, WS5)*

**Founder Session A (WS0) — gated, verified read-only**
20. **AC-20** Vercel Production env batch is applied in one session: `ABR_API_GUID` + `ABR_BASE_URL`,
    `DIRECT_URL`→`udooy` `:5432`, 3 RA-6688 alert rules, leaked-password toggle; one redeploy. *(O `o4`, WS0)*
21. **AC-21** Post-redeploy read-only verify: `check-schema-drift.mjs` / `audit-prod-drift.ts`
    clean **and** one known-valid ABN lookup yields a READY job + an `AbnLookupCache` row
    (resolving the RA-6678 MALFORMED-vs-CONFIG_ERROR ambiguity). *(O `o4`, audit §P0.1, WS0)*

**Scope discipline (the REDUCE-SCOPE contract)**
22. **AC-22** The 380-policy RLS mass-rewrite (WS6) is present in the spec but **NOT** release-gating
    and is **not** built in this run. *(J `j1`, S `s2`, D `d5`, WS6)*
23. **AC-23** If WS6 is ever built, it wraps **only** zero-arg `auth.*` (never
    `is_workspace_owner`/`is_workspace_member`), skips the 46 already-wrapped, and passes the
    §12 semantic-equivalence gate (byte-identical predicates + advisor + behavioural suite). *(S `s1`, `s3`, `s4`, WS6)*
24. **AC-24** The `organizations` always-true policy + 10 co-tenant tables are **escalated as an
    owner decision** (WS7), not dropped in this run; the spec asserts only "no new RA code depends
    on the 10 foreign tables" + a regression check. *(S `s6`, WS7)*
25. **AC-25** Repo hygiene ships as a **separate janitorial PR** (WS8) sharing no branch with WS1–WS5;
    `pgvector public→schema` is deferred to its own spec. *(J `j5`, WS8)*
26. **AC-26** The 28 no-repo-folder ledger rows are **NOT** backfilled/guessed. *(D `d6`, §11)*

**Verification integrity**
27. **AC-27** No autonomous step holds the prod `:5432` write credential; every prod write is a
    founder session; branch spend is `confirm_cost`-gated and the branch is deleted same session.
    *(Q `q4`, O `o6`, §13)*
28. **AC-28** No acceptance claim is made from the ledger or whole-repo `tsc`; RLS/InitPlan proofs
    use EXPLAIN InitPlan-shape with a negative control on the harness, and migration proofs use
    seeded branch row-count equivalence. *(A `a4`, J `j3`, Q `q4`, §13)*

## 16 /goal command

```
/goal Implement docs/specs/spm-remediation-2026-07-12.md — build WS1(build.sh fail-closed)+WS2(drift-repair migration)+WS3(extend drift gate)+WS4(RLS CI lint)+WS5(deny-all docs/guard) to their §15 criteria with live-SQL/branch proofs; WS0/Session-B prod writes are founder gates; WS6 RLS mass-rewrite + WS7 co-tenancy + WS8 hygiene are separate non-blocking follow-ups; verification per §13 (localhost harness / Supabase branch / prod-read-only), no autonomous prod write.
```

## 17 Implementation sequence

Strict ordering (architect `a1`); no DDL is authored/applied until the build is fail-closed AND
prod `DIRECT_URL` is confirmed `:5432`.

1. **WS0 / Session A (founder).** Vercel env batch incl. `DIRECT_URL`→`:5432`; redeploy; engineer
   read-only verify. **Gate for everything downstream** — WS1's fail-close bricks the next deploy
   if `DIRECT_URL` is still the pooler.
2. **WS1 (build).** `build.sh` `exit 1` + strip DO narration. Lands after/atomic-with WS0.
3. **WS3 (build, prerequisite).** Extend `check-schema-drift.mjs`; prove FAIL-on-current /
   PASS-post-repair fixtures. Must precede WS2 so the paired schema edit is gated.
4. **WS4 (build).** RLS CI lint (independent; can parallelise with WS3/WS5).
5. **WS5 (build, docs/guard).** Deny-all `SERVICE_ONLY` + guard test (independent).
6. **WS2 (build; APPLY gated).** Author drift-repair migration + paired `schema.prisma` edits;
   branch-prove (`{proven-on-branch}`); then **Session B (founder)** applies via runbook Step 4;
   live-SQL readback (`{proven-after-founder-gate}`).
7. **WS6 / WS7 / WS8 (follow-ups).** Separate, non-blocking; WS6 behind a measured trigger, WS7 an
   owner decision, WS8 a janitorial PR.

Founder touches collapse to **2 sessions**: A (env batch, ~15 min) then B (gated DDL, ~30–45 min,
after A verified).

## 18 Session-handoff seed

- **Repo state.** `origin/main 6437dd7c`; local `tsc` RED (`prisma:generate` TLS on this box) —
  verify per-file / live-SQL, never whole-repo.
- **Two founder sessions.** A = Vercel Production env batch (`ABR_API_GUID` + `ABR_BASE_URL`,
  `DIRECT_URL`→`udooy` `:5432`, 3 RA-6688 alerts, leaked-password toggle; one redeploy; read-only
  verify). B = gated DDL apply via `docs/runbooks/ra-1807-schema-drift-repair.md` Step 4, **after
  A verified**.
- **First command next session.** `git fetch`; read `docs/audits/restoreassist-audit-2026-07-12.md`
  and this spec §17; confirm `origin/main` still `6437dd7c`; begin WS0 dependency check (is prod
  `DIRECT_URL` `:5432` yet?) before authoring any DDL.
- **Open owner items.** WS7 co-tenancy decision; WS6 measured-trigger decision; the
  `XeroAccountCodeMapping.userId` DROP-vs-adopt sign-off.
- **Do not.** Backfill the 28 ledger rows; add policies to the 6 deny-all tables; hold a prod
  `:5432` write credential in any autonomous step; drop the `organizations` policy unilaterally.

## 19 Final recommendation

**APPROVE BUILD — conditional.** §15 (AC-1 … AC-28) is the 100/100 contract; every criterion is
traceable to a folded `must_fix` or a workstream. The judge's **58/100 REDUCE SCOPE** was scored
against the **pre-fold** shape; all six challenges are folded: the RLS mass-rewrite moves to WS6
(deferred, non-gating), hygiene to WS8 (separate PR), the Xero `userId` DROP is carved out as a
founder gate, and verification is live-SQL not ledger/`tsc`. Honest ceiling: the WS2 apply and WS0
are `{proven-after-founder-gate}` — reachable only through the two founder sessions; the
autonomous run can reach `{proven-on-branch}` and no further. Conditions: (1) the **T3 adversarial
verify pass is COMPLETE** (§7); its 2 blocking + 1 minor findings (AV-1 RLS-lint dual-root, AV-2
WS3 per-object/bidirectional detection, AV-3 §10 Xero wording) are folded into this document; (2)
WS1 must not merge/deploy ahead of WS0's `DIRECT_URL` fix. The durable value delivered without any
founder is WS3 + WS4 (the gate + the guardrail) — the recurrence fixes that stop RA-1807 and
RA-4956 from happening a third time.
