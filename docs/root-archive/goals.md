# RestoreAssist — Goals Backlog

> Single source of truth for production-readiness goals, each written as a verifiable `/goal` condition.
> Generated 2026-06-16 by a 6-miner + Senior-PM synthesis pass over: gap audits, Definition-of-Done / release gate, code health, security/RLS (live Supabase advisors), the live Linear backlog, and app-store blockers. 77 raw candidates → 32 deduped goals.

## What `/goal` is
`/goal` is **built-in to Claude Code** (v2.1.139+; this machine runs 2.1.174 — nothing to install). You give it one verifiable completion condition and Claude runs turns autonomously until a fast evaluator model confirms the condition holds. Docs: https://code.claude.com/docs/en/goal

## How to use this file
- Run a goal by pasting its fenced `/goal …` line into the session.
- Headless / CI: `claude -p "/goal <condition>"`. Pair with auto mode for full autonomy; use `/loop` for interval cadence; use scheduled routines for unattended runs.
- Every condition is self-bounded (`… or stop after N turns`).
- **external/manual** = needs a human (founder/owner); an agent can wire files but cannot generate the evidence or flip the cloud toggle.

## Legend
Priority: **P0** ship-blocker · **P1** high · **P2** medium · **P3** low. Supabase prod project ref: `udooysjajglluvuxkijp`.

## Spec alignment (goals.md → [spec.md](spec.md))
| goals | spec.md phase / gate |
|---|---|
| #1, #2, #10, #11, #25, #13, #29 | §5.10 Security & privacy |
| #4 | §5.4 Generation lifecycle integrity |
| #5, #15, #27 | §5.7 Integrations |
| #6, #7, #8, #31, #32 | §7 Release sign-off |
| #16 | §5.5 Standards currency |
| #17 | §5.9 QA / reproducibility |
| #19 | §5.8 Scale / performance |
| #20, #21 | §5.2 Mobile capture |
| #3 | §5.11 Deploy / §2 ownership (schema drift) |
| #12, #18 | §3 gap-discovery guards |
| #22, #23, #24, #26, #28, #30 | whole-product (goals.md only — outside NIR §5) |

## ▶ Recommended first goal
Eliminate the always-true RLS policies on the 6 legacy commerce tables (tenant-isolation bypass). This is the highest-leverage, code-verifiable P0.

```
/goal In Supabase prod project udooysjajglluvuxkijp, replace each authenticated_write_<table> ALL policy on public.customers/orders/order_items/quotes/quote_items/products (currently USING + WITH CHECK both literally true) with an org/tenant-scoped USING + WITH CHECK, or drop the policy if the table is unused in RA. End state: get_advisors(project_id=udooysjajglluvuxkijp, type:security) returns 0 rls_policy_always_true findings for those 6 tables. Or stop after 6 turns if the owning tenant column cannot be confirmed.
```

---

## P0 — ship blockers

### 1. Eliminate always-true RLS policies on 6 legacy commerce tables `[Security/RLS]`
```
/goal In Supabase prod project udooysjajglluvuxkijp, each authenticated_write_<table> ALL policy on public.customers/orders/order_items/quotes/quote_items/products (currently USING + WITH CHECK both literally true) is replaced with an org/tenant-scoped USING + WITH CHECK, or dropped if the table is unused in RA; end state = 0 rls_policy_always_true advisor findings for those 6 tables. Or stop after 6 turns if the owning tenant column cannot be confirmed.
```
- **Verify:** `get_advisors(project_id=udooysjajglluvuxkijp, type:security)` → `rls_policy_always_true` findings referencing the 6 tables == 0 (CLI: `supabase db advisors --linked --type security`)
- **Source:** security miner (live get_advisors WARN ×6); root in `supabase/migrations/20260518100000_ra_4827_auth_rls_initplan_batch.sql`, not fixed by `20260614000000_ra_4956_tenant_scoped_rls_policies.sql`
- **Status:** [PASS] DONE (applied + verified 2026-06-16). Migration `drop_always_true_rls_legacy_commerce_tables` applied to prod `udooysjajglluvuxkijp`: 12 always-true policies dropped, RLS left enabled → default-deny; server/service-role unaffected. Verified via `get_advisors(security)`: `rls_policy_always_true` 7→1 (only `PushToken` #10 remains), **0 findings for the 6 tables, 0 ERROR-level**. These tables are a sibling Unite-Group CRM's (snake_case, organizations-FK, absent from RA schema) — proper `organization_id`-scoped policies **handed off** to the CRM owner (task_f45767f3). Repo: `supabase/migrations/20260616000000_drop_always_true_rls_legacy_commerce_tables.sql`.

### 2. Lock down 4 SECURITY DEFINER functions exposed via RPC `[Security/RLS]`
```
/goal EXECUTE on handle_new_user(), is_workspace_member(text), is_workspace_owner(text), verify_client_invite(text) is REVOKEd from anon+authenticated (or switched to SECURITY INVOKER where elevation isn't needed); end state = 0 anon_security_definer_function_executable AND 0 authenticated_security_definer_function_executable advisor findings. Or stop after 5 turns.
```
- **Verify:** `get_advisors(type:security)` → combined `{anon,authenticated}_security_definer_function_executable` == 0 (was 8)
- **Source:** security miner (live WARN ×8)
- **Status:** [PASS] DONE (applied + verified 2026-06-16, migration `20260616020000`). `handle_new_user` + `verify_client_invite` EXECUTE revoked from PUBLIC/anon/authenticated (service_role retained); advisor 8→4. Residual `is_workspace_member`/`is_workspace_owner` intentionally kept executable — they're called inside RLS policies and only reveal the caller's own membership (benign). NOTE: the original bundled `REVOKE … FROM anon, authenticated` was a no-op (PUBLIC grant); the corrected migration revokes from PUBLIC.

### 3. Reconcile prod DB schema drift (37 missing tables + columns) `[Data integrity]`
```
/goal Production schema matches schema.prisma: prisma migrate diff (or scripts/audit-prod-drift.ts) reports 0 missing tables and 0 missing columns for the 37 named tables (FormTemplate, VoiceNote, LidarScan, FloorPlan, LiveTeacherSession, SubscriptionTier, Authorisation, etc.) and listed columns, and one previously-broken endpoint (e.g. FormTemplate CRUD) returns 200 in prod. Or stop after diagnosis + a one-shot ALTER script generated from migrate diff if prod write access is unavailable (owner-gated DDL window).
```
- **Verify:** `scripts/audit-prod-drift.ts` prints 0 missing tables/columns; one previously-broken endpoint returns 200
- **Source:** Linear RA-1807
- **Status:** OPEN (filed 2026-04-29, Backlog). Blocks RA-1720 (Phase 5 cutover) + RA-1757 (iOS). Migrations recorded applied but DDL never ran. Prod DDL is owner-gated.

### 4. Stop submit route auto-promoting inspections to COMPLETED `[Inspections/lifecycle]`
```
/goal app/api/inspections/[id]/submit/route.ts no longer writes status:'COMPLETED'; the AI submit pipeline terminates at status:'ESTIMATED' and lets the invoice-paid webhook advance to IN_BILLING then user CloseJobPrompt to CLOSED. End state = a unit test asserts POST submit leaves status==='ESTIMATED' (never COMPLETED) and an E2E covers submit -> CloseJobPrompt -> CLOSED. Or stop after 6 turns if the SP-A close webhook contract cannot be confirmed.
```
- **Verify:** vitest: POST submit leaves status `ESTIMATED`; E2E reaches `CLOSED`; grep shows no direct COMPLETED write
- **Source:** Linear RA-4863
- **Status:** [PASS] DONE (verified 2026-06-16). Submit pipeline terminates at `ESTIMATED` ([submit/route.ts:569-578](app/api/inspections/[id]/submit/route.ts:569)); no COMPLETED write exists, and regression test `app/api/inspections/[id]/submit/__tests__/no-auto-complete.test.ts` is already present. Closed by the loop's verify-before-fix pass.

### 5. Set ABR_API_GUID in prod + split CONFIG_ERROR vs MALFORMED `[Integrations/onboarding]`
```
/goal lib/integrations/abr/client.ts distinguishes CONFIG_ERROR (missing GUID) from MALFORMED (bad ABN), AND a prod ABN lookup for a known-valid ABN returns ok:true so lib/setup/jobs.ts hydration populates legalName/tradingName/acn/state instead of status:ERROR. End state = unit test asserts the CONFIG_ERROR/MALFORMED branch + prod onboarding lookup hydrates org fields. Or stop after 4 turns if Vercel access is unavailable and hand the env-set step to the founder.
```
- **Verify:** unit test asserts CONFIG_ERROR vs MALFORMED; prod ABN lookup → `org.legalName` populated, job status != ERROR
- **Source:** Linear RA-6678
- **Status:** Fresh 2026-06-15 audit, VERIFIED (Backlog). Code split shippable now; prod env var `ABR_API_GUID` (+ `ABR_BASE_URL`) is **external/manual** (founder Vercel).

### 6. Release Gate scores 100/100 (fail-closed go-live authority) `[Release gate]`
```
/goal pnpm tsx scripts/release-gate-score.ts --strict exits 0 with total_score==100 and passed==true in release-gate-report.json, and no open P0/P1 release-blocker remains. Or stop after 5 turns and list exactly which sections (A-F) are red with the failing sub-criterion ids.
```
- **Verify:** `pnpm tsx scripts/release-gate-score.ts --json --strict`; `release-gate-report.json` total_score == 100, exit 0
- **Source:** dod miner G1 + appstore miner + Linear RA-6688; `docs/RELEASE_GATE.md` (RA-4956)
- **Status:** OPEN, authoritative. No report exists yet; can't be 100 today (owner-evidence E1/E2/F1, D1/D3 deferred; depends on #7 and #8). Run the scorer first to reveal the true current number.

### 7. Stabilise Vitest Prisma CI so DATABASE_URL-gated suites run `[CI/test infra]`
```
/goal pnpm exec vitest run completes with 0 failures attributable to 'Environment variable not found: DATABASE_URL'/PrismaClientInitializationError, and the DB-gated suites (subscription/webhook/setup/OAuth describe.skipIf) execute against a deterministic test DB instead of silently skipping. Or stop after 4 turns if no test DB can be provisioned here and document the required test-DB bootstrap strategy.
```
- **Verify:** `pnpm exec vitest run 2>&1 | rg -i 'DATABASE_URL|PrismaClientInitializationError'` → none; DB-gated describes run not skipped
- **Source:** dod + health miners + Linear RA-4951
- **Status:** OPEN, RA-4951 In Progress (Urgent); bounced Done↔In Progress since 2026-05-17. Gates release-gate B5.

---

## P1 — high

### 8. Unblock @smoke Playwright suite (undici/webidl TypeError) `[CI/release gate]`
```
/goal pnpm test:smoke:ci (and test:smoke:sandbox) runs to completion with 0 collection/compile TypeErrors from undici/webidl; the suite executes its specs rather than dying at import (non-zero exit allowed only on genuine assertion failures). Or stop after 4 turns if the failure is environmental (sandbox unreachable) and document that.
```
- **Verify:** `pnpm test:smoke:ci 2>&1 | rg -i 'webidl|undici|TypeError'` → no matches
- **Source:** appstore miner RA-3016 + dod A1/B4 · **Status:** OPEN (Backlog). Gates RELEASE_GATE A1+B4. May be stale — re-run to confirm before fixing.

### 9. Restore Android release pipeline (re-enable Google Play Developer API) `[Android release]`
```
/goal The latest android-release.yml run on main concludes success with the upload-google-play step green (AAB on internal track); a precondition step prints "androidpublisher API: OK", the deprecated track:internal is migrated to tracks:[internal], and the service account has Release manager on com.restoreassist.app. End state = a green release run + the precondition step present. Or stop after the workflow edits land if GCP console access is unavailable.
```
- **Verify:** `gh run list --workflow=android-release.yml -L 3` latest=success; log shows upload success; yml has precondition + `tracks:[internal]`
- **Source:** Linear RA-2997 + appstore; `.github/workflows/android-release.yml:80-86` · **Status:** VERIFIED OPEN (5 failed runs in May). GCP API enable is **external/manual** (project 292141944467).

### 10. Fix PushToken UPDATE policy whose USING clause is always-true `[Security/RLS]`
```
/goal Policy PushToken_update_own has USING ((select auth.uid())::text = "userId") (not true), matching its already-correct WITH CHECK; end state = 0 rls_policy_always_true advisor findings for public.PushToken. Or stop after 3 turns.
```
- **Verify:** `get_advisors(type:security)` → `rls_policy_always_true` for PushToken == 0
- **Source:** security miner (live WARN) · **Status:** [PASS] DONE (applied + verified 2026-06-16, migration `20260616010000`). `PushToken_update_own` USING scoped to owner; advisor `rls_policy_always_true` = 0.

### 11. Set immutable search_path on 9 flagged public functions `[Security/RLS]`
```
/goal Each of the 9 functions (update_report_search_vector, update_client_search_vector, update_inspection_search_vector, update_updated_at_column, handle_new_user, set_updated_at, is_workspace_member, is_workspace_owner, update_media_asset_updated_at) has SET search_path pinned (e.g. ALTER FUNCTION ... SET search_path = ''); end state = 0 function_search_path_mutable advisor findings. Or stop after 4 turns.
```
- **Verify:** `get_advisors(type:security)` → `function_search_path_mutable` == 0 (was 9)
- **Source:** security miner (live WARN ×9) · **Status:** [PASS] DONE (applied + verified 2026-06-16, migration `20260616010000`). `search_path=''` pinned on all 9; advisor `function_search_path_mutable` = 0.

### 12. Keep Supabase security advisors at 0 ERROR-level (RLS regression guard) `[Security/RLS]`
```
/goal A CI/scheduled check fails the build if Supabase security advisors report >0 ERROR-level findings OR list_tables(public) shows any table with rls_enabled=false; end state = the check exists, passes once, and current counts are 0 ERROR / 0 rls-off. Or stop after 5 turns once the gate exists and passes once.
```
- **Verify:** `get_advisors(type:security)` ERROR == 0; `list_tables(public)` 0 rls_enabled==false; `supabase db advisors --linked --type security --level error --fail-on error`
- **Source:** security miner + RA-4970 · **Status:** Currently GREEN (200/200 tables, 0 ERROR) — this is a GUARD against regression, not a fix.

### 13. Resolve the 8 high-severity production dependency CVEs `[Dependency security]`
```
/goal pnpm audit --audit-level=high --prod exits 0 (currently 8 high: @grpc/grpc-js ×4 via firebase, esbuild, ws, form-data, protobufjs) via upgrades or justified package.json pnpm.auditConfig.ignoreGhsas entries each with a comment. Or stop after 6 turns; if a high CVE is unfixable (transitive via firebase) document it as an explicit ignore + tracking note.
```
- **Verify:** `pnpm audit --audit-level=high --prod; echo EXIT:$?` → '0 high', EXIT:0
- **Source:** health miner (live 2026-06-16) + Linear RA-3037..3040 · **Status:** VERIFIED OPEN; currently warn-only. Honour RA-5193 (minimatch) before promoting the gate (see #28).

### 14. Wire Live Teacher turn endpoint to the real cloud client `[AI/Live Teacher]`
```
/goal app/api/live-teacher/turn/route.ts returns model-generated content via lib/live-teacher/claude-cloud.ts instead of the canned 'Live Teacher cloud client lands in RA-1132g.' string; end state = the stub string is gone AND the route test asserts a non-canned/streamed response. Or stop after 6 turns if claude-cloud.ts is still stubbed and cannot be completed in scope.
```
- **Verify:** `grep -n 'RA-1132g\|cloud client lands\|stubbed' app/api/live-teacher/turn/route.ts` → nothing; route test passes against real path
- **Source:** gaps miner (GAP_AUDIT §2) · **Status:** VERIFIED OPEN (route.ts:24/28/131). API-reachable only (no prod UI calls it) — severity tempered.

### 15. Stop Resend email defaulting to resend.dev sandbox in production `[Integrations/Email]`
```
/goal lib/email.ts no longer silently falls back to 'onboarding@resend.dev' when RESEND_FROM_EMAIL is unset — it throws/logs a hard config error (or a startup env guard requires RESEND_FROM_EMAIL); end state = zero 'onboarding@resend.dev' literals in lib/email.ts AND a unit test asserts send() fails fast when RESEND_FROM_EMAIL is unset. Or stop after 5 turns if a broader env-guard refactor is required.
```
- **Verify:** `grep -c 'onboarding@resend.dev' lib/email.ts` == 0; vitest asserts fail-fast on missing var
- **Source:** gaps miner (GAP_AUDIT §2) · **Status:** [PASS] DONE (2026-06-16, branch `fix/ra-resend-from-guard`). All 11 sandbox fallbacks removed; centralised into `getFromEmail()` which throws when RESEND_FROM_EMAIL is unset. Verified: 0 `onboarding@resend.dev` literals + new test `lib/__tests__/email-from.test.ts` (2 passed).

### 16. Normalise IICRC S520 edition references to :2024 `[Compliance content]`
```
/goal All user-facing S520 citations read S520:2024 (4th ed.), not S520:2024, with section numbers re-verified against the 2024 edition (NOT blind-replaced); end state = grep for 'S520:2024' across lib/scope-mould.ts, lib/iicrc-checklists.ts, lib/scope-prelims.ts, lib/scope-biohazard.ts, lib/dispute-pack.ts, lib/swms/auto-generator.ts, lib/assessments/domains/{mould,hvac,biohazard}.ts returns 0, and section-number review is complete. Or stop after 6 turns if section-numbering verification needs the source standard.
```
- **Verify:** `grep -r 'S520:2024' lib/` → 0; spot-check 5 refs vs S520:2024
- **Source:** Linear RA-6684 · **Status:** VERIFIED (Backlog). 50+ stale refs. WARNING: section numbering changed between editions — do not blind-replace.

### 17. Add unit tests for the report-generation pipeline `[Testing]`
```
/goal lib/reports/build-structured-report.ts and lib/reports/extract-report-data.ts (currently zero coverage) have green unit tests covering IICRC section mapping and GST/numeric fields; end state = vitest includes new passing tests for both and coverage for them is >0%. Or stop after 6 turns.
```
- **Verify:** vitest shows new passing tests for both files; coverage non-zero
- **Source:** Linear RA-6687 · **Status:** VERIFIED (Backlog). Core paid output + compliance surface, untested.

### 18. Add an RLS audit script + CI gate (scripts/audit-rls.ts) `[Security/RLS tooling]`
```
/goal scripts/audit-rls.ts exists, enumerates production tables, asserts RLS enabled + policies present for the protected group (User, Account, Workspace, inspections, reports, invoices, evidence, integrations, audit events), exits non-zero on any uncovered table, and is wired into package.json/CI; end state = the script exists and produces deterministic pass/fail. Or stop after 6 turns if DATABASE_URL is unavailable — then deliver it in advisory/offline-schema mode.
```
- **Verify:** `pnpm exec tsx scripts/audit-rls.ts` exits 0 with coverage report, non-zero when a protected table lacks RLS; package.json has `audit:rls`
- **Source:** gaps miner (EXECUTION_BACKLOG SEC-001/ENV-004) · **Status:** PARTIAL — audit-api-routes.ts + audit-env.ts exist; audit-rls.ts absent.

### 19. Enforce or exempt bounded findMany queries across API routes `[API/performance]`
```
/goal A repeatable check (audit-api-routes.ts rule or dedicated script) flags app/api/**/route.ts findMany calls lacking explicit take/pagination, top offenders are patched to add take + explicit select/include, and remaining cases carry a documented '// ra-query-ok' exemption; end state = the audit reports zero un-exempted unbounded findMany. Or stop after 8 turns — then deliver the audit gate plus highest-risk (list/admin/report) routes patched.
```
- **Verify:** `pnpm exec tsx scripts/audit-api-routes.ts` (query rule) → 0 un-exempted unbounded findMany; spot-check 3 patched routes
- **Source:** gaps miner (GAP_ANALYSIS gap 6; TD-08) · **Status:** LIKELY OPEN (128 route files use findMany). Verify the audit's rule set first.

### 20. Implement mobile offline sync engine (replace TODO stub) `[Mobile/Sync]`
```
/goal mobile/lib/sync/engine.ts no longer returns hardcoded 'idle' and contains a real persisted mutation queue with idempotency keys; end state = zero TODO/placeholder-idle in engine.ts AND a passing offline-queue unit test (network-toggle replay is idempotent). Or stop after 8 turns if the server-side ClientMutation idempotency model is not yet present.
```
- **Verify:** `grep -c 'TODO' mobile/lib/sync/engine.ts` == 0; mobile offline-sync unit test passes
- **Source:** gaps miner (GAP_ANALYSIS gap 3; MOB-001) · **Status:** VERIFIED OPEN (4 markers). NOTE: mobile/ not in root pnpm workspace — separate install needed.

### 21. Fix iOS sign-in regression loop (RA-2119) + add auth smoke gate `[Mobile auth]`
```
/goal Upstream OAuth-callback bug RA-2119 is resolved with a root-cause memo; a CODEOWNERS rule requires founder review on app/login/**, app/api/auth/**, capacitor.config.ts, ios/App/App/Info.plist; pr-checks.yml runs a Playwright auth-flow smoke (Google/Apple/email-password) against the Vercel preview that blocks merge on failure. End state = the three artifacts land. Or stop after 8 turns.
```
- **Verify:** RA-2119 closed + memo; CODEOWNERS present; pr-checks.yml has Playwright auth job that fails on a broken callback
- **Source:** Linear RA-2998 · **Status:** OPEN (Backlog). STALE (May PR thrash) — re-verify current auth state and whether RA-2119 is already fixed.

---

## P2 — medium

### 22. Capture in-app iOS screenshots for App Store `[App store]`
```
/goal distribution/screenshots/appstore/{iphone-6.9,iphone-6.7,ipad-13} each contain >=1 PNG captured from the running app at App Store required pixel dimensions, with no browser chrome or non-iOS status bars. Or stop after 3 turns if simulator/sandbox capture is unavailable here and flag as owner-run (needs a Mac/simulator).
```
- **Verify:** each dir has non-empty PNG at iOS device dimensions
- **Source:** appstore miner (PREFLIGHT Cat 1) · **Status:** VERIFIED OPEN (dirs empty). Capture likely **external/manual** (Mac/simulator).

### 23. Replace Play Store phone screenshots with real in-app captures `[App store]`
```
/goal fastlane/metadata/android/en-AU/images/phoneScreenshots/ contains in-app screens (dashboard, inspection, capture, sign-off) at >=1080x1920 9:16 — NOT the current marketing/website pages; end state = regenerate via distribution/capture-screenshots.mjs against sandbox and confirm filenames/contents are app surfaces at correct dimensions. Or stop after 3 turns if sandbox login/seed is unavailable and flag as owner-run.
```
- **Verify:** `ls fastlane/metadata/android/en-AU/images/phoneScreenshots/`; each PNG is an app screen ≥1080×1920
- **Source:** appstore miner (upload runbook Step 5) · **Status:** SUSPECT — current 8 are marketing pages. NOTE: capture-screenshots.mjs prod-guard uses `restoreassist.com.au` but prod is `restoreassist.app`.

### 24. Eliminate the 851 ungated ESLint warnings `[Code health/lint]`
```
/goal pnpm lint reports 0 warnings (currently 851 / 0 errors; 75 auto-fixable), or at minimum a ratcheted-down count enforced via --max-warnings. End state = '0 problems' or a --max-warnings ceiling <= the post-cleanup count. Stop after 6 turns if remaining warnings need non-trivial refactors — then land --fix + a --max-warnings ratchet and report residual.
```
- **Verify:** `pnpm lint 2>&1 | tail -3` → no problems / exit 0
- **Source:** health miner (live 851) · **Status:** OPEN, non-blocking debt; 75 auto-fixable. Keep decoupled from broader gate flips until RA-5193.

### 25. Stop the public evidence-optimised storage bucket from allowing listing `[Security/Supabase]`
```
/goal The broad SELECT policy 'Public can read optimised' on storage.objects for bucket evidence-optimised is removed or narrowed so clients can fetch object URLs but cannot enumerate the bucket; end state = 0 public_bucket_allows_listing advisor findings, AND a known object URL still loads while an anon list() returns empty/forbidden. Or stop after 4 turns if a code path depends on listing (verify first).
```
- **Verify:** `get_advisors(type:security)` → `public_bucket_allows_listing` == 0; anon list() forbidden, known URL loads
- **Source:** security miner (live WARN) · **Status:** [PASS] DONE (applied + verified 2026-06-16, migration `20260616010000`). `Public can read optimised` policy dropped; advisor `public_bucket_allows_listing` = 0. Only the service-role server client lists this bucket (bypasses RLS), so unaffected.

### 26. Enable Supabase Auth leaked-password (HaveIBeenPwned) protection `[Security/Supabase]`
```
/goal Leaked-password protection is toggled on in Auth settings; end state = 0 auth_leaked_password_protection advisor findings. Stop after 2 turns (dashboard/Management API toggle — not a SQL migration).
```
- **Verify:** `get_advisors(type:security)` → `auth_leaked_password_protection` == 0
- **Source:** security miner (live WARN) · **Status:** VERIFIED OPEN. **external/manual-ish** — dashboard/Management API, not SQL.

### 27. De-advertise or wire OpenAI/Gemini integration options `[Integrations]`
```
/goal app/dashboard/integrations/page.tsx no longer presents OpenAI/Gemini as connectable options that toast 'coming soon' on click — they are gated behind a clearly disabled 'Coming soon' state (consistent with the comingSoon flag) or actually wired via lib/ai-provider; end state = no clickable provider toasts 'coming soon'. Or stop after 5 turns if full provider wiring is out of scope (then disabling the controls suffices).
```
- **Verify:** `grep -n 'coming soon' app/dashboard/integrations/page.tsx` shows providers behind disabled UI, not active toast handlers
- **Source:** gaps miner (GAP_AUDIT §2) · **Status:** VERIFIED OPEN (toasts at :611/:1521/:1639; only Anthropic wired).

### 28. Promote the dependency-audit CI step from warn-only to enforcing `[CI hardening]`
```
/goal The 'Audit dependencies' step in pr-checks.yml has continue-on-error removed (or false) so a high prod CVE fails the PR; end state = no continue-on-error:true remains in pr-checks.yml. Precondition: goal #13 is GREEN. Stop after 2 turns.
```
- **Verify:** `grep -n 'continue-on-error' .github/workflows/pr-checks.yml` → none (or only false)
- **Source:** health miner · **Status:** OPEN. Blocked-by #13; gated by RA-5193 (minimatch) before flipping enforcing.

### 29. Close out the 3 baselined route-safety mutation-no-auth routes `[Route security]`
```
/goal The route-safety baseline no longer needs the 3 mutation-no-auth exemptions (cron/sync-invoices, cron/sync-xero-payments, portal/invitations/accept) because each now has an explicit auth/secret gate (CRON_SECRET for cron; invite-token validation for portal/invitations/accept), or each exemption carries an inline safe-by-design justification; end state = baseline shrinks or each entry is justified. Or stop after 5 turns.
```
- **Verify:** `pnpm run security:scan` baselined section; read the 3 route files for an auth/secret check at handler top
- **Source:** health miner (route-safety-backlog.md) · **Status:** OPEN (baselined). Cron routes may already use CRON_SECRET (RA-6679, PR #1331) — possible quick win.

### 30. Migrate dashboard pages off neon palette to brand tokens `[UI/branding]`
```
/goal Off-brand neon Tailwind classes (cyan-400, emerald-400, fuchsia, violet-400) are replaced with brand tokens (navy #1C2E47 / bronze #8A6B4E / tan #D4A574 / dark #050505) across the dashboard, starting with app/dashboard/page.tsx stat cards + link hovers (142/150/352/387), and the Margot pages' cream/charcoal theme is reconciled or formally documented as a sub-brand; end state = grep for the neon classes across app/dashboard returns 0 (or only documented exceptions). Or stop after 8 turns — stage dashboard-home first.
```
- **Verify:** `grep -rE 'cyan-400|emerald-400|fuchsia|violet-400' app/dashboard` → 0 (or documented); visual check uses brand navy/bronze/tan
- **Source:** Linear RA-6689 · **Status:** VERIFIED (Backlog). 68 pages off-brand; stageable.

### 31. Refresh deferred release-gate owner-evidence (D1/D3/E1/E2/F1) `[Owner-evidence]` — external/manual
```
/goal docs/evidence/release-gate/1.0.0/{D1-billing-flows,D3-revenue-reconciliation,E1-app-store-metadata,E2-testflight-stability,F1-monitoring-alerting}.md each flip from status:deferred to status:pass with a verified: date within 14 days, backed by real evidence (Stripe/Apple sandbox purchase+renewal+cancel + 7-day events==DB reconciliation; ASC 'Ready for Submission'; TestFlight crash-free >=99.5%; Sentry alert rules). Or stop after 2 turns confirming which remain status:deferred (RA-5628).
```
- **Verify:** `rg -n '^status:' docs/evidence/release-gate/1.0.0/{D1,D3,E1,E2,F1}*.md` → status: pass
- **Source:** dod + appstore miners + RA-6688/RA-5628 · **Status:** OPEN, all 5 deferred. **external/manual** — needs live Stripe/Apple/Sentry evidence owned by founder. Worth 25 gate points.

---

## P3 — low

### 32. Record Founder/Board human acceptance of production + sale readiness `[Governance]` — external/manual
```
/goal A dated artifact exists (committed file or Linear status comment on RA-4956) in which Founder/Board explicitly accepts sale-readiness AND names the specific production action approved (deploy/release/prod-DB/Stripe/publish). Or stop after 1 turn confirming no such acceptance artifact exists yet.
```
- **Verify:** `rg -rni 'board accept|founder accept|go-live approv|production approv' docs/`
- **Source:** dod miner (PROJECT_DOD, PRODUCTION_GATE, OWNER_APPROVAL_MODEL) · **Status:** **external/manual** by DoD design — local evidence can never authorize this; needs a named human approval.

---

## Run order summary
1. **Security/RLS cluster (P0/P1):** #1, #2, #10, #11, #25 — all live-verified, mostly mechanical Supabase migrations. Start here.
2. **Release-gate path:** #7 → #8 → #6 (unblock test infra, then smoke, then score the gate).
3. **Data/lifecycle correctness:** #3, #4, #5.
4. **Then** the P1/P2 health, integrations, mobile, and app-store items.

External/manual (cannot be auto-closed): #5 (env), #9 (GCP API), #22/#23 (device capture), #26 (Auth toggle), #31, #32.

---

## BYOK audit findings (2026-06-16) — verdict: implemented_with_gaps
Core BYOK (AES-256-GCM credential vault, masked responses, tenant-isolated canonical AI path) is correct. These are the confirmed gaps. Maps to spec §5.10 (security) / §5.7 (integrations).

### B1. [HIGH] Legacy name-based provider resolution sends a BYOK key to the wrong vendor
- [PASS] **DONE** 2026-06-16 (branch `fix/ra-resend-from-guard`): provider resolved from API-key prefix (`providerForKey`) + fail-closed cross-vendor guard in `callAIProvider`/`getAnthropicApiKey`. Test `lib/__tests__/ai-provider-routing.test.ts` 3/3. (Deeper follow-up B1b: migrate `generate-inspection-report` onto the encrypted ProviderConnection path.)
```
/goal End state: /api/ai/vision and /api/reports/generate-inspection-report resolve the provider from an explicit provider enum (model-derived or a persisted provider column), never from integration.name, and route through the encrypted ProviderConnection/workspace-byok path. Check: grep that getLatestAIIntegration name-inference (ai-provider.ts:90-98) is no longer reached by either route, and add a unit test that an OpenAI-typed key never produces an api.anthropic.com request. Or stop after 6 turns and report residual.
```
- **Evidence:** `lib/ai-provider.ts:88-98`; consumed by `app/api/ai/vision/route.ts:93`, `app/api/reports/generate-inspection-report/route.ts:127-144`. An OpenAI key named "Claude API" is sent to api.anthropic.com (cross-vendor key exposure).

### B2. [HIGH] contents-manifest (non-[id]) route trusts a forgeable client-supplied apiKey
- [PASS] **DONE** 2026-06-16 (branch `fix/ra-resend-from-guard`): key resolved server-side via `resolveWorkspaceRouterConfig(inspection.workspaceId, model)`; `apiKey` removed from body (grep 0); 422 when no workspace/provider. Test `app/api/inspections/contents-manifest/__tests__/route.test.ts` 4/4.
```
/goal End state: POST /api/inspections/contents-manifest resolves the key server-side via the authenticated user's workspace (getProviderApiKey / workspaceRouteAiRequest) and apiKey is removed from the request body schema. Check: assert the route no longer reads body.apiKey (grep), and an integration test that a request omitting apiKey still generates a manifest using the stored key. Or stop after 4 turns and report.
```
- **Evidence:** `app/api/inspections/contents-manifest/route.ts:35-44, 75-80, 139-142`. Encrypted ProviderConnection key never consulted; sibling `[id]` route does it correctly.

### B3. [HIGH] User-scoped Google OAuth tokens stored in plaintext in the Account table
```
/goal End state: Account.access_token/refresh_token/id_token are encrypted at rest (wrap adapter linkAccount/update with credential-vault encrypt, decrypt in readers) OR the user-scoped path is retired and consolidated onto the encrypted Organization columns. Check: a fresh Google login writes ciphertext (iv:authTag:ciphertext) to Account, verified by reading the row; no plaintext token remains. Or stop after 6 turns and report the chosen approach + residual.
```
- **Evidence:** `prisma/schema.prisma:27,32` (`@db.Text`, no encryption); NextAuth PrismaAdapter writes live Google tokens on every sign-in. DB dump exposes live refresh tokens.

### B4. [HIGH] Gemini API key transmitted in URL query string (Sentry-capturable)
- [PASS] **DONE** 2026-06-16 (branch `fix/ra-resend-from-guard`): key moved to `x-goog-api-key` header in `callGoogle` (byok-client.ts) + `testGoogleKey` (provider-connections.ts); grep `[?&]key=` = 0. Added `lib/sentry-scrub.ts` + `beforeSendTransaction`/`beforeSend` URL scrub in sentry server+edge configs. Test `lib/ai/__tests__/byok-google-key-transport.test.ts` 2/2.
```
/goal End state: the Gemini key is sent via the x-goog-api-key request header at both call sites (no key in URL), and a Sentry span/transaction processor strips key=/apiKey= from span URLs. Check: grep '[?&]key=' returns no BYOK call sites, and a unit/integration test asserts no outbound Gemini request URL contains the key. Or stop after 4 turns and report.
```
- **Evidence:** `lib/ai/byok-client.ts:277`, `lib/workspace/provider-connections.ts:377`; sentry.*.config.ts have no span URL scrubbing. Sampled (10% prod) + DSN-conditional but real. Anthropic/OpenAI correctly use headers.

### B5. [MEDIUM] Encryption key resolution lacks validation + a production guard
- [PASS] **DONE** 2026-06-16 (branch `fix/ra-resend-from-guard`): `resolveKey` now decodes in try/catch, asserts 32-byte length, rejects all-zero/placeholder keys; `getDefaultKey` throws in prod (`VERCEL_ENV==='production'`) if only the `NEXTAUTH_SECRET` fallback is present; `.env.example` `INTEGRATION_ENCRYPTION_KEY=""`. Test `lib/__tests__/credential-vault-key.test.ts` 5/5. Owner item remains: confirm the live Vercel prod key is a real 32-byte value.
```
/goal End state: resolveKey asserts decoded length===32 in a try/catch with a clear error and rejects all-zero/known-placeholder keys; getDefaultKey throws at boot when VERCEL_ENV==='production' and only the NEXTAUTH_SECRET fallback is present; .env.example INTEGRATION_ENCRYPTION_KEY set to '' with a generate-me comment; and the live Vercel prod INTEGRATION_ENCRYPTION_KEY confirmed to be a real random 32-byte value, not the zeros placeholder. Check: a unit test that an all-zero/short/garbage key is rejected, plus a printout of the prod key length/format. Or stop after 6 turns and report which sub-items remain.
```
- **Evidence:** `lib/credential-vault.ts:18-26` (length-only encoding selection), `:44-47` (CREDENTIAL_ENCRYPTION_KEY → INTEGRATION_ENCRYPTION_KEY → NEXTAUTH_SECRET, no prod guard), `.env.example:252` (64 hex zeros accepted as valid).

### B-tests. [MEDIUM] BYOK critical paths are untested
- [PASS] **DONE** 2026-06-16 (branch `fix/ra-resend-from-guard`): `lib/__tests__/credential-vault.test.ts` (round-trip + GCM tamper-fail + wrong-key), `lib/workspace/__tests__/get-provider-api-key.test.ts` (ACTIVE/DISABLED/no-row/decrypt-throws gating + `maskApiKey` off-by-one). `maskApiKey` exported. 9/9 passing.
```
/goal End state: lib/__tests__/credential-vault.test.ts exercises a real AES-256-GCM encrypt→decrypt round-trip + tamper-fails-closed; maskApiKey has an off-by-one unit test; getProviderApiKey has ACTIVE/DISABLED/decrypt-throws→null gating tests. Check: the three test files exist and pass via `pnpm exec vitest run`. Or stop after 6 turns.
```
- **Evidence:** all 3 vault consumers mock encrypt/decrypt; no real-cipher, masking, or gating test exists. Also note (non-blocking): soft-delete keeps `encryptedCredentials` (no hard "forget"); BYOK model allowlist triplicated; 429 probe marks key ACTIVE.
