# Phase 1 Manual Sign-Off Checklist

Date: 2026-05-25

Worktree: `/private/tmp/RestoreAssist-phase1-main`

Branch: `codex/phase-1-production-readiness-clean`

Source reports read:

- `PHASE_1_EXTERNAL_BLOCKER_HANDOFF.md`
- `PHASE_1_COMPLETION_REPORT.md`
- `FINAL_SHIPIT_READINESS_REPORT.md` was requested but is not present in this checkout.

Current local evidence:

- API audit: 442 routes, 0 errors, 14 warnings.
- Remaining warning rule: `public-token-route-review`.
- Env audit: 0 findings.
- Vercel Production env listing no longer includes `NODE_TLS_REJECT_UNAUTHORIZED`.
- Supabase live security advisor recheck returned `No issues found`.
- Mobile local validation is green, but real simulator/device validation remains open.

## 1. Public Route Exception Review

Required decision values: `approve`, `fix`, `restrict`, `rate-limit`, or `document exception`.

| Route/file | Warning category | Why it remains public or unresolved | Required decision | Required evidence | Sign-off owner | Decision status |
| --- | --- | --- | --- | --- | --- | --- |
| `app/api/authority-forms/sign/[token]/route.ts` | Public token/signing link | External signatories must open authority-form signing links without a RestoreAssist account. | Approve public signing link, fix token expiry/revocation, restrict access, or document exception. | Owner-approved public signing policy; token scope/expiry/revocation decision; audit/rate-limit evidence; post-decision API audit output. | Product owner + security owner | Pending |
| `app/api/portal/[token]/route.ts` | Public token portal link | Client portal report summary is shared by signed inspection token. | Approve HMAC token access, restrict scope/TTL, require auth, or document exception. | Approved TTL/scope; evidence HMAC verification remains enforced; rate-limit evidence; post-decision API audit output. | Product owner + security owner | Pending |
| `app/api/portal/[token]/pdf/route.ts` | Public token portal PDF | Completed inspection PDF is shared through a signed inspection token. | Approve public PDF link, restrict TTL/scope, require auth, or document exception. | Approved PDF sharing policy; completed-report-only evidence; token expiry evidence; post-decision API audit output. | Product owner + security owner | Pending |
| `app/api/invites/[token]/route.ts` | Public token invitation | Team invite preview/accept must work before an invitee has a session. | Approve invite flow, fix disclosure/password policy, restrict fields, or document exception. | Approved invite preview fields; token-shape/expiry/used-token evidence; CSRF evidence on POST; post-decision API audit output. | Product owner + security owner | Pending |
| `app/api/portal/invitations/verify/route.ts` | Public token portal invitation | Client portal invite preview must work before account creation. | Approve preview disclosure, restrict returned fields, require alternate auth, or document exception. | Approved preview payload; status/expiry/revocation evidence; token-shape evidence; post-decision API audit output. | Product owner + security owner | Pending |
| `app/api/portal/invitations/accept/route.ts` | Public token portal invitation | Client portal account creation must work before the client has an account. | Approve public account creation, fix password/account policy, restrict flow, or document exception. | Approved 8-character password policy or fix decision; CSRF origin evidence; transaction/consume-token evidence; post-decision API audit output. | Product owner + security owner | Pending |
| `app/api/integrations/oauth/[provider]/callback/route.ts` | OAuth callback | Third-party OAuth providers redirect to a public callback before app session context is available. | Approve OAuth callback exception, fix redirect disclosure, restrict providers, or document exception. | Provider allowlist evidence; one-shot state/PKCE evidence; generic error redirect evidence; post-decision API audit output. | Security owner + integration owner | Pending |
| `app/api/oauth/google-drive/callback/route.ts` | OAuth callback | Google Drive BYOK OAuth setup requires a public provider callback. | Approve callback exception, fix setup error codes, restrict flow, or document exception. | One-shot OAuth state evidence; PKCE verifier evidence; encrypted token persistence evidence; post-decision API audit output. | Security owner + integration owner | Pending |
| `app/api/health/route.ts` | Public monitoring/setup probe | External uptime monitors need unauthenticated liveness/dependency status. | Approve public health payload, restrict details, require bearer-token monitoring auth, or document exception. | Approved payload fields; proof no secrets/PII returned; rate-limit evidence; post-decision API audit output. | Operations owner + security owner | Pending |
| `app/api/health/migrations/route.ts` | Public monitoring/setup probe | External deployment/migration drift monitors need unauthenticated migration health. | Approve migration-name disclosure, restrict failure details, require bearer-token monitoring auth, or document exception. | Approved drift payload policy; no-secrets evidence; raw SQL safety evidence; post-decision API audit output. | Operations owner + security owner | Pending |
| `app/api/properties/scrape/health/route.ts` | Public monitoring/setup probe | Setup wizard probes scraper readiness before property-data configuration is complete. | Approve unauthenticated setup probe, restrict to authenticated setup, rate-limit, or document exception. | Approved setup-readiness payload; rate-limit evidence; no upstream/secret exposure evidence; post-decision API audit output. | Product owner + security owner | Pending |
| `app/api/inspections/checklists/route.ts` | Public monitoring/static metadata | Public IICRC checklist metadata supports pre-auth/static setup screens. | Approve public static metadata, restrict route, rate-limit, or document exception. | Approved public metadata fields; static in-repo source evidence; rate-limit evidence; post-decision API audit output. | Product owner + security owner | Pending |
| `app/api/contractors/route.ts` | Public directory metadata | Public contractor directory must be browsable without account login. | Approve public directory fields, restrict fields/filters, rate-limit, or document exception. | Approved profile/search fields; `isPubliclyVisible` evidence; pagination cap evidence; post-decision API audit output. | Product owner + security owner | Pending |
| `app/api/observability/client-error/route.ts` | Client observability sink | Client error boundaries may fire before a user session exists. | Approve public log sink, restrict payload, rate-limit, or document exception. | Approved client log field list; 32 KiB byte cap evidence; non-object JSON rejection evidence; post-decision API audit output. | Engineering owner + security owner | Pending |

Public route sign-off is incomplete until every row above has a named owner, a recorded decision, evidence attached, and either a code/config change or an approved exception record.

## 2. Mobile Offline Device Validation

Run on a configured iOS simulator, Android emulator, Expo Go session, or physical device pointed at the intended API environment.

Pre-check commands from `/private/tmp/RestoreAssist-phase1-main`:

```bash
pnpm --dir mobile --ignore-workspace type-check
pnpm --dir mobile exec vitest run --config vitest.config.ts
pnpm --dir mobile start
```

Then launch with one platform path:

```bash
pnpm --dir mobile ios
pnpm --dir mobile android
```

Device/simulator script:

1. Clean app launch
   - Install or clear app data so the queue starts from a known state.
   - Launch the app online.
   - Sign in or load the intended test account.
   - Confirm Settings shows `Network Status: Online`.
   - Capture screenshot/log of app version, API environment, user/workspace, and online state.

2. Create offline job/record
   - Navigate to inspection/job capture.
   - Disable network access with airplane mode, simulator network conditioning, emulator network controls, or physical device network toggle.
   - Confirm the offline banner appears and Settings shows `Offline`.
   - Create or update an inspection/job record while offline.
   - Required evidence: screenshot/log showing queued mutation count increases and the record is visible locally.

3. Add photo/document evidence offline
   - While still offline, add photo evidence.
   - Add document evidence if the build supports document capture in the mobile flow; otherwise record the unsupported path explicitly.
   - Required evidence: screenshot/log of queued evidence items and local metadata, including filename/type where visible.

4. Force interrupted sync
   - Re-enable network briefly until replay begins.
   - Interrupt the network before sync completes.
   - Required evidence: screenshot/log showing pending or retrying queue state, with no duplicate local records.

5. Recover stale processing rows
   - Leave one queued item in processing/retry state by interrupting sync.
   - Background and foreground the app, or restart the app.
   - Reopen the queue/sync status.
   - Required evidence: stale processing item returns to pending/retryable state or is marked failed according to the implemented policy.

6. Replay queue when online
   - Restore stable network access.
   - Wait for `/api/health` reachability to flip the app online.
   - Allow the queue to drain.
   - Required evidence: screenshot/log showing queue count reaches zero or only expected failed conflict rows remain.

7. Confirm server state
   - In the web app, database console, API response, or server logs, confirm the offline-created job/record exists exactly once.
   - Confirm photo/document evidence exists exactly once, with expected metadata and storage reference.
   - Required evidence: server-side record IDs, evidence IDs, timestamps, and count query/API output proving no duplicate rows.

8. Confirm local app refresh
   - Pull to refresh or reopen the inspection/job in the mobile app.
   - Required evidence: screenshot/log showing server-confirmed data is reflected locally after replay.

9. Confirm duplicate replay does not corrupt data
   - Retry the same queued mutation/replay path by restarting the app or replaying the same mutation ID if a test hook exists.
   - Confirm server idempotency returns the prior result or a safe conflict response.
   - Required evidence: no duplicate server rows, no shifted evidence metadata, and failed conflict rows do not replay repeatedly.

Mobile sign-off is incomplete until screenshots/logs and server evidence prove the full script above on at least one configured target device or simulator.

## 3. Production Environment Verification

### Vercel TLS

Required final verification:

```bash
vercel env ls production --scope unite-group
vercel env ls preview --scope unite-group
vercel env ls development --scope unite-group
curl -I https://restoreassist.app
```

Pass criteria:

- `NODE_TLS_REJECT_UNAUTHORIZED` is absent from Production, Preview, and Development.
- `https://restoreassist.app` returns a successful HTTPS response.
- No secrets are printed or copied into sign-off artifacts.

Rollback notes:

- Do not re-add `NODE_TLS_REJECT_UNAUTHORIZED`.
- If an integration fails due to TLS validation, roll forward with scoped trust for that integration or temporarily disable the affected integration path.

Decision status: Pending final release-day verification.

### Supabase Live RLS

Required final verification:

```bash
supabase db advisors --linked --workdir /private/tmp/ra-supabase-rls-check --type security --level error --fail-on none --output json
```

Optional table-state query if credentialed DB query access is available:

```sql
SELECT
  COUNT(*) FILTER (WHERE rowsecurity = false) AS rls_off,
  COUNT(*) FILTER (WHERE rowsecurity = true) AS rls_on
FROM pg_tables
WHERE schemaname = 'public';
```

Pass criteria:

- Security advisor returns no ERROR-level findings.
- If the table-state query is run, `rls_off = 0`.
- Any drift table is repaired through a migration or documented emergency change with follow-up migration.

Rollback notes:

- Do not blanket-disable RLS.
- Roll forward with corrected policies or table-specific RLS enablement.

Decision status: Pending final release-day revalidation.

### Env Audit

Required final verification:

```bash
pnpm exec tsx scripts/audit-env.ts --json
```

Pass criteria:

- `errorCount = 0`.
- `warningCount = 0`.
- No executable/deploy-config `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- No public service-role env names.

Rollback notes:

- Revert only the offending env/config change.
- Keep `.env.example` aligned without adding secrets.

Decision status: Pending final release-day verification.

## 4. Ship Decision

Choose exactly one final decision after completing the checklist.

### SHIP

Use only if:

- All 14 public route rows are approved, fixed, restricted, rate-limited, or documented with accepted exceptions.
- Mobile offline device/simulator validation has complete evidence.
- Vercel TLS final verification passes.
- Supabase live RLS final verification passes.
- Env audit final verification passes.
- Full validation gate from `PHASE_1_EXTERNAL_BLOCKER_HANDOFF.md` passes.

Decision status: Not selected.

### SHIP WITH KNOWN EXTERNAL BLOCKERS

Use only if:

- A business owner explicitly accepts unresolved public-route and/or mobile-device risk.
- The unresolved blocker list is attached to the release record.
- Rollback owner and monitoring owner are named.
- `/shipit` is not presented as fully green.

Decision status: Not selected.

### DO NOT SHIP

Use if:

- Any public-route decision remains pending.
- Mobile offline device/simulator validation evidence is missing.
- Vercel TLS, Supabase RLS, or env audit final verification fails.
- Full validation gate fails.

Decision status: Current default.

