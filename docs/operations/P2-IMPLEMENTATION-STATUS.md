# P2 implementation status (engineering)

Last updated: 2026-10-12. Program exit still requires Phill attestation per `P2-STRATEGY.md`.

## Automated exit slice (run locally / CI)

```bash
npm run db:migrate:local
npm run check:p2-exit
ALLOW_TEST_HELPERS=true npx playwright test e2e/moisture-p2-claim-integrity.spec.ts e2e/offline-moisture-sync.spec.ts e2e/nz-org-gst.spec.ts
```

## Track A — Claim & field truth

| Item | Status |
|------|--------|
| P1-1 baseline/monitoring write + UI | Done |
| P1-2 latest-reading drying goal | Done |
| P1-3 invalidation + audit | Done |
| P1-4 relational readings in PDF | Done |
| P1-5 six-fact delivery API | Done (`GET /api/reports/[id]/delivery-facts`) |
| P1-6 report_sent via delivery events | Existing `recordReportSent` + close context |
| P1-7 ClaimProgress CAS mirrors | Done for close / reopen / issue-invoice mirrors |
| P1-8/P1-9 S500 intake gate | Done on `generate-scope` (water_damage) |
| P1-10 SWMS | Existing submit gates (`checkSafeworkGate`, SWMS routes) |
| P1-11 disposal authority | Done (`POST …/disposal-authority`, scope select gate) |

## Track B — Money spine

| Item | Status |
|------|--------|
| P2-1 org pricing resolver | Existing `resolveEffectivePricing`; CI rate grep |
| P2-2 approve snapshot | Done (`EstimateVersion.snapshot` on APPROVED) |
| P2-3 invoice from estimate | Existing generate-invoice; uses frozen snapshot when present |
| P2-4 payment ledger | Existing Stripe/webhook paths |
| P2-5 idempotency | Server routes + `lib/http/fetch-with-idempotency.ts`; DB dedupe index on external payments |

## Track C — Locale & RLS

| Item | Status |
|------|--------|
| P3-6/P3-7 NZ + GST | Setup state API + `check:gst-callers`; E2E `nz-org-gst.spec.ts` |
| RLS batch 4 moisture | Supabase migration `20261012160000_p2_rls_batch4_moisture_reading.sql`; batches 1–3,5 + prod apply remain ops |

## Track D — Build hygiene

| Item | Status |
|------|--------|
| `ignoreBuildErrors: false` | **Not flipped** — full-repo `npm run type-check` still has many errors (inspection detail cluster, etc.) |

## Track P2-4 / P2-7 E2E

| Spec | Status |
|------|--------|
| Offline moisture | `e2e/offline-moisture-sync.spec.ts` |
| Stripe Connect | `e2e/stripe-connect-payments.spec.ts` (guarded on test keys) |
| Golden invoice leg | `e2e/first-tradie-flow.spec.ts` (pre-existing) |

## Ops-only (cannot close in code alone)

- RLS batches 1–3, 5 on sandbox/prod with rollback SQL and RA-4956 evidence
- Production migrate + deploy
- Phill P2 attestation sign-off
