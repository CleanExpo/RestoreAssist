# Phase 1 PR Summary

Date: 2026-05-25

Branch: `codex/phase-1-production-readiness-clean`

Base: `main` at `8c216f79f6431c2cd2ca6c4a371ff1c5e307e44a`

## Recommended PR Title

Phase 1 Production Readiness Hardening - Not Ship Approval

## Summary

This PR hardens RestoreAssist Phase 1 production-readiness surfaces across API security, mobile offline reliability, durable serverless state, upload/evidence-chain safety, Supabase RLS, Vercel TLS environment hygiene, and release documentation.

This PR is **not ship approval**. The branch is ready for review, but full production ship remains blocked pending manual public-route exception sign-off and real mobile simulator/device validation.

## Commits Included

Key commit groups included in this branch:

- Recovery and baseline: `c3050c99`, `5769c28f`, `4ac0ec21`, `472ea7ab`, `f52052b7`, `ae2f1c11`
- API audit and route hardening: `6d805ab7` through `656ce6a2`, plus subsequent API warning-reduction and response-leak commits through `e92c50b7`
- Public route hardening and exception review: `28fe8efe`, `72683a57`, `f328cea6`, `d7ca801d`, `b163d05e`, `590df75e`, `1c80ae3f`
- Durable idempotency/rate limiting/offline capture: `1f3b9894`, `1d91f0df`, `711b3512`, `ed9c3618`, `449f2e05`, `35752e5a`
- Mobile offline and validation path: `17acdf46`, `5769c28f`, `32bc9183`, `1f661b19`, `9c558b60`, `aa352d23`, `e303d9b2`
- Voice/report/upload/evidence hardening: `fc7bd1ee`, `4be0fb2e`, `55350ff9`, `313a56b1`, `efe8dcce`, `37d83c39`
- Supabase RLS and Vercel TLS: `85ccec29`, `13685e9d`, `17c59e81`, `2fc63ce4`
- Final validation/reporting package: `31560933`, `6c6cb5b1`, plus current uncommitted docs `PHASE_1_MANUAL_SIGNOFF_CHECKLIST.md` and `FINAL_SHIPIT_READINESS_REPORT.md`

Full range:

```bash
git log --oneline main..codex/phase-1-production-readiness-clean
```

## Production Risks Reduced

- API route audit gate now tracks auth, DB-admin role revalidation, query bounds, raw SQL safety, generic 500 policy, and public token route review.
- Audit error count was reduced to 0; remaining 14 findings are documented public-route review warnings.
- Admin impersonation/business/admin tenancy flows now revalidate DB role instead of trusting stale JWT claims in hardened paths.
- Many `findMany`/bulk/list routes now have explicit caps, ordering, or aggregate-based implementations.
- Runtime DDL paths were removed from app routes in favor of migrations.
- AI/provider/integration failure paths no longer echo raw provider, parser, env-var, Supabase, Prisma, or exception details to clients across many routes.
- Public client-error sink now has byte-count enforcement and bounded fields.
- Public token/callback/portal/invite routes have token-shape prechecks, rate limits, bounded reads, or CSRF where safe without product decisions.
- Shared `applyRateLimit` persists route throttle hits in Prisma for serverless multi-instance safety.
- JSON mutation replay uses durable Prisma-backed idempotency records.
- Multipart photo uploads use idempotency fingerprints to avoid duplicate evidence on replay.
- Mobile offline queue supports durable local queue behavior, retry/fail-fast handling, API reachability state, and server-side mutation ledger integration.
- Voice copilot sessions moved from process-local memory to Prisma-backed persistence.
- Canonical image upload and Vision sketch import share magic-byte validation.
- Evidence batch upload pairing no longer shifts metadata after partial failures.
- Supabase RLS drift was repaired for `XeroSyncStatus`; latest evidence records `rls_off=0` and no security advisor issues.
- Vercel Production `NODE_TLS_REJECT_UNAUTHORIZED` was removed, production was redeployed, and repo env audit is green.

## Validation Passed

Latest recorded broad validation:

- `pnpm exec vitest run`: PASS, 237 files passed / 16 skipped, 1887 tests passed / 81 skipped
- `pnpm type-check`: PASS
- `pnpm lint`: PASS with 0 errors and 838 warnings
- `pnpm build`: PASS
- `pnpm audit --audit-level=high --prod`: PASS for high-severity gate, with 3 moderate findings
- `git diff --check`: PASS

Latest focused/release-readiness validation:

- `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts`: PASS
- `pnpm exec tsx scripts/audit-api-routes.ts --json`: 442 routes, 0 errors, 14 warnings
- `pnpm exec tsx scripts/audit-env.ts --json`: 0 findings
- `pnpm --dir mobile --ignore-workspace type-check`: PASS
- `pnpm --dir mobile exec vitest run --config vitest.config.ts`: PASS, 2 files / 7 tests

External verification recorded:

- Vercel Production/Preview/Development env listings no longer include `NODE_TLS_REJECT_UNAUTHORIZED`.
- Production was redeployed after removal and `https://restoreassist.app` returned `HTTP/2 200`.
- Supabase live RLS aggregate after repair returned `rls_off=0`, `rls_on=198`, `anon_select_policies=12`.
- Supabase security advisor returned `No issues found`.

## Remaining Blockers

- Public route exception sign-off is incomplete for 14 `public-token-route-review` warnings.
- Mobile offline simulator/device validation is incomplete; local tooling lacks usable `simctl`, `emulator`, `adb`, and Android SDK env paths.
- Final release-day Vercel TLS, Supabase RLS, and env audit checks must be rerun before any ship decision.
- Protected `.github/PULL_REQUEST_TEMPLATE.md` case-collision artifact remains dirty and must not be staged with this PR package.

## Files Changed By Category

### API Routes

- Hardened admin, AI, auth, authority forms, claims, contractors, cron, estimates, health, inspections, integrations, invites, invoices, Margot, observability, pilot, portal, progress, reports, setup, support, upload, vision, and webhook route groups.
- Main themes: generic client errors, bounded Prisma reads, public token/callback rate limits, raw SQL safety, idempotent replay, and admin/tenant revalidation.

### Tests

- Added/updated focused Vitest coverage for API audit, env audit, idempotency, rate limiter, public token shape, image upload validation, auth tenancy, integration error handling, AI response-leak paths, invite token hardening, evidence/photo idempotency, and mobile offline/reachability behavior.

### Prisma And Supabase

- Added additive migrations/models for `VoiceCopilotSession`, `VoiceCopilotObservation`, `IdempotencyRecord`, `RateLimitHit`, `ClientMutation`, and `FieldCaptureEvent`.
- Added Supabase RLS drift repair migration for `XeroSyncStatus`.

### Mobile

- Added standalone mobile validation path, mobile lockfile, TS config fixes, offline queue tests, reachability helpers, conflict fail-fast handling, local queue state wiring, and API contract cleanup.

### Libraries

- Added or updated shared idempotency, rate limiting, media validation, public token shape, Margot tool-error mapping, integration sync-error mapping, upload queue, voice persistence, and tenancy helpers.

### Scripts And Tooling

- Added advisory API route audit and forbidden env audit scripts with tests.
- Repaired Codex stop verifier hook portability.

### Documentation And Release Readiness

- Added recovery, checkout-state, RLS, Vercel TLS, mobile validation, public route exception, mobile device blocker, external blocker handoff, manual sign-off, final readiness, and Phase 1 progress/completion reports.

## Manual Sign-Off Required Before Ship

Required before full production ship:

- Complete every row in `PHASE_1_MANUAL_SIGNOFF_CHECKLIST.md`.
- Public route sign-off: each of the 14 public-route warnings must be approved, fixed, restricted, rate-limited, or documented as an accepted exception.
- Mobile offline device validation: run the documented script on a configured simulator/device and attach screenshots/logs plus server-state evidence.
- Vercel TLS final verification: confirm `NODE_TLS_REJECT_UNAUTHORIZED` remains absent from Production/Preview/Development and production HTTPS is healthy.
- Supabase RLS final verification: rerun live security advisor and, where available, table RLS aggregate.
- Env audit final verification: rerun local forbidden-env audit.
- Rerun the full validation gate after sign-off.

## Recommended PR Body

```markdown
## Summary

Phase 1 production-readiness hardening across API route security, durable serverless state, mobile offline reliability, uploads/evidence-chain safety, Supabase RLS, Vercel TLS env hygiene, and release readiness documentation.

This PR is **not ship approval**. RestoreAssist remains **not approved for full production ship** until the manual sign-off checklist is complete.

## Major risk reductions

- Added advisory API and env audit gates.
- Reduced API audit to 442 routes / 0 errors / 14 public-route warnings.
- Hardened auth/admin/tenant checks, query caps, raw SQL usage, and client-facing 500 bodies.
- Added durable idempotency, durable shared route rate limiting, mutation ledger models, and voice session persistence.
- Hardened mobile offline queue replay, conflict handling, and reachability state.
- Added shared image magic-byte validation and multipart photo replay dedupe.
- Repaired Supabase RLS drift and removed Vercel production TLS bypass env.

## Validation

- `pnpm exec vitest run` PASS
- `pnpm type-check` PASS
- `pnpm lint` PASS with 0 errors and known warnings
- `pnpm build` PASS
- `pnpm audit --audit-level=high --prod` PASS for high-severity gate
- `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS: 442 routes / 0 errors / 14 warnings
- `pnpm exec tsx scripts/audit-env.ts --json` PASS: 0 findings
- mobile type-check and mobile Vitest PASS

## Remaining blockers before ship

- Product/security sign-off for 14 public-route exceptions.
- Mobile offline simulator/device validation evidence.
- Release-day Vercel TLS, Supabase RLS, env audit, and full validation rerun.

## Decision

Recommended current decision: **DO NOT SHIP** until manual sign-off items are complete.
```

## Reviewer Checklist

- Confirm this PR is reviewed as Phase 1 hardening, not `/shipit`.
- Confirm `.github/PULL_REQUEST_TEMPLATE.md` is not staged or included.
- Review API audit scanner logic and current 14-warning state.
- Review public route hardening and sign-off docs for all 14 warning routes.
- Review admin role revalidation and tenant helper changes.
- Review query caps, aggregate replacements, and raw SQL safety changes.
- Review generic error-response changes for API compatibility.
- Review durable idempotency and rate-limit models/migrations.
- Review mobile offline queue, mutation ledger, conflict fail-fast, and reachability changes.
- Review upload/evidence-chain idempotency, magic-byte validation, and batch metadata pairing.
- Review voice session persistence migration and lifecycle behavior.
- Review Supabase RLS drift repair migration and evidence.
- Review Vercel TLS env removal evidence and rollback guidance.
- Confirm validation commands and results are acceptable.
- Confirm remaining manual sign-off checklist is understood before any ship decision.

