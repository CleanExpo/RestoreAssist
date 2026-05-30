# API Public Route Exception Review Report

Date: 2026-05-25

Worktree: `/private/tmp/RestoreAssist-phase1-main`

Branch: `codex/phase-1-production-readiness-clean`

## Scope

This report covers the remaining Priority 4 API audit findings after the high-confidence auth, raw SQL, response leakage, and unbounded Prisma query fixes.

Current audit state:

- Routes scanned: 442
- Error findings: 0
- Warning findings: 14
- Remaining warning rule: `public-token-route-review`

The scanner is intentionally still reporting these warnings. They are not suppressed because final acceptance requires route-specific product/security sign-off that each unauthenticated surface is intended, scoped, rate-limited, and operationally acceptable.

## Reviewed Warning Categories

| Category | Count | Status |
| --- | ---: | --- |
| Public token/signing links | 6 | Token-shape prechecks added where clear; requires owner sign-off |
| OAuth callbacks | 2 | One-shot state/PKCE flows; requires owner sign-off |
| Public monitoring/setup probes | 4 | Rate-limited/read-only; requires owner sign-off |
| Public directory metadata | 1 | Rate-limited and paginated; requires owner sign-off |
| Client observability sink | 1 | Rate-limited and payload-bounded; requires owner sign-off |

## Route Review Matrix

| Route | Why public | Current safeguards | Remaining decision |
| --- | --- | --- | --- |
| `app/api/authority-forms/sign/[token]/route.ts` | External signatories must open authority-form signing links without a RestoreAssist account. | UUID-shaped token precheck, per-IP rate limits for preview/sign, single-record token lookup, already-signed guard, atomic `updateMany` sign operation, sibling signature list capped at 25, shared client-IP capture. | Confirm authority-form signature links may remain public and whether token expiry/revocation policy is sufficient. |
| `app/api/portal/[token]/route.ts` | Client portal report summary is shared by signed inspection token. | HMAC token verification with expiry via `verifyPortalToken`, per-IP rate limit, affected-area and scope-item caps, exact count/aggregate summaries, generic 500 response. | Confirm HMAC token TTL/scope is acceptable for client report summary access. |
| `app/api/portal/[token]/pdf/route.ts` | Client-facing completed inspection PDF is shared by signed inspection token. | HMAC token verification with expiry, per-IP rate limit, completed-report gate, relation caps for moisture/areas/scope, aggregate summaries. | Confirm public PDF link policy, TTL, and completed-report-only exposure are acceptable. |
| `app/api/invites/[token]/route.ts` | Team invite preview/accept must work before the invitee has an account/session. | Per-IP preview/accept rate limits, 24-byte hex token-shape precheck before lookup, expiry/used-token checks, CSRF validation on POST, 12-character password minimum for email path, AU mobile validation, headshot magic-byte and size validation, invite consumed after account creation. | Confirm invite preview fields and public acceptance flow remain acceptable. |
| `app/api/portal/invitations/verify/route.ts` | Client portal invite preview must work before a client account exists. | Per-IP rate limit, Prisma cuid token-shape precheck before lookup, status/expiry/revocation checks, returns limited client/contractor display fields. | Confirm preview disclosure is acceptable. |
| `app/api/portal/invitations/accept/route.ts` | Client portal account creation must work before a client account exists. | Per-IP rate limit, CSRF origin validation, required token/password/name validation, Prisma cuid token-shape precheck before lookup, invitation status/expiry/revocation checks, single client-user existence guard, transaction for account creation and invite acceptance. | Confirm 8-character password policy and public account creation flow. |
| `app/api/integrations/oauth/[provider]/callback/route.ts` | Third-party OAuth providers redirect to a public callback before app session context is available in the request. | Provider allowlist, per-IP rate limit, one-shot DB-backed OAuth state validation, stored code verifier usage, generic token-exchange failure redirect. | Confirm OAuth callback public exception and redirect error disclosure policy. |
| `app/api/oauth/google-drive/callback/route.ts` | Google Drive BYOK OAuth redirects to a public callback during setup. | Per-IP rate limit, one-shot OAuth state validation, provider check, PKCE verifier lookup, encrypted token persistence, generic token-exchange failure redirect. | Confirm Google Drive setup callback public exception and setup error codes. |
| `app/api/health/route.ts` | External uptime monitors need unauthenticated liveness/dependency status. | Per-IP rate limit, cached DB probe, raw SQL uses `Prisma.sql`, no secrets returned, only missing env-var names and status data. | Confirm public health payload detail is acceptable for production monitors. |
| `app/api/health/migrations/route.ts` | External deployment/migration drift monitors need unauthenticated migration health. | Per-IP rate limit, raw SQL uses `Prisma.sql`, no PII/secrets, healthy response has fixed-size counts, drift names returned only on failure. | Confirm public migration-name disclosure is acceptable or restrict to bearer-token monitor. |
| `app/api/properties/scrape/health/route.ts` | Setup wizard probes scraper readiness before property-data configuration is complete. | Optional per-IP rate limit when called with a request, no upstream call, no secrets, returns only configured/degraded status. | Confirm unauthenticated setup probe remains required. |
| `app/api/inspections/checklists/route.ts` | Public IICRC checklist metadata supports pre-auth/static setup screens. | Per-IP rate limit, static in-repo metadata only, returns checklist ID/name/category/description/item count. | Confirm checklist metadata is intentionally public. |
| `app/api/contractors/route.ts` | Public contractor directory must be browsable without account login. | Per-IP rate limit, `isPubliclyVisible` filter, explicit select/include scope, page/limit clamp to 1..50, deterministic ranking. | Confirm directory search/filter fields and public profile fields are acceptable. |
| `app/api/observability/client-error/route.ts` | Client error boundaries may fire before a user session exists. | Per-IP rate limit, 32 KiB cap enforced by both content-length precheck and actual body byte count, invalid/non-object JSON rejection, logged client fields limited to expected keys and 2,000 characters each. | Confirm public log sink remains acceptable. |

## Why Warnings Remain

The remaining warnings are not evidence of missing route authentication bugs by themselves. They are manual-review prompts for routes that are public by product design or platform contract.

The scanner should keep reporting them until one of these happens:

1. Product/security owners approve each public exception and the approval is encoded in a reviewed exception registry.
2. A route is changed to require authentication, bearer-token monitoring auth, or a different scoped access mechanism.
3. The feature using the public route is removed.

## Blocker Status

Priority 4 high-confidence code remediation is complete for the current safe scope.

Error: remaining API audit warnings require product/security decisions.

Cause: all remaining findings are public exception candidates. Treating them as green would require accepting the public exposure model for each route, not just changing code.

Fix: run a formal public route exception review with product/security ownership, then either approve the exception registry or require route-specific auth/token policy changes. Local token-shape, CSRF, and payload-byte hardening has been applied where it did not require a product decision.

Next action: decide whether to keep these routes public, convert selected monitoring routes to bearer-token auth, or encode approved exceptions in `scripts/audit-api-routes.ts` with this report as evidence.

## Validation Commands

Run after this report update:

- `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts`
- `pnpm exec tsx scripts/audit-api-routes.ts --json`
- `pnpm type-check`
- `pnpm lint`
- `git diff --check`
