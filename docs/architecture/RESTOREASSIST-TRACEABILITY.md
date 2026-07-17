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

## E. State machines (spec §9)

The per-machine transition tables §9 requires. Columns: **From → To** (permitted transition) · **Role** (minimum) · **Conditions / evidence required** · **CAS predicate** (concurrency) · **Audit event** · **Reversal**. Any transition not listed is illegal and rejected. Margot may initiate any transition only at ≥ human-confirmation and never `close`/pricing (spec §24).

### E.1 Claim (`ClaimProgress.currentState`) — master
| From → To | Role | Conditions / evidence | CAS | Audit | Reversal |
|---|---|---|---|---|---|
| INTAKE → SCHEDULED | Manager | client + date-of-loss + cause recorded | `version` | ProgressTransition | → INTAKE (reason) |
| SCHEDULED → IN_INSPECTION | Technician | appointment acknowledged | `version` | yes | reschedule |
| IN_INSPECTION → DRYING | Technician | category/class + safety record + baseline readings | `version` | yes | reopen_inspection |
| DRYING → SCOPING | Technician | drying certified (E.3) | `version` | yes | reopen_drying |
| SCOPING → ESTIMATING | Technician/Manager | scope items present | `version` | yes | back to SCOPING |
| ESTIMATING → REPORTING | Manager | estimate approved (E.5) | `version` | yes | — |
| REPORTING → IN_BILLING | Manager | report delivered (E.6) | `version` | yes | — |
| IN_BILLING → CLOSED | Manager | closure gate (E.9) | `version` | yes | reopen_job (reason+authority) |
| CLOSED → IN_BILLING | Manager/Owner | reopen reason + authority | `version` | yes | — |

### E.2 Inspection (sub-state, maps into Claim)
| From → To | Role | Conditions | CAS | Audit | Reversal |
|---|---|---|---|---|---|
| DRAFT → PROCESSING | Technician | address+postcode | `acceptedAt:null` / `status` | yes | — |
| PROCESSING → SUBMITTED | Technician | required capture + ≥1 photo + category/class | `status=PROCESSING` | yes | reopen to PROCESSING |
| SUBMITTED → (drives Claim IN_INSPECTION→DRYING) | system | maps via progress service | `version` | yes | — |

### E.3 Drying
| From → To | Role | Conditions | CAS | Audit | Reversal |
|---|---|---|---|---|---|
| DRYING_ACTIVE → DRYING_CERTIFIED | Technician | goalAchieved (latest-valid-per-point) + signedOffBy + ≥1 baseline + ≥1 monitoring point; OR professional override with reason | `status=DRYING_ACTIVE` | ProgressTransition | reopen_drying (reason) |
| any → reading invalidated | Technician (+approval if configured) | original/reason/user/time/replacement recorded; source retained | append | invalidation event | n/a (never deletes) |

### E.4 Scope
| From → To | Role | Conditions | CAS | Audit | Reversal |
|---|---|---|---|---|---|
| DRAFT → FINAL (snapshot) | Technician/Manager | scope items priced from rate card | `version` | yes | new version only |
| FINAL → SUPERSEDED | Manager | replaced by a newer scope version | `version` | yes | — |

### E.5 Estimate
| From → To | Role | Conditions | CAS | Audit | Reversal |
|---|---|---|---|---|---|
| DRAFT → SENT | Manager | line items derived from scope + rate card | `status=DRAFT` | yes | back to DRAFT |
| SENT → APPROVED | Manager | approver recorded; **freezes immutable snapshot** | `status=SENT` | yes | **not un-approvable** |
| APPROVED → SUPERSEDED | Manager | new estimate version created | `status=APPROVED` | yes | — |
| any → REJECTED / EXPIRED | Manager/system | rejection reason / expiry | `status` | yes | new version only |
| (APPROVED) → LOCKED | system | invoice generated from it | `status=APPROVED` | yes | — |

An APPROVED estimate is never un-approved; change is by a new version (supersede). Its snapshot is immutable (spec §19).

### E.6 Report — six facts, not one status
| From → To | Role | Conditions / evidence | CAS | Audit | Reversal |
|---|---|---|---|---|---|
| DRAFT → GENERATED | Technician/Manager | generated from canonical sources | `status` | yes | regenerate (new version) |
| GENERATED → APPROVED | Manager | reviewer sign-off | `status=GENERATED` | yes | back to GENERATED |
| APPROVED → SENT | Manager | delivery initiated to a recipient | `status=APPROVED` | delivery event | — |
| SENT → DELIVERED | system | delivery confirmed (recipient fetch / receipt) | `status=SENT` | delivery event | — |
| DELIVERED → ACKNOWLEDGED | Customer/Insurer | recipient acknowledgement | `status=DELIVERED` | yes | — |
| any → SUPERSEDED | Manager | replaced by a newer report version | `version` | yes | — |

`report_sent` (closure precondition) binds to **SENT or later** as a real delivery event — never to a user-settable `COMPLETED`. `bulk-status` cannot drive any transition at/after SENT.

### E.7 Invoice
| From → To | Role | Conditions | CAS | Audit | Reversal |
|---|---|---|---|---|---|
| DRAFT → ISSUED | Manager | derived from approved estimate snapshot; unique `sourceInspectionId` | `status=DRAFT` idempotent | yes | back to DRAFT (if unsent) |
| ISSUED → PARTIALLY_PAID | system | payment < amountDue (atomic increment) | idempotent | payment event | — |
| ISSUED/PARTIALLY_PAID → PAID | system | amountPaid ≥ total | idempotent | payment event | — |
| any → VOID | Manager/Owner | void reason; no prior full payment | `status` | yes | **not reversible** — reissue new invoice |

### E.8 Payment
| From → To | Role | Conditions | CAS | Audit | Reversal |
|---|---|---|---|---|---|
| (record) manual/EFT/card/partial | Manager (manual) / system (Stripe) | atomic `amountPaid` increment; ledger row written | idempotent (event id / key) | payment event | refund (below) |
| (record) REFUND | Manager/Owner | refund reason; atomic decrement | idempotent | refund event | — |

### E.9 Closure gate (evaluated on IN_BILLING → CLOSED)
Preconditions (all): **report delivered** (E.6 ≥ SENT with a delivery event) · **financial state validated** — an invoice exists and is **reconciled** (issued and its payment ledger balances; full payment is org-configurable, default not required to close) · required approvals present · no open WHS incident or unresolved suspected-ACM strip-out · no pending estimate variation. Writes hash-chained `ProgressTransition` with the precondition snapshot. Reversal: `reopen_job` with reason + authority (audited).

### E.10 External share / Margot action / AI execution
- **External share:** `ACTIVE → REVOKED` (Manager/Owner, `revokedAt`, audited) or `ACTIVE → EXPIRED` (system, TTL). Per-recipient, scoped (spec §30 SEC-2).
- **Margot action:** `PROPOSED → CONFIRMED → APPLIED` — APPLIED only via a domain service at the invoking human's role; closure and pricing transitions are `PROHIBITED` to Margot (spec §24). Every APPLIED action writes an audit event.
- **AI execution:** `QUEUED → RUNNING → (SUCCEEDED | FAILED)` with a lease ≥ handler maxDuration; a RUNNING job past its lease requeues (spec §32 CON-5). Cost recorded on the correct BYOK plane (spec §26).

## D. Seeded reference claim (spec §39)
The seeded scenario (RA water-damage, all five roles, UI/API only) is the V1 exit gate. Each capability above must pass within it. Status: `TODO` — authored as a fixture + e2e in Phase 6, exercised incrementally as phases land.

## Coverage summary
- Data ownership rows: 20 (2 DONE, 6 PARTIAL, 12 TODO).
- Lifecycle capabilities: 13 (0 DONE, 5 PARTIAL, 8 TODO).
- Security/concurrency: 12 (0 DONE, 3 PARTIAL, 9 TODO).
Every row links to a workstream in `RESTOREASSIST-V1-BACKLOG.md` and, once built, to a named test (spec §38/§42).
