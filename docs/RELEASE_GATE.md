---
gate_version: 1.0.0
last_updated: 2026-05-18
linear_ticket: RA-4956
authority: Required for production go-live (App Store + paying customers)
---

# RestoreAssist 100/100 Production Go-Live Gate

> **Rule:** RestoreAssist may only be declared "production live" when the gate score = **100/100** AND no open P0/P1 release-blocker issues remain. Anything less is **fail-closed**.

## Why this exists

Subjective release calls have caused premature "ready" claims in the past. This gate replaces judgement-by-vibe with a versioned, machine-verifiable score. Per [[ra-4956]].

## How to run it

```bash
nvm use                                           # uses .nvmrc, currently Node 22.22.3
scripts/bootstrap-restoreassist-env.sh             # local env bootstrap and baseline checks
pnpm tsx scripts/release-gate-score.ts            # local dry-run
pnpm tsx scripts/release-gate-score.ts --json     # CI artifact mode (writes release-gate-report.json)
pnpm tsx scripts/release-gate-score.ts --strict   # exit 1 if score < 100 OR any required item red
```

CI runs `--json --strict` against the release candidate. Output artifact: `release-gate-report.json`.

## The 100 points (sections A-F)

### A) Product Correctness & Feature Integrity — 25 pts

| Pts | Criterion | Verification |
|---|---|---|
| 10 | All core user journeys pass E2E (signup/login, onboarding, storage setup, restore flow) | `pnpm test:smoke:sandbox` returns 0 failures across the tagged @smoke suite |
| 10 | Middleware/auth/paywall rules match spec under test | `npx vitest run lib/__tests__/middleware-*.test.ts` 0 failures |
| 5 | No Sev1/Sev2 defects open | Linear query: `team=RestoreAssist AND priority in (Urgent,High) AND state != Done` returns 0 |

### B) Automated Quality & CI Reliability — 20 pts

| Pts | Criterion | Verification |
|---|---|---|
| 5 | `pnpm lint` passes | Exit 0, ignoring known continue-on-error baseline ([[lint-debt-followup]]) |
| 5 | `pnpm type-check` passes | Exit 0, 0 errors |
| 5 | Unit tests pass with 0 failures | `pnpm exec vitest run` — failing count == 0 |
| 5 | `pnpm test:smoke:sandbox` passes with 0 failures | Playwright smoke against sandbox URL |

### C) Security & Compliance — 15 pts

| Pts | Criterion | Verification |
|---|---|---|
| 10 | `pnpm audit --prod --audit-level=moderate` returns 0 moderate+ vulnerabilities | Exit 0 |
| 5 | Secrets scan + config sanity pass (no plaintext secrets, env-var completeness) | `gitleaks detect --no-banner --redact` exit 0 AND `.env.example` keys present in Vercel prod env |

### D) Billing & Paying-Customer Readiness — 15 pts

| Pts | Criterion | Verification |
|---|---|---|
| 5 | Stripe/Apple IAP sandbox purchase, renewal, cancellation verified | Owner: Phill — evidence file `docs/evidence/billing-flows-YYYY-MM-DD.md` |
| 5 | Paywall gating correctly enforces access by entitlement state | `pnpm exec vitest run lib/billing/__tests__/ app/api/webhooks/stripe/__tests__/` 0 failures |
| 5 | Revenue events tracked + reconciled (purchase, renewal, churn) | Owner evidence: Stripe events dashboard count == DB `subscription_events` count for last 7 days |

### E) App Store Launch Operations — 15 pts

| Pts | Criterion | Verification |
|---|---|---|
| 5 | App Store metadata/screenshots/privacy nutrition + age rating approved | Owner: Phill — App Store Connect screenshot of "Ready for Submission" state |
| 5 | TestFlight external build stable, crash-free sessions >= 99.5% | Owner evidence: Sentry/ASC crash dashboard for the TestFlight build |
| 5 | App Review blockers = 0; release + rollback plan documented | Files exist: `docs/MOBILE_RELEASE_RUNBOOK.md` + Linear ticket "Rollback plan" closed |

### F) Production Observability & Support — 10 pts

| Pts | Criterion | Verification |
|---|---|---|
| 5 | Monitoring/alerting for auth, billing webhook errors, restore failures | Vercel Observability alert rules configured (owner evidence: screenshot of rules) |
| 5 | Runbooks + support SLAs (P1 response ≤1h, customer comms template ready) | Files exist: `docs/MOBILE_RELEASE_RUNBOOK.md` + `docs/PILOT_CUTOVER_CHECKLIST.md` + support template |

## Machine-verifiable vs owner-evidence breakdown

- **Machine-verifiable (60 pts):** all of B (20), C (15), most of A (20), D-paywall-tests (5) — scorer runs these directly.
- **Owner-evidence (40 pts):** A-Sev1/Sev2 query (5), D-billing-flows (10), all of E (15), all of F (10) — these require an evidence file in `docs/evidence/release-gate/<gate_version>/<criterion-id>.md` confirming the check.

Scorer counts an owner-evidence criterion as PASS only when the evidence file exists, is dated within 14 days of the gate run, and contains the required fields (template enforced).

## Release rule (fail-closed)

```
score == 100  AND
no open P0/P1 release-blocker issues  AND
all mandatory checks green in latest CI/TestFlight window
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

- [[ra-4956]] — this ticket
- [[lint-debt-followup]] — known lint baseline (non-blocker)
- [[ra-4983]] — local test-DB bootstrap doc (improves criterion B5 reproducibility)
- [[ra-4984]] — middleware hard-paywall restoration (currently degrades A2 to "tests pass with .skip")
