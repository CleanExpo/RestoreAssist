# Progress Framework — 15-State Claim Lifecycle

**Motion:** M-1 · **Epic:** RA-1376 · **Board:** 2026-04-18

Source: Architect paper §3 (board minutes §8 M-1). Human-readable stage labels per Ops Director paper §2.

## The 15 states

| # | State | Purpose | Exit conditions |
|---|---|---|---|
| 1 | `INTAKE` | Initial claim recorded. Attestor collects minimum viable data to open a file. | Transition to `STABILISATION_ACTIVE` when tech is on-site. |
| 2 | `STABILISATION_ACTIVE` | WHS controls in place; emergency protections being installed. | `attest_stabilisation` → `STABILISATION_COMPLETE`. `attest_whs_hazard` → `WHS_HOLD`. |
| 3 | `WHS_HOLD` | Safety hazard paused on-site work; SMP/SWMS under review. | `attest_whs_cleared` → back to `STABILISATION_ACTIVE`. |
| 4 | `STABILISATION_COMPLETE` | Property is safe and dry-standing. Carrier has been notified. | `submit_scope` → `SCOPE_DRAFT`. |
| 5 | `SCOPE_DRAFT` | Scope of works drafted; pending carrier authorisation. | `carrier_authorise` → `SCOPE_APPROVED`. Carrier reject → back to `SCOPE_DRAFT` with notes. |
| 6 | `SCOPE_APPROVED` | Carrier has signed off on the scope. Approval captured immutably. | `commence_drying` → `DRYING_ACTIVE`. |
| 7 | `DRYING_ACTIVE` | Drying in progress; daily moisture readings being captured. | `certify_drying` → `DRYING_CERTIFIED`. Variation needed → `VARIATION_REVIEW`. |
| 8 | `VARIATION_REVIEW` | Scope variation exceeds threshold (M-6: 20% / AUD 2,500). Requires carrier re-approval. | `carrier_authorise_variation` → back to `DRYING_ACTIVE`. |
| 9 | `DRYING_CERTIFIED` | IICRC S500 dry standard achieved; technician signs certificate. | `commence_closeout` → `CLOSEOUT`. |
| 10 | `CLOSEOUT` | Final photos, customer sign-off, paperwork complete. | `issue_invoice` → `INVOICE_ISSUED`. |
| 11 | `INVOICE_ISSUED` | Invoice sent to carrier (or customer for out-of-pocket). Xero invoice created via M-11. | `record_payment` → `INVOICE_PAID`. Carrier dispute → `DISPUTED`. |
| 12 | `INVOICE_PAID` | Payment confirmed. | `close` → `CLOSED`. |
| 13 | `DISPUTED` | Carrier has disputed part or all of the invoice. Reserve held. | Resolution → `INVOICE_PAID` or `WITHDRAWN`. |
| 14 | `CLOSED` | Claim fully resolved; retention clock started per M-8 class-based schedule. | Terminal. |
| 15 | `WITHDRAWN` | Claim withdrawn before completion (customer decision or carrier denial). | Terminal. |

## Transition keys

All transitions are mediated by `lib/progress/service.ts` `transition()` and constrained by the RACI matrix (M-3) in `lib/progress/permissions.ts`. See M-2 (RA-1378) for the Stage × Required Evidence matrix that gates each transition.

Canonical transition keys used by the service layer:

```
attest_stabilisation        attest_whs_hazard        attest_whs_cleared
submit_scope                carrier_authorise        carrier_authorise_variation
commence_drying             certify_drying           commence_closeout
issue_invoice               record_payment           dispute
resolve_dispute             withdraw                 close
```

## Implementation hooks

- **M-5 (RA-1381):** `ClaimState` enum + Prisma models (`ClaimProgress`, `ProgressTransition`, `ProgressAttestation`) land the persistence layer.
- **M-21 (RA-1396) Sprint 1 umbrella:** pure state-machine + service + permissions + 2 API routes + tests.
- **M-11:** Progress stages drive GST/finance events via `lib/progress/integrations/xero.ts`.
- **M-17:** 8 telemetry events emitted per transition.

## Terminology

- **Stage** (human-visible) = state (machine-visible). Same concept; "stage" in product UI, "state" in code.
- **Attestation** = an immutable record of an action at a stage boundary (M-10 chain-of-custody manifest attached).
- **Transition** = a state change, authorised by role (M-3) and gated by evidence (M-2).
- **Gate** = a precondition to a transition (M-14 hard/soft/audit classification).

## Rollout

Phase A (silent infrastructure) begins on M-1..M-5 + M-21 landing. No user-visible change until M-17 telemetry is live AND M-14 gate classification is shipped. Existing jobs backfilled via M-20 cron (manager-review-flag per Principal amendment).

## Source references

- `.claude/board-2026-04-18/00-board-minutes.md` §8 Motions (pending — PC2 to push)
- Architect paper §3 (state machine)
- Ops Director paper §2 (human stage labels)
