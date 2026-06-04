# RestoreAssist Senior PM Swarm Operating Model

Date: 2026-05-28
Index: `SHIP_GATE_COMMAND_CENTER_INDEX_2026-05-28.md`
Primary command center: `SHIP_GATE_PM_DASHBOARD_2026-05-28.md`
Owner action board: `PHILL_ACTION_BOARD_2026-05-28.md`
Strict gate runbook: `STRICT_GATE_RERUN_RUNBOOK_2026-05-28.md`
Linear command center: https://linear.app/unite-group/document/restoreassist-ship-gate-command-center-2026-05-28-8eb616107bd5

## Purpose

This model turns the current ship-gate recovery into coordinated specialist lanes. It is for release recovery only: no broad Wave 2, roadmap, or polish work should enter this swarm until the strict release gate is green.

## Command Roles

| Role                          | Job                                                                                                                      | Current lane                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Senior PM / Release Commander | Owns the release decision, blocker priority, and evidence standard.                                                      | RA-4956, action board, Linear command center. |
| DevOps / Vercel Lead          | Repairs sandbox runtime env, deployment aliasing, and smoke access.                                                      | RA-5624.                                      |
| Canary / QA Lead              | Owns pilot tester secrets, canary reruns, smoke results, and the strict-gate rerun runbook.                              | RA-5615, RA-4956.                             |
| Security Lead                 | Owns exposed-secret rotation, service-role incident closure, and secret-output hardening adoption.                       | RA-2989, RA-3034, RA-3012.                    |
| Owner Evidence Lead           | Collects non-code proof for billing, App Store, TestFlight, revenue reconciliation, and monitoring.                      | RA-5628.                                      |
| GitHub Review Lead            | Prevents oversized or unreviewed PRs from entering ship approval.                                                        | RA-5629.                                      |
| Dependency Steward            | Recreates closed dependency batches as small, reviewable PRs.                                                            | RA-5630.                                      |
| Product Owner                 | Provides secrets, account screenshots, rotation confirmations, App Store/TestFlight/Sentry evidence, and final go/no-go. | Phill-owned actions.                          |

## Lane Rules

1. Every lane must name the Linear issue it advances.
2. Every lane must end with evidence, not opinion.
3. Secret values must never be pasted into GitHub, Linear, chat, screenshots, shell output, or logs.
4. A green check only counts if it covers the exact gate item being claimed.
5. PRs must stay small enough for normal review unless a senior reviewer explicitly signs off on full-diff risk.
6. RA-4956 historical Done status means the gate exists; it does not mean current ship approval exists.

## Operating Cadence

| Moment                           | Action                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Start of work block              | Read `PHILL_ACTION_BOARD_2026-05-28.md`, then inspect current GitHub/Vercel/Linear state before acting. |
| During work                      | Update the relevant Linear issue with evidence as soon as a blocker moves.                              |
| Before merging or declaring done | Confirm production health, sandbox health, latest GitHub runs, and relevant owner evidence.             |
| End of work block                | Update the PM dashboard if the critical path, blocker list, or evidence changed.                        |

## Active Swarm Lanes

### Lane 1 - Canary Recovery

Linear: RA-5615

Goal: real pilot tester canary passes on `main`.

Required evidence:

- GitHub Actions secrets `PILOT_TESTER_USER_POOL_JSON` and `PILOT_TESTER_DATABASE_URL` exist.
- The secrets are sandbox-only.
- Latest `Pilot tester canary` run passes both `dry-run` and `swarm`.
- Run URL is attached to RA-5615.

### Lane 2 - Sandbox Recovery

Linear: RA-5624

Goal: sandbox is a valid release-gate smoke target.

Required evidence:

- `restoreassist-sandbox` runtime sees non-empty `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, and `XERO_WEBHOOK_KEY`.
- `NODE_TLS_REJECT_UNAUTHORIZED` is removed or has a time-boxed owner exception.
- `https://restoreassist-sandbox.vercel.app/api/health` returns `status=ok`, database ok, env ok.
- Sandbox smoke and strict gate can run without hanging in A1/B4.

### Lane 3 - Security Closure

Linear: RA-2989, RA-3034, RA-3012

Goal: no open security release blocker remains.

Required evidence:

- Exposed credentials rotated and revoked where supported.
- Canonical 1Password/local/env stores reconciled.
- Supabase service-role key rotation and affected env refresh proven.
- Git-history decision or formal exception recorded.
- Supabase access logs audited for unexpected activity.
- `railway_check.sh` adoption proven with masked output and raw-command prevention.

### Lane 4 - Owner Launch Evidence

Linear: RA-5628

Goal: owner-evidence release-gate files become current and pass.

Required evidence:

- `D1-billing-flows.md`: Stripe/Apple sandbox purchase, renewal, cancellation proof.
- `D3-revenue-reconciliation.md`: Stripe event counts match DB `subscription_events` for the same 7-day window.
- `E1-app-store-metadata.md`: App Store Connect metadata/screenshots/privacy/age rating proof.
- `E2-testflight-stability.md`: crash-free sessions >= 99.5% for the relevant TestFlight build.
- `F1-monitoring-alerting.md`: Sentry alert rules for auth, billing webhook errors, and restore failures.

### Lane 5 - PR Risk Control

Linear: RA-5629

Goal: PR #1199 cannot become accidental ship approval.

Required evidence:

- PR #1199 is split into surgical PRs, or a senior reviewer signs off on the entire 238-file diff.
- Each replacement PR has a filled template, targeted tests, rollback notes, and green previews.

### Lane 6 - Dependency Control

Linear: RA-5630

Goal: closed Dependabot #1204 returns only as safe, reviewable PRs.

Required evidence:

- Dependency updates are split by lane: tooling/types, UI/forms, observability/payment/email, mobile/device, AI providers, Remotion if needed.
- Every package change includes `pnpm-lock.yaml`.
- Each PR has green GitHub checks and green Vercel production/sandbox previews.
- AI provider updates prove Node-only code does not leak into client bundles.

## Go / No-Go Rule

Go-live requires all of these:

- RA-5615 green.
- RA-5624 green.
- RA-2989, RA-3034, and RA-3012 closed or formally excepted.
- RA-5628 evidence files changed from `status: deferred` to `status: pass` only where proof exists.
- RA-5629 and RA-5630 cannot destabilize the release path.
- `pnpm tsx scripts/release-gate-score.ts --strict` passes 100/100 from a clean checkout.

Anything less is a no-go.
