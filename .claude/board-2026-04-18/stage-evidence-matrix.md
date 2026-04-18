# Stage × Required-Evidence Matrix

**Motion:** M-2 · **Epic:** RA-1376 · **Board:** 2026-04-18 · **Ticket:** RA-1378

Source: Architect paper §4 (evidence gates), Ops Director paper §3 (war-story required fields), Legal paper §2 (chain-of-custody requirements).

## Purpose

Defines, for every transition in the 15-state lifecycle (M-1 / RA-1377), the **minimum evidence required** for the transition to be accepted by `lib/progress/service.ts` `transition()`.

Evidence is classified per M-14 (RA-1389):

- **HARD** — transition rejected if missing. Service throws `EvidenceMissingError`.
- **SOFT** — transition allowed but `ClaimProgress.managerReviewFlag = true`; surfaces in M-15 monthly governance review.
- **AUDIT** — transition allowed; missing evidence logged to `ProgressTransition.auditGaps[]` for retrospective reporting only.

All evidence items that capture field data (photos, readings, sigs) are wrapped in a **ProgressAttestation** record (M-10 C2PA manifest — SHA-256 + UTC + GPS + device + user hash).

---

## Matrix

Columns: transition key · source state → target state · required evidence · classification · reference.

| # | Transition | From → To | Required evidence | Class | Ref |
|---|---|---|---|---|---|
| 1 | `attest_stabilisation` | `STABILISATION_ACTIVE` → `STABILISATION_COMPLETE` | (a) ≥1 pre-stabilisation photo attestation per affected room; (b) ≥1 post-stabilisation photo; (c) WHS controls checklist with technician sig; (d) moisture baseline reading (`MoistureReading.isBaseline=true`, M-7) per affected room | HARD (a,b,d); SOFT (c) | Architect §4.1 |
| 2 | `attest_whs_hazard` | `STABILISATION_ACTIVE` → `WHS_HOLD` | (a) hazard type enum; (b) hazard description (≥40 chars); (c) ≥1 photo attestation; (d) SMP/SWMS reference if controls change | HARD (a,b,c); AUDIT (d) | Ops §3.2, Legal §2 |
| 3 | `attest_whs_cleared` | `WHS_HOLD` → `STABILISATION_ACTIVE` | (a) clearance note (≥40 chars); (b) ≥1 post-remediation photo; (c) supervisor sig (role ≥ `SITE_SUPERVISOR` per M-3) | HARD (a,b,c) | Legal §2.3 |
| 4 | `submit_scope` | `STABILISATION_COMPLETE` → `SCOPE_DRAFT` | (a) scope line items with unit + qty + unit-price; (b) total AUD; (c) affected-rooms list matches inspection; (d) dry-standard reference (`MoistureReading.isDryStandard=true`, M-7) recorded at least once per room | HARD (a,b,c); AUDIT (d — logged but not blocking because dry-standard is captured later during drying) | Architect §4.2 |
| 5 | `carrier_authorise` | `SCOPE_DRAFT` → `SCOPE_APPROVED` | (a) carrier reference number; (b) authorising officer name + role; (c) authorisation instrument (email / portal screenshot / written letter) stored as attachment; (d) timestamp ≤ 60 days since `submit_scope` | HARD (a,b,c); SOFT (d — stale authorisations flagged for review) | Legal §2.1 |
| 6 | `carrier_authorise_variation` | `VARIATION_REVIEW` → `DRYING_ACTIVE` | (a) carrier reference for the variation; (b) variation delta AUD + % (must trip M-6 threshold); (c) authorising officer name + role; (d) authorisation instrument | HARD (a,b,c,d) | M-6 (RA-1382) |
| 7 | `commence_drying` | `SCOPE_APPROVED` → `DRYING_ACTIVE` | (a) equipment placement log (equipment type × count × location); (b) ≥1 photo per monitoring point (`MoistureReading.isMonitoringPoint=true`, M-7); (c) psychrometric baseline (ambient T + RH) | HARD (a,b); SOFT (c) | Architect §4.3 |
| 8 | `certify_drying` | `DRYING_ACTIVE` → `DRYING_CERTIFIED` | (a) moisture readings for each monitoring point ≤ dry-standard (M-7); (b) 3 consecutive days stable readings OR ≥7 days elapsed with stable final 48h; (c) technician certificate sig; (d) IICRC S500 reference | HARD (a,b,c); AUDIT (d) | Architect §4.4, IICRC S500 |
| 9 | `commence_closeout` | `DRYING_CERTIFIED` → `CLOSEOUT` | (a) final photos per affected room; (b) customer-visible summary draft | HARD (a); SOFT (b) | Ops §3.5 |
| 10 | `issue_invoice` | `CLOSEOUT` → `INVOICE_ISSUED` | (a) customer sign-off attestation (signed or recorded-decline-with-reason); (b) all scope line items reconciled against actuals; (c) Xero idempotency key `${transitionId}:xero` unused (M-11) | HARD (a,b,c) | Legal §4, M-11 |
| 11 | `record_payment` | `INVOICE_ISSUED` → `INVOICE_PAID` | (a) payment amount (AUD); (b) payment reference (Xero payment id OR bank reference); (c) payment date ≤ today | HARD (a,b,c) | M-11 |
| 12 | `dispute` | `INVOICE_ISSUED` → `DISPUTED` | (a) disputing party (carrier / customer); (b) disputed amount (AUD); (c) reason (≥40 chars); (d) supporting document attachment | HARD (a,b,c); SOFT (d) | Legal §5 |
| 13 | `resolve_dispute` | `DISPUTED` → `INVOICE_PAID` \| `WITHDRAWN` | (a) resolution narrative (≥40 chars); (b) final amount AUD; (c) resolving officer sig (role ≥ `MANAGER` per M-3); (d) settlement instrument attachment | HARD (a,b,c,d) | Legal §5.2 |
| 14 | `withdraw` | any non-terminal state → `WITHDRAWN` | (a) withdrawing party; (b) reason enum; (c) reason narrative (≥40 chars); (d) manager sig if withdrawal occurs after `SCOPE_APPROVED` | HARD (a,b,c); SOFT (d) | Ops §3.7 |
| 15 | `close` | `INVOICE_PAID` → `CLOSED` | None beyond prior state's evidence. Closing is an admin step. Sets retention clock (M-8 class-based). | — | M-8 |

---

## Enforcement

All required-evidence checks live in **one place** — `lib/progress/evidence.ts` `assertEvidenceFor(transitionKey, payload)` — called by `transition()` before the DB write.

- HARD failures throw `EvidenceMissingError(transitionKey, missing[])`.
- SOFT failures set `ClaimProgress.managerReviewFlag = true` and append to `ProgressTransition.softGaps[]`.
- AUDIT gaps append to `ProgressTransition.auditGaps[]` — never block, surfaced in M-15 governance report.

The matrix in this doc is the canonical spec; `evidence.ts` tests import fixture rows that mirror each table row.

## Change control

Any addition / change to required evidence is a board-level decision. PRs touching `evidence.ts` must reference this doc + the superseding board minute.

## Related motions

- M-1 (RA-1377) — 15-state framework
- M-3 (RA-1379) — RACI (who can call each transition)
- M-6 (RA-1382) — variation threshold (feeds transition 6)
- M-7 (RA-1383) — schema tightenings (baseline + monitoring-point flags on `MoistureReading`, `Authorisation`)
- M-10 (RA-1386) — C2PA attestation manifest (wraps every photo/sig evidence item)
- M-11 (RA-1387) — Xero dispatcher (idempotency key check on transition 10)
- M-14 (RA-1389) — HARD/SOFT/AUDIT classifier
- M-15 (RA-1390) — monthly 5% override governance review (consumes `softGaps[]`)
