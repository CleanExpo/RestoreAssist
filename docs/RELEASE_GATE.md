---
gate_version: 1.0.0
last_updated: 2026-08-25
linear_ticket: RA-4956
authority: Required for profile-scoped production go-live (web and mobile tracked separately)
---

# RestoreAssist Production Go-Live Gate

> **Rule:** RestoreAssist may only be declared live for a given release profile when that profile's gate score equals its profile max, no open P0/P1 release-blocker issues remain, and every applicable mandatory check is green. Anything less is **fail-closed**.

## Why this exists

Subjective release calls have caused premature "ready" claims in the past. This gate replaces judgement-by-vibe with a versioned, machine-verifiable score. Per [[ra-4956]].

## How to run it

```bash
nvm use
scripts/bootstrap-restoreassist-env.sh
npx --no-install tsx scripts/release-gate-score.ts --profile=web
npx --no-install tsx scripts/release-gate-score.ts --profile=web --json --strict
npx --no-install tsx scripts/release-gate-score.ts --profile=mobile --json --strict
```

If `--profile` is omitted, the scorer defaults to `mobile` for backward-compatible fail-closed behaviour.

CI currently runs `--profile=web --json --strict` against the release candidate. Output artifact: `release-gate-report.json`.

## Release profiles

- `web` — current production workflow. Applicable max: **85** points. Excludes the mobile-only App Store/TestFlight/App Review section E.
- `mobile` — retains the full **100** points and still requires E1-E3.

Profile omission does not award points: excluded criteria are removed from that profile's max score.

## The points (sections A-F)

### A) Product Correctness & Feature Integrity — 25 pts

| Pts | Criterion | Verification |
|---|---|---|
| 10 | All core user journeys pass E2E (signup/login, onboarding, storage setup, restore, inspection, claim, attestation, PDF) | Signed machine receipt from a criterion-specific verifier bound to the exact release SHA |
| 10 | Middleware/auth/paywall rules match spec under test | `npx vitest run lib/__tests__/middleware-*.test.ts` 0 failures |
| 5 | No Sev1/Sev2 defects open | Linear query: `team=RestoreAssist AND priority in (Urgent,High) AND state != Done` returns 0 |

### B) Automated Quality & CI Reliability — 20 pts

| Pts | Criterion | Verification |
|---|---|---|
| 5 | `npm run lint` passes | Exit 0, ignoring known continue-on-error baseline ([[lint-debt-followup]]) |
| 5 | `npm run type-check` passes | Exit 0, 0 errors |
| 5 | Unit tests pass with 0 failures | `npx --no-install vitest run` — failing count == 0 |
| 5 | `npm run test:smoke:sandbox` passes with 0 failures | Playwright smoke against sandbox URL bound to the release SHA |

### C) Security & Compliance — 15 pts

| Pts | Criterion | Verification |
|---|---|---|
| 10 | `npm audit --omit=dev --audit-level=moderate` returns 0 moderate+ vulnerabilities | Exit 0 |
| 5 | Secrets scan + config sanity pass (no plaintext secrets, env-var completeness) | `gitleaks detect --no-banner --redact` exit 0 AND `.env.example` keys present in Vercel prod env |

### D) Billing & Paying-Customer Readiness — 15 pts

| Pts | Criterion | Verification |
|---|---|---|
| 5 | Website Stripe sandbox purchase, renewal, cancellation verified | Owner evidence, bound to the release SHA. iOS checkout is intentionally blocked and does not earn points by omission |
| 5 | Paywall gating correctly enforces access by entitlement state | `npx --no-install vitest run lib/billing/__tests__/ app/api/webhooks/stripe/__tests__/` 0 failures |
| 5 | Revenue events tracked + reconciled (purchase, renewal, churn) | Owner evidence: Stripe events dashboard count == DB `subscription_events` count for last 7 days |

### E) App Store Launch Operations — 15 pts (`mobile` profile only)

| Pts | Criterion | Verification |
|---|---|---|
| 5 | App Store metadata/screenshots/privacy nutrition + age rating approved | Owner: Phill — App Store Connect screenshot of "Ready for Submission" state |
| 5 | TestFlight external build stable, crash-free sessions >= 99.5% | Owner evidence: App Store Connect / TestFlight crash dashboard for the build |
| 5 | App Review blockers = 0; release + rollback plan documented | Independently reviewed E3 evidence bound to the release SHA |

### F) Production Observability & Support — 10 pts

| Pts | Criterion | Verification |
|---|---|---|
| 5 | Monitoring/alerting for auth, billing webhook errors, restore failures | Vercel Observability alert rules configured (owner evidence remains blocked pending a trusted verifier) |
| 5 | Runbooks + support SLAs (P1 response ≤1h, customer comms template ready) | Deterministic repository verifier: `docs/MOBILE_RELEASE_RUNBOOK.md`, `docs/PILOT_CUTOVER_CHECKLIST.md`, `docs/SUPPORT_SLA.md`, and `docs/CUSTOMER_COMMS_TEMPLATE.md` with rollback tree + templates A-E + P1 ≤1h |

## Machine-verifiable vs blocked owner-evidence breakdown

- **Web profile machine-verifiable (50 / 85 pts):** A2 (10), all of B (20), C1 (10), D2 (5), and F2 (5).
- **Web profile owner-evidence still blocked (35 / 85 pts):** A1/A3 (15), C2 (5), D1/D3 (10), and F1 (5).
- **Mobile-only blocked additions (15 / 100 pts):** E1-E3 remain required in the `mobile` profile and are excluded from the `web` profile.

Committed prose, screenshots, URLs and hashes of narrative evidence do not earn release points: they are self-attestable. The scorer validates their structure and freshness for diagnostics, then fails closed until each owner criterion has a signed, criterion-specific machine receipt producer and verifier. A1 requires signup, login, onboarding, storage setup, restore, inspection, claim, attestation and PDF observations. E3 requires App Review, release, rollback and reviewer observations. Freshness is aged from the stated date, never filesystem metadata.

### Unresolved signed-receipt producers

No trusted producer or verifier currently exists for A1, A3, C2, D1, D3,
E1-E3 or F1. F2 is now verified directly from repository content rather than
from committed owner prose. This is a release blocker, not an operator checkbox. Each
producer must bind its criterion ID, exact release SHA, observed environment,
timestamp and raw evidence digest into a signed receipt; a separately trusted
verifier must validate the signature and criterion-specific measurements.
Until those implementations and their planted-defect controls exist, the
scorer deliberately awards these criteria zero points.

## Release rule (fail-closed)

For the selected profile:

```text
score == profile_max  AND
no open P0/P1 release-blocker issues  AND
all applicable mandatory checks green in the latest required window
```

Any failed criterion = release blocked. No partial-credit overrides. To override, file a Linear ticket with Pi-CEO Board approval and link it in the gate run.

## Versioning

- `gate_version` is bumped when a criterion is added, removed, or reweighted.
- The scorer reads `gate_version` from this doc's frontmatter and stamps it on every report.
- A gate report with `gate_version` mismatch from current main is treated as stale.

## Evidence storage

- Machine reports: `release-gate-report.json` (CI artifact, retained 90 days)
- Owner evidence: committed to `docs/evidence/release-gate/<gate_version>/`
- Latest passing run also surfaced in Linear on RA-4956 as a status comment

## Related

- [[runbooks/digitalocean-production-release]] — protected manual production deployment procedure
- [[ra-4956]] — this ticket
- [[lint-debt-followup]] — known lint baseline (non-blocker)
- [[ra-4983]] — local test-DB bootstrap doc (improves criterion B5 reproducibility)
- [[ra-4984]] — middleware hard-paywall restoration (currently degrades A2 to "tests pass with .skip")
