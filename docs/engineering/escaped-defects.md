# Escaped defects ledger

This ledger records defects that crossed a review or merge boundary and the
executable control added to prevent recurrence.

## 2026-08-28 — Red PR merged and narrow tests reported as release evidence

| Field | Record |
| --- | --- |
| Defect class | Failed required-quality assumption; test-scope mismatch; public-route contract overwritten by a static audit response |
| First affected revision | `1b9e2e12fed661963ddbbab2902a358c1385b38b` in PR #2071 |
| Escape | PR #2071 merged as `08d905373f2a89af3364a1a16fccdc56913ffb49` while `PR Quality Gates` run `33171618243` had eight unit-test failures |
| Customer effect | The public Job File Audit checkout and intake returned 401, blocking the revenue funnel; simply removing auth would also have allowed a paid Stripe session to create duplicate fulfilment tickets |
| Detection gap | No visible repository ruleset required the red quality check; tests were not updated after auth was added; the paid intake had no payer binding or database idempotency key; later feature-selected test totals were described without distinguishing them from the full PR suite |
| Compounding gap | PR #2072 changed 133 files, above the external review ceiling, so CodeRabbit skipped review while its commit status remained green. CodeRabbit's earlier PR #2071 review had correctly identified the ownership and replay risk, but the PR was merged without resolving it. |
| Repair | Restore the intentionally public, rate-limited, payment-verified route contract; bind intake to the Stripe payer email; consume each checkout session exactly once with `SupportTicket.externalReference @unique`; repair AU/NZ fixtures and Vitest's Next.js `server-only` resolver; reuse one full-suite package command |
| Prevention controls | Payer-mismatch and `P2002` replay regression tests; database uniqueness migration; `scripts/check-pr-scope.mjs`; `scripts/__tests__/pr-quality-contract.test.ts`; `npm run test:unit:full`; daily/manual full Quality reconciliation on `main`; separate PR pilot-harness workflow; public-route audit regression |
| External control still required | Protect `main` with a no-bypass rule requiring `Quality Checks` and at least one independent approval before merge |
| Owner | Repository administrator for branch protection; engineering for executable gates |

Feature-selected tests remain useful development evidence, but they must be
labelled as selected tests. Only `npm run test:unit:full` is a local unit-suite
parity receipt for PR Quality.

## 2026-08-28 — PR-only pilot harness failed on its first hosted run

| Field | Record |
| --- | --- |
| Defect class | Test inventory gap; workflow path ownership drift |
| First detected revision | Draft audit PR #2073, run `33206759215` |
| Failure | `packages/pilot-tester/src/__tests__/workflow-wiring.test.ts` still expected PR path filters in the live canary after those filters moved into `pilot-harness-pr.yml` |
| Detection gap | The root command named `test:unit:full` did not execute the separate pilot-tester Vitest suite, so 99 package tests were absent from the earlier full-suite receipt |
| Repair | Validate PR watch paths against the PR harness; watch every file the wiring test reads; include the pilot-tester package in the canonical full-suite command |
| Prevention proof | Removing a required PR-harness path fails `workflow-wiring.test.ts`; both the package test and PR Quality contract enforce the root-to-package test connection |

Cross-vendor review of PR #2073 also required credential non-persistence for
PR checkout, dependency/runtime watch paths, an index-only concurrent
migration for the live ticket table, and exact-file public-route exemptions.
All four are release-blocking controls, not advisory clean-up.

## 2026-08-28 — Full-suite receipt was not rerun after audit repairs

| Field | Record |
| --- | --- |
| Defect class | Handoff evidence drift; load-sensitive test timing |
| First detected revision | Local audit repair commit `6d5d797e` |
| Failure | The post-repair `npm run test:unit:full` receipt failed two `BrandCard` tests after 921 files had passed; the pilot package correctly remained blocked behind the red root suite |
| Detection gap | Earlier green totals belonged to the preceding tree, and a later full-suite process disappeared without a recoverable final status. Neither result proved the current commit. |
| Repair | Preserve an exit-code receipt for the exact tree; make the synchronous palette assertion synchronous; give the rejected-upload UI test a bounded 15-second budget for repository-wide serial-run scheduler delay |
| Prevention proof | Ten independent focused runs must pass before another full-suite receipt; handoff requires local full-suite, type, lint, hosted Pilot, and current-SHA external-review evidence from the same tree |

The first corrected Sketch E2E run exposed another bookkeeping-only green: it
pre-resolved the security-critical concurrent replay-index migration and never
executed its SQL. The gate now runs that migration file after the column exists,
checks that the unique index is valid and ready, and attempts a duplicate insert
inside a rolled-back transaction. A migration receipt is not green unless that
mutation probe rejects the duplicate fulfilment key.
