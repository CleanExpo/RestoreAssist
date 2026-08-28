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
