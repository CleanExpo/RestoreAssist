# Stage 2 External Blocker Closure Plan

Date: 2026-05-25

Worktree: `/private/tmp/RestoreAssist-phase1-main`

Branch: `codex/phase-1-production-readiness-clean`

## Objective

Close, verify, or formally assign the remaining Phase 1 external/manual blockers without merging, shipping, touching protected paths, or starting new feature work.

RestoreAssist remains **not approved for ship** until every item below has evidence and the final validation gate is green.

## Source Inputs

- `PHASE_1_MANUAL_SIGNOFF_CHECKLIST.md`
- `FINAL_SHIPIT_READINESS_REPORT.md`
- `RANA_ENGINEERING_VALIDATION_REPORT.md`
- `API_PUBLIC_ROUTE_EXCEPTION_REVIEW_REPORT.md`
- `VERCEL_TLS_ENV_VERIFICATION_REPORT.md`
- `RA-4970_RLS_VALIDATION_REPORT.md`
- `MOBILE_VALIDATION_PATH_REPORT.md`

## Blocker 1: Public Route Sign-Off

Current audit state:

- routes scanned: 442
- errors: 0
- warnings: 14
- warning rule: `public-token-route-review`

Stage 2 policy:

- do not suppress warnings to make the audit look green.
- do not change public-route behavior unless the fix is obvious, narrow, and testable.
- classify each route with a recommended decision and required evidence.
- assign unresolved acceptance to product/security owners.

| Route/file | Stage 2 classification | Rationale | Required evidence before ship | Assigned owner |
| --- | --- | --- | --- | --- |
| `app/api/authority-forms/sign/[token]/route.ts` | Requires product/security decision | Public signing is intentional, but final authority-link expiry/revocation/audit acceptance is a business/security decision. | Approved public signing policy; token scope/expiry/revocation decision; rate-limit/audit evidence; post-decision API audit output. | Product owner + security owner |
| `app/api/portal/[token]/route.ts` | Approve as intentional public route, pending decision | HMAC token access is the intended client portal sharing model; approval must accept TTL/scope. | Approved token TTL/scope; proof HMAC verification and relation caps remain enforced; rate-limit evidence. | Product owner + security owner |
| `app/api/portal/[token]/pdf/route.ts` | Approve as intentional public route, pending decision | Public completed-report PDF sharing is intentional, but exposure policy must be accepted. | Approved PDF sharing policy; completed-report-only evidence; token expiry evidence. | Product owner + security owner |
| `app/api/invites/[token]/route.ts` | Approve as intentional public route, pending decision | Invite preview/accept must work before account creation; token-shape, expiry, CSRF, and rate-limit safeguards exist. | Approved invite preview fields; token expiry/used-token evidence; CSRF evidence; password policy acceptance. | Product owner + security owner |
| `app/api/portal/invitations/verify/route.ts` | Approve as intentional public route, pending decision | Portal invite preview is pre-auth by design; payload disclosure needs approval. | Approved preview payload; status/expiry/revocation evidence; token-shape evidence. | Product owner + security owner |
| `app/api/portal/invitations/accept/route.ts` | Approve as intentional public route, pending decision | Portal account creation is pre-auth by design; password/account policy needs approval. | Approved public account-creation flow; CSRF origin evidence; transaction/consume-token evidence. | Product owner + security owner |
| `app/api/integrations/oauth/[provider]/callback/route.ts` | Approve as intentional public route, pending decision | OAuth callbacks must be public; one-shot state and provider allowlist are the critical controls. | Provider allowlist evidence; one-shot state/PKCE evidence; generic error redirect evidence. | Security owner + integration owner |
| `app/api/oauth/google-drive/callback/route.ts` | Approve as intentional public route, pending decision | BYOK Google callback must be public during setup; one-shot state, PKCE, and encrypted token storage are the controls. | One-shot state evidence; PKCE verifier evidence; encrypted token persistence evidence. | Security owner + integration owner |
| `app/api/health/route.ts` | Requires product/security decision | Public health is useful for monitors but may expose dependency status and env-var names. | Approve public payload or require bearer-token monitor auth; no-secrets/PII evidence; rate-limit evidence. | Operations owner + security owner |
| `app/api/health/migrations/route.ts` | Requires product/security decision | Public migration health is operationally useful but drift names on failure may disclose deployment detail. | Approve drift payload or restrict behind bearer-token monitor auth; raw SQL safety and no-secrets evidence. | Operations owner + security owner |
| `app/api/properties/scrape/health/route.ts` | Approve as intentional public route, pending decision | Setup wizard readiness probe is public/read-only; final acceptance should confirm setup need. | Approved setup-readiness payload; rate-limit evidence; no upstream or secret exposure evidence. | Product owner + security owner |
| `app/api/inspections/checklists/route.ts` | Approve as intentional public route, pending decision | Static checklist metadata is intended for pre-auth/static contexts. | Approved public metadata fields; static in-repo source evidence; rate-limit evidence. | Product owner + security owner |
| `app/api/contractors/route.ts` | Approve as intentional public route, pending decision | Public contractor directory is a product surface; pagination and visibility filters exist. | Approved public directory fields; `isPubliclyVisible` evidence; pagination cap evidence. | Product owner + security owner |
| `app/api/observability/client-error/route.ts` | Approve as intentional public route, pending decision | Client errors can occur before session; payload caps and field filtering exist. | Approved client log field list; 32 KiB byte cap evidence; non-object rejection evidence. | Engineering owner + security owner |

Stage 2 outcome target:

- either product/security signs off each route as an accepted public exception,
- or selected routes are assigned to a narrow authenticated/bearer-token/rate-limit/token-policy change,
- then the API audit is rerun and the remaining warning state is explicitly accepted or reduced.

## Blocker 2: Vercel Production TLS

Verification commands:

```bash
cd /private/tmp/ra-vercel-env-check
vercel env ls production --scope unite-group
vercel env ls preview --scope unite-group
vercel env ls development --scope unite-group
curl -I https://restoreassist.app
```

Pass criteria:

- `NODE_TLS_REJECT_UNAUTHORIZED` is absent from Production, Preview, and Development.
- production HTTPS returns a successful response.
- no env values or secrets are pulled into repo docs.

If the unsafe variable reappears:

```bash
cd /private/tmp/ra-vercel-env-check
vercel env rm NODE_TLS_REJECT_UNAUTHORIZED production --scope unite-group --yes
```

Do not re-add a process-wide TLS bypass. If an integration fails after removal, use scoped trust, upstream certificate repair, or disable the integration path temporarily.

## Blocker 3: Supabase RLS Live Revalidation

Verification commands:

```bash
supabase db advisors --linked --workdir /private/tmp/ra-supabase-rls-check --type security --level error --fail-on none --output json
supabase db query --linked --workdir /private/tmp/ra-supabase-rls-check --output json
```

Use this table-state query:

```sql
SELECT
  COUNT(*) FILTER (WHERE rowsecurity = false) AS rls_off,
  COUNT(*) FILTER (WHERE rowsecurity = true) AS rls_on
FROM pg_tables
WHERE schemaname = 'public';
```

Pass criteria:

- Supabase security advisor returns no ERROR-level issues.
- public schema table aggregate returns `rls_off=0`.
- anon/public exposure remains limited to the documented public-reference policy set.

If live credential/tooling fails, record the exact error and assign release-day revalidation to the Supabase owner.

## Blocker 4: Mobile Offline Simulator/Device Evidence

Required setup:

- iOS simulator with `xcrun simctl`, or
- Android emulator with `emulator` and `adb`, or
- Expo Go / physical device pointed at the intended API environment.

Pre-check commands:

```bash
pnpm --dir mobile --ignore-workspace type-check
pnpm --dir mobile exec vitest run --config vitest.config.ts
pnpm --dir mobile start
```

Manual evidence checklist:

- clean app launch, account/workspace, API environment, app version, and online state.
- offline mode after network toggle.
- offline job/record creation and queued mutation count.
- offline photo/document evidence or documented unsupported path.
- interrupted sync state.
- stale processing recovery after restart/backgrounding.
- online replay to queue drain.
- server state proving exactly one intended record/evidence item.
- local app refresh showing server-confirmed state.
- duplicate replay/idempotency proof with no data corruption.

If no simulator/device tooling is available in the shell, keep this as a manual blocker and attach the script to the release checklist.

## Blocker 5: Protected PR Template Artifact

`.github/PULL_REQUEST_TEMPLATE.md` remains a protected case-collision artifact.

Stage 2 policy:

- do not stage it.
- do not revert it.
- do not clean it.
- handle it outside this Phase 1 branch.

## Validation Gate

Run after Stage 2 documentation updates:

```bash
pnpm type-check
pnpm lint
pnpm exec vitest run
pnpm build
pnpm audit --audit-level=high --prod
git diff --check
pnpm exec tsx scripts/audit-api-routes.ts --json
pnpm --dir mobile --ignore-workspace type-check
cd mobile && pnpm exec vitest run --config vitest.config.ts
```

## Stop Condition

Stop when every blocker is either:

- closed with evidence,
- or assigned as an external/manual decision with owner, required evidence, and next action.
