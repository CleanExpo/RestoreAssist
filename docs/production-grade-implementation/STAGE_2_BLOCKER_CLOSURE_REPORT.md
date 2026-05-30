# Stage 2 Blocker Closure Report

Date: 2026-05-25

Worktree: `/private/tmp/RestoreAssist-phase1-main`

Branch: `codex/phase-1-production-readiness-clean`

## Status

- Stage 2 branch: `codex/phase-1-production-readiness-clean`
- Public route decisions: assigned to product/security sign-off; no warnings suppressed and no route behavior changed.
- Vercel TLS result: closed with current live env-name evidence; `NODE_TLS_REJECT_UNAUTHORIZED` is absent from Production, Preview, and Development.
- Supabase RLS result: mostly closed with current live advisor and table-state evidence; anon-policy live listing hit a Supabase temp-role auth circuit breaker and remains a release-day verification item.
- Mobile offline evidence: not available in this shell; assigned as manual simulator/device validation.
- Validation: PASS for the Stage 2 gate listed below.
- Remaining blockers: public-route owner decisions, mobile simulator/device evidence, Supabase anon-policy live listing/release-day recheck, protected PR template artifact outside this branch.
- PR readiness: still ready for review as Phase 1 production-readiness hardening.
- Ship readiness: not approved; recommended current decision remains `DO NOT SHIP`.
- Next safe action: complete owner sign-offs and mobile device evidence, then rerun final validation before any release-candidate decision.

## Public Route Decisions

The 14 API audit warnings remain visible and intentional. Current audit output:

- routes scanned: 442
- errors: 0
- warnings: 14
- warning rule: `public-token-route-review`

No public-route behavior was changed in Stage 2 because all remaining findings require product/security acceptance rather than an obvious code-only fix.

| Route/file | Stage 2 decision | Closure status |
| --- | --- | --- |
| `app/api/authority-forms/sign/[token]/route.ts` | Requires product/security decision for public signing policy, expiry/revocation, and audit expectations. | Assigned |
| `app/api/portal/[token]/route.ts` | Approve as intentional public HMAC-token route, pending TTL/scope acceptance. | Assigned |
| `app/api/portal/[token]/pdf/route.ts` | Approve as intentional public completed-report PDF route, pending sharing-policy acceptance. | Assigned |
| `app/api/invites/[token]/route.ts` | Approve as intentional public invite route, pending preview/password/CSRF acceptance. | Assigned |
| `app/api/portal/invitations/verify/route.ts` | Approve as intentional public portal-invite preview route, pending disclosure acceptance. | Assigned |
| `app/api/portal/invitations/accept/route.ts` | Approve as intentional public portal account-creation route, pending password/account-policy acceptance. | Assigned |
| `app/api/integrations/oauth/[provider]/callback/route.ts` | Approve as intentional public OAuth callback, pending provider/state/redirect acceptance. | Assigned |
| `app/api/oauth/google-drive/callback/route.ts` | Approve as intentional public Google Drive OAuth callback, pending state/PKCE/token-storage acceptance. | Assigned |
| `app/api/health/route.ts` | Requires operations/security decision: leave public or restrict behind bearer-token monitoring auth. | Assigned |
| `app/api/health/migrations/route.ts` | Requires operations/security decision: leave public or restrict drift details behind bearer-token monitoring auth. | Assigned |
| `app/api/properties/scrape/health/route.ts` | Approve as intentional public setup-readiness probe, pending payload acceptance. | Assigned |
| `app/api/inspections/checklists/route.ts` | Approve as intentional public static metadata route, pending field acceptance. | Assigned |
| `app/api/contractors/route.ts` | Approve as intentional public directory route, pending field/filter acceptance. | Assigned |
| `app/api/observability/client-error/route.ts` | Approve as intentional public client-error sink, pending field-list and payload-cap acceptance. | Assigned |

Required evidence before ship:

- named owner for every row.
- recorded decision for every row: approve, restrict, rate-limit, token-policy change, audit-log change, or documented exception.
- approved exception artifact or reviewed code/config changes.
- post-decision `pnpm exec tsx scripts/audit-api-routes.ts --json`.

## Vercel TLS Result

Live Vercel env-name checks were run from the already linked temp directory `/private/tmp/ra-vercel-env-check` so repo metadata was not changed.

Commands run:

```bash
vercel env ls production --scope unite-group
vercel env ls preview --scope unite-group
vercel env ls development --scope unite-group
curl -I https://restoreassist.app
```

Result:

- `NODE_TLS_REJECT_UNAUTHORIZED` is absent from Production.
- `NODE_TLS_REJECT_UNAUTHORIZED` is absent from Preview.
- `NODE_TLS_REJECT_UNAUTHORIZED` is absent from Development.
- `https://restoreassist.app` returned `HTTP/2 200`.
- no Vercel env values were pulled or printed into this report.

Closure status: closed for current Stage 2 evidence. Release ownership must still decide not to re-add the process-wide TLS bypass before ship.

Recommended fix if the variable reappears:

```bash
cd /private/tmp/ra-vercel-env-check
vercel env rm NODE_TLS_REJECT_UNAUTHORIZED production --scope unite-group --yes
```

Rollback notes:

- do not roll back by re-adding `NODE_TLS_REJECT_UNAUTHORIZED`.
- roll forward with scoped trust, upstream certificate repair, or temporary integration disablement if a provider fails TLS validation.

## Supabase RLS Result

Commands run:

```bash
supabase db advisors --linked --workdir /private/tmp/ra-supabase-rls-check --type security --level error --fail-on none --output json
```

Result:

- advisor returned `No issues found`.

Live table-state query run:

```sql
SELECT
  COUNT(*) FILTER (WHERE rowsecurity = false) AS rls_off,
  COUNT(*) FILTER (WHERE rowsecurity = true) AS rls_on
FROM pg_tables
WHERE schemaname = 'public';
```

Result:

- `rls_off=0`
- `rls_on=198`

Anon/public exposure status:

- code evidence confirms anon/public exposure is intentionally limited to the documented public-reference policy set from `20260518_enable_rls_phase_1_close_anon_exposure.sql`.
- the migration creates `anon_select` policies for 12 documented public reference tables only.
- `RA-4970_RLS_VALIDATION_REPORT.md` records prior live `anon_select_policies=12`.

Live anon-policy listing gap:

Error:

```text
failed SASL auth / ECIRCUITBREAKER too many authentication failures
Connect to your database by setting the env var correctly: SUPABASE_DB_PASSWORD
```

Cause: the second Supabase live query attempted to initialise a temp login role and then hit a Supabase temp-role authentication circuit breaker.

Fix: rerun the anon-policy listing after the Supabase auth breaker clears or provide `SUPABASE_DB_PASSWORD` through an approved secret-handling path.

Next action: release-day Supabase owner reruns advisor, RLS aggregate, and anon-policy listing. Treat any `rls_off > 0` or unexpected anon policy as `DO NOT SHIP`.

Closure status: RLS table enablement and advisor are currently green; anon-policy live listing remains assigned as a manual release-day revalidation item.

## Mobile Offline Evidence

Local mobile validation remains available, but simulator/device validation could not be run in this shell.

Tooling checks:

- `xcrun simctl list devices available`: failed because `simctl` is unavailable.
- `emulator`: not on `PATH`.
- `adb`: not on `PATH`.
- `ANDROID_HOME`: empty.
- `ANDROID_SDK_ROOT`: empty.

Closure status: assigned as manual simulator/device blocker.

Required setup:

- iOS simulator with `xcrun simctl`, Android emulator with `emulator` and `adb`, Expo Go, or a physical device.
- target API environment configured for test account/workspace.

Required evidence:

- clean app launch.
- offline job/record creation.
- offline photo/document evidence or unsupported-path note.
- interrupted sync.
- stale processing recovery.
- replay queue when online.
- server state proving exactly one intended record/evidence item.
- local app refresh after replay.
- duplicate replay/idempotency proof.

## Protected PR Template Artifact

`.github/PULL_REQUEST_TEMPLATE.md` remains the only protected dirty tracked file and was not staged, committed, reverted, cleaned, or edited by Stage 2.

Closure status: assigned outside this branch.

## Validation

Stage 2 validation results:

| Gate | Result | Notes |
| --- | --- | --- |
| `pnpm type-check` | PASS | Root TypeScript check passed. |
| `pnpm lint` | PASS | 0 errors, 838 warnings. Existing lint warning debt remains visible. |
| `pnpm exec vitest run` | PASS | 237 files passed / 16 skipped; 1887 tests passed / 81 skipped. |
| `pnpm build` | PASS | Next build completed. Known build warnings remained non-fatal: unsupported Next config `eslint`, deprecated middleware convention, dashboard stats dynamic server usage during static generation, and invalid help fixture frontmatter. |
| `pnpm audit --audit-level=high --prod` | PASS | High-severity gate passed; pnpm reported 3 moderate vulnerabilities. |
| `git diff --check` | PASS | No whitespace errors. |
| `pnpm exec tsx scripts/audit-api-routes.ts --json` | PASS | 442 routes, 0 errors, 14 warnings. |
| `pnpm --dir mobile --ignore-workspace type-check` | PASS | Standalone mobile TypeScript path passed. |
| `cd mobile && pnpm exec vitest run --config vitest.config.ts` | PASS | 2 files / 7 tests. |

## Remaining Blockers

1. Public-route sign-off decisions for 14 warnings.
2. Mobile offline simulator/device evidence.
3. Supabase anon-policy live listing and release-day RLS revalidation after the auth breaker clears.
4. Protected `.github/PULL_REQUEST_TEMPLATE.md` case-collision artifact outside this branch.

## PR Readiness

Ready for review as Phase 1 production-readiness hardening with Stage 2 blocker-closure evidence attached.

## Ship Readiness

Not approved. Recommended current decision remains **DO NOT SHIP** until manual blockers are fully evidenced and final validation is rerun.

## Next Safe Action

Assign owners for the 14 public route decisions and run the mobile offline script on a configured simulator/device. After the Supabase auth breaker clears, rerun the anon-policy listing and final release-day checks.
