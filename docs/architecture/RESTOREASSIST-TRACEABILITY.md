# RestoreAssist — Requirements Traceability Matrix

Maps each V1 requirement to domain, current implementation, gap, target component, acceptance criteria, test type, workstream, and status. Status legend: `TODO` (not started) · `PARTIAL` (exists, gap remains) · `DONE` (evidenced). This matrix is updated in the same change set as any behaviour change (spec §44).

## A. Canonical data ownership (spec §8)

| # | Datum | Canonical owner | Current reality | Gap | Migration | Concurrency | Audit | Status |
|---|---|---|---|---|---|---|---|---|
| DO-1 | Organisation | `Organization` | canonical | — | — | version | yes | DONE |
| DO-2 | Customer | `Client` + `Inspection.clientId` | Client is a name-match byproduct; no clientId on Inspection | add FK, picker forms, backfill by name+phone | version | yes | TODO |
| DO-3 | Property/address | `Inspection` + `reportId` | address typed ≤3×; address-string join | populate reportId FK, single write point | version | yes | TODO |
| DO-4 | Site logistics | `Inspection` structured | partial/free-text | structured fields | version | yes | PARTIAL |
| DO-5 | Insurer + claim# | `InsurerProfile` FK + `Inspection.claimNumber` | metadata-JSON pointer + free-text | promote to FK + column | version | yes | TODO |
| DO-6 | Rooms/geometry/volume | `SketchElement` twin | twin correct; consumers use typed copies; Room dormant | derivation service; retire Room | transactional derivation | yes | PARTIAL |
| DO-7 | Moisture readings | `MoistureReading` | 3 stores; PDF reads blob | PDF→relational; blob backfill | append + invalidation | yes | TODO |
| DO-8 | Psychrometric/env | `PsychrometricReading`/`EnvironmentalData` | write-only, no readers | wire drying engine reads | append | yes | PARTIAL |
| DO-9 | Equipment + runtime | `EquipmentDeployment`@inspectionId | dead table; data in Report JSON | re-anchor + write surface | version | yes | TODO |
| DO-10 | Contents | `ContentsPackOutItem` (+PATCH) | DELETE-only; AI manifest unpersisted | add PATCH; persist | version | yes | PARTIAL |
| DO-11 | Photos/media | `InspectionPhoto` + FK refs | 4 unlinked tables | add FKs, single write | append | yes | TODO |
| DO-12 | Scope | `ScopeItem`; `Scope`=snapshot | 3 stacks; unpriced | rate-card pricing; snapshot converter | version | yes | TODO |
| DO-13 | Rate card | `OrganizationPricingConfig` | hardcoded rates exist | make canonical | version | yes | TODO |
| DO-14 | Estimates | `Estimate`/`EstimateLineItem` | `CostEstimate` dead | snapshot on approve; retire CostEstimate | version + status CAS | yes | PARTIAL |
| DO-15 | Invoice lines | `InvoiceLineItem` from estimate | $50 hardcode; contract caller-less | wire estimateId; unique sourceInspectionId | idempotent + CAS | yes | TODO |
| DO-16 | Payments | `InvoicePayment` | Stripe PAID w/o ledger; stale RMW | atomic increments; ledger row | idempotent | yes | TODO |
| DO-17 | Reports | `Report` snapshots from canonical | authorable JSON blobs | sources→canonical; six-fact status | status CAS | yes | TODO |
| DO-18 | Signatures | `AuthorityFormInstance/Signature` | strong; `FormSignature` dead | retire dead cluster | append | yes | PARTIAL |
| DO-19 | Closure evidence | `ProgressTransition` | append-only + hash; mirror-writes skip version | version-CAS on mirrors | version CAS | yes | PARTIAL |
| DO-20 | Completeness | derived projection | 3 gap engines | unify | n/a | n/a | TODO |

## B. Lifecycle capabilities → acceptance → test (spec §10–§23)

| # | Capability | Spec | Acceptance (starting state → action → expected write + audit + failure) | Test types | Workstream | Status |
|---|---|---|---|---|---|---|
| CAP-1 | Intake with Client picker | §10 | new claim requires a selected/created Client; address+claim# written once, read unchanged downstream; missing Client → rejected | integration, isolation, e2e | Phase 3 | TODO |
| CAP-2 | Site logistics captured once | §10,§12 | access/parking/animals/occupants/storeys stored on Inspection, shown on appointment + report | integration, e2e | Phase 3/5 | PARTIAL |
| CAP-3 | Minimum scheduling | §11 | manager books appointment vs claim, assigns tech w/ role; tech acknowledges; reschedule/cancel audited; role+org enforced | unit, integration, isolation, e2e | Phase 5 | TODO |
| CAP-4 | Inspection capture + provenance | §12,§13 | only operator-measured geometry prices scope; offline capture replays duplicate-safe | unit, e2e, concurrency | Phase 1/3 | PARTIAL |
| CAP-5 | Drying immutable history + certification | §14 | baseline/monitoring flags writable; certify uses latest-valid-per-point; invalidation audited, source retained | unit, integration, e2e | Phase 1 | TODO |
| CAP-6 | Field readings reach report | §20 | report contains every field moisture reading, no re-entry; PDF snapshot-diff stable | integration, e2e, snapshot | Phase 1 | TODO |
| CAP-7 | Scope priced from rate card | §17,§18 | ScopeItem.suggestedRate from OrganizationPricingConfig; no hardcoded price in prod path | unit, integration | Phase 2 | TODO |
| CAP-8 | Estimate immutable snapshot | §19 | approve freezes snapshot; later rate-card change does not alter approved estimate | unit, integration | Phase 2 | TODO |
| CAP-9 | Invoice from approved estimate | §21 | invoice lines derive from estimate snapshot; correct customer via clientId; duplicate create blocked by unique constraint | integration, idempotency, e2e | Phase 2 | TODO |
| CAP-10 | Payment ledger + reconciliation | §22 | manual/EFT/partial/refund via atomic increment; Stripe writes ledger row; closure sees correct paid state; add-on not required | unit, integration, concurrency, idempotency | Phase 2 | TODO |
| CAP-11 | Server-validated closure | §23 | close requires delivered-report + financial state + approvals; bulk-status COMPLETED cannot satisfy report_sent; reopen audited | integration, security, e2e | Phase 0/1 | PARTIAL |
| CAP-12 | Margot claim-aware + completeness | §24,§25 | chatbot receives claim context; completeness returns facts/missing/next w/ rule sources; every AI mutation ≥ human-confirmation; actions audited | integration, security, e2e | Phase 4 | TODO |
| CAP-13 | BYOK four-plane | §26 | customer-feature AI calls route through client-plane gateway w/ budget+logging; no silent house-key fallback | unit, integration | Phase 4 | PARTIAL |

## C. Security & concurrency (spec §30,§32) → RA-ARCH-01/02

| # | Finding | Sev | Acceptance | Test | Workstream | Status |
|---|---|---|---|---|---|---|
| SEC-1 | Private evidence/sketch buckets | H1 | evidence-optimised + sketch-media not public-readable; served via short-lived signed URL; unauth object URL 403/expires | security, integration | Phase 0 | TODO |
| SEC-2 | Revocable scoped share/insurer links | H2 | DB-backed per-recipient token w/ revokedAt + scope; revoked link 401; owner≠insurer namespace | security, integration | Phase 0 | TODO |
| SEC-3 | Closure spoof (report_sent) | M2 | bulk-status cannot set COMPLETED; report_sent binds to delivery event | security, unit | Phase 0/1 | PARTIAL (PR #1967) |
| SEC-4 | TOTP secret encryption | M3 | twoFactorSecret encrypted at rest; backfilled | security, unit | Phase 0 | TODO |
| SEC-5 | Portal token namespace | M1 | one revocable verifier across /portal/[token]/*; revoke stops all sub-routes | security, integration | Phase 0 | TODO |
| SEC-6 | Ascora replay guard | M4 | freshness window + event dedup before any mutation | security, integration | Phase 0 | TODO |
| CON-1 | Web idempotency | C1 | shared fetch helper attaches Idempotency-Key to POST/PATCH; unique Invoice.sourceInspectionId | concurrency, idempotency | Phase 2 | TODO |
| CON-2 | Payment money-field writers | C2/M3 | atomic increment/decrement in-tx; status derived; partial-unique externalPaymentId | concurrency, idempotency | Phase 2 | TODO |
| CON-3 | Report status CAS | C3 | transition matrix + per-row CAS; no ungated bulk COMPLETED | concurrency, unit | Phase 1 | PARTIAL |
| CON-4 | ClaimProgress one protocol | H1 | close/reopen mirror-writes version-increment or via progress service | concurrency, integration | Phase 1 | TODO |
| CON-5 | Leases for long-running | H2–H5 | PENDING TTL ≥ maxDuration; ScheduledEmail stale-sweep+CAS; AgentTask timeout requeue; cron partial-unique/advisory lock | concurrency, integration | Phase 0/1 | TODO |
| CON-6 | Offline version preconditions | M6 | Inspection PATCH + Report PUT carry version/If-Unmodified-Since → 409/412; mobileLocalId unique | concurrency, e2e | Phase 3 | TODO |

## D. Seeded reference claim (spec §39)
The seeded scenario (RA water-damage, all five roles, UI/API only) is the V1 exit gate. Each capability above must pass within it. Status: `TODO` — authored as a fixture + e2e in Phase 6, exercised incrementally as phases land.

## Coverage summary
- Data ownership rows: 20 (2 DONE, 6 PARTIAL, 12 TODO).
- Lifecycle capabilities: 13 (0 DONE, 5 PARTIAL, 8 TODO).
- Security/concurrency: 12 (0 DONE, 3 PARTIAL, 9 TODO).
Every row links to a workstream in `RESTOREASSIST-V1-BACKLOG.md` and, once built, to a named test (spec §38/§42).
