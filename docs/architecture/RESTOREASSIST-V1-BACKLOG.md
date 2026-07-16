# RestoreAssist — V1 Implementation Backlog (Document Seven)

The prioritised, executable backlog for V1, organised by the spec §41 phases. Each item: Priority · Dependency · Finding · Evidence · User/Business/Security/Concurrency impact · Files/domains · Required decision · Acceptance criteria · Verification · Rollback · Status. Priorities: P0 (containment) → P5 (operations). This is the completion of "document seven".

Execution rule (spec Appendix B): work the top ready item per phase; a phase does not start until its predecessor is evidenced complete; done means evidenced acceptance, never "it compiles".

---

## Phase 0 — Immediate containment (security & integrity)

### P0-1 — Private evidence & sketch storage
- **Finding:** `evidence-optimised` + `sketch-media` served from public Supabase buckets (RA-ARCH-01 H1). **Impact:** unauth read of customer damage evidence + floor plans; highest exposure. **Files:** `supabase/migrations/*evidence_buckets*`, `lib/storage/supabase-provider.ts`, `lib/sketch-storage.ts`. **Decision:** none (D-settled). **Acceptance:** buckets not public-readable; reads via short-lived signed URL; an object URL without a session returns 403 or expires; existing links migrated. **Verification:** security test asserting anon fetch fails; e2e that an authorised user still loads media. **Rollback:** revert policy migration + provider change. **Status:** TODO.

### P0-2 — Revocable, scoped share/insurer links
- **Finding:** non-revocable 30-day HMAC links sharing owner/insurer namespace (H2). **Impact:** leaked link unrevocable, no per-recipient scope/audit. **Files:** `app/api/reports/[id]/share-link`, `insurer-link`, `lib/portal-token.ts`. **Acceptance:** DB-backed opaque per-recipient token with `revokedAt` + scope; revoked link 401; owner and insurer tokens separately scoped and revocable. **Verification:** security + integration tests. **Rollback:** feature-flag old path. **Status:** TODO.

### P0-3 — Portal token namespace unification
- **Finding:** `/api/portal/[token]/*` served by two incompatible verifiers (M1). **Acceptance:** one revocable verifier across the namespace; revoking a portal account stops summary/PDF too. **Verification:** integration test that revocation blocks every sub-route. **Status:** TODO.

### P0-4 — Encrypt TOTP secret
- **Finding:** `twoFactorSecret` plaintext (M3). **Acceptance:** encrypted at rest via credential vault; existing rows backfilled; 2FA still verifies. **Verification:** unit + security test. **Status:** TODO.

### P0-5 — Ascora webhook replay guard
- **Finding:** no replay protection (M4). **Acceptance:** freshness window + event dedup before any state change. **Verification:** integration test replaying a signed request. **Status:** TODO.

### P0-6 — Preserve closure safeguard (PR #1967)
- **Finding:** bulk-status COMPLETED spoof (M2). **Status:** PARTIAL — PR #1967 open as temporary defence-in-depth; keep unmerged until assessed against the final report state model (spec §40); durable fix in P1-6.

---

## Phase 1 — Claim integrity

### P1-1 — Writable baseline/monitoring flags
- **Finding:** no write path sets `isBaseline`/`isMonitoringPoint`, so certification is unreachable (RA-V1-READINESS). **Dependency:** none. **Acceptance:** moisture POST accepts and persists both flags; a certified job can be produced end-to-end. **Verification:** integration + e2e certify path. **Status:** TODO.

### P1-2 — Latest-valid-reading drying logic
- **Finding:** drying-goal evaluates full history → never certifies. **Decision:** D-003. **Acceptance:** current state computed from latest valid reading per point/material; day-1 wet reading does not block; history retained. **Verification:** unit tests over reading sequences. **Status:** TODO. **Blocked-input (non-V1-blocking):** numeric thresholds from authorised methodology (scaffold proceeds).

### P1-3 — Controlled reading invalidation
- **Acceptance:** invalidation records original/reason/user/time/replacement/approval + audit; never deletes source. **Verification:** integration + audit-event assertion. **Status:** TODO.

### P1-4 — Field readings reach the report
- **Finding:** PDF reads hand-keyed blob not relational readings. **Acceptance:** report contains every field reading with no re-entry; PDF snapshot-diff stable. **Verification:** integration + snapshot test. **Status:** TODO.

### P1-5 — Protect report history / six-fact status
- **Acceptance:** report state distinguishes generated/approved/sent/delivered/acknowledged/superseded; transitions CAS-guarded. **Verification:** unit state-machine tests. **Status:** TODO.

### P1-6 — Durable closure semantics
- **Finding:** `report_sent` == user-settable COMPLETED. **Acceptance:** `report_sent` binds to a real delivery event; PR #1967 assessed and merged or superseded. **Verification:** security + e2e closure test. **Status:** TODO.

### P1-7 — ClaimProgress one protocol
- **Finding:** close/reopen mirror-writes skip version-CAS (RA-ARCH-02 H1). **Acceptance:** all ClaimProgress writers version-increment or route through the progress service. **Verification:** concurrency test. **Status:** TODO.

---

## Phase 2 — Financial integrity

### P2-1 — Rate card canonical
- **Decision:** D-001. **Acceptance:** `ScopeItem.suggestedRate` populated from `OrganizationPricingConfig`; no hardcoded price in any prod path (the $50/line path deleted). **Verification:** unit + grep-guard test. **Status:** TODO.

### P2-2 — Immutable estimate snapshot
- **Decision:** D-002. **Acceptance:** approve freezes rate-card version/rate/unit/qty/tax/desc/adjustment/approver/time; later rate-card change does not alter it. **Verification:** unit + integration. **Status:** TODO.

### P2-3 — Invoice from approved estimate
- **Finding:** $50 hardcode + oldest-client bug; caller-less estimateId contract. **Acceptance:** invoice lines derive from estimate snapshot; customer via `Inspection.clientId`; duplicate blocked by unique `Invoice.sourceInspectionId`. **Verification:** integration + idempotency + e2e. **Status:** TODO.

### P2-4 — Payment ledger + reconciliation
- **Finding:** Stripe PAID w/o ledger; stale RMW; add-on paywall vs closure. **Acceptance:** manual/EFT/partial/refund via atomic increment; Stripe writes `InvoicePayment`; closure sees correct paid state; recording not paywalled. **Verification:** unit + concurrency + idempotency. **Status:** TODO.

### P2-5 — Web idempotency + constraint dedupe
- **Finding:** idempotency layer inert on web; external-payment dedupe not constraint-backed (C1/M3). **Acceptance:** shared fetch helper attaches Idempotency-Key; partial-unique on externalPaymentId. **Verification:** concurrency/idempotency tests. **Status:** TODO.

---

## Phase 3 — Canonical data reuse

### P3-1 — Report↔Inspection link (keystone)
- **Acceptance:** existing `Inspection.reportId` FK populated by backfill; address-string join removed. **Verification:** integration + backfill dry-run report. **Status:** TODO.
### P3-2 — Client identity spine
- **Acceptance:** `Inspection.clientId` FK; picker forms; backfill by name+phone with manual-review queue for ambiguous pairs; generate-invoice uses FK. **Verification:** integration + isolation. **Status:** TODO.
### P3-3 — Insurer + claim number spine
- **Acceptance:** `insurerProfileId` FK + `claimNumber` column; metadata-JSON promoted; free-text matched. **Verification:** integration. **Status:** TODO.
### P3-4 — Room/geometry derivation + retire Room
- **Acceptance:** dims/area/volume derive from twin in a transaction (derivationStale on failure, not swallowed); scope/equipment/PDF consume derived values; `Room`/`RoomAnnotation` dropped after prod row-count check. **Verification:** unit + integration + prod-count evidence. **Status:** TODO.
### P3-5 — Deprecate competing report blobs
- **Acceptance:** authorable Report JSON stores reclassified as snapshots/caches; single editable owner per datum. **Verification:** integration. **Status:** TODO.

---

## Phase 4 — Margot V1 activation

### P4-1 — Claim-context service
- **Acceptance:** `lib/margot/context.ts` returns `ClaimContext` (stage, missingFields, evidenceGaps, completeness%, wetReadings, nextActions) from one bounded query; degrades safely on missing claim. **Verification:** unit. **Status:** TODO.
### P4-2 — Claim-aware chatbot on the gateway
- **Acceptance:** chatbot receives claim id, injects context; routes through client-plane BYOK gateway with budget+logging (task `ops_chat`); no house-key fallback. **Verification:** integration + security. **Status:** TODO.
### P4-3 — Completeness engine + surfaces
- **Decision:** D-004. **Acceptance:** deterministic water-damage pack returns facts/missing/conditional/contradictions/risks/next/blocking/human w/ rule sources; claim banner + field queue read it; org rules extend not weaken. **Verification:** unit rule tests + e2e banner. **Status:** TODO.
### P4-4 — Margot capability matrix + action audit
- **Acceptance:** every Margot action classified (read/draft/confirm/manager/owner/prohibited); mutations ≥ human-confirmation; closure+pricing prohibited; actions audited. **Verification:** security + integration. **Status:** TODO.

---

## Phase 5 — Scheduling and V1 operations

### P5-1 — Minimum scheduling model + API
- **Decision:** D-005. **Acceptance:** appointment (start/end), assignment (tech/team + required role/competency), claim/customer/property link, status, site constraints, reschedule, cancel, acknowledgement, calendar/list, audit. **Verification:** unit + integration + isolation. **Status:** TODO.
### P5-2 — Scheduling UI + role boundaries
- **Acceptance:** manager books/assigns; tech sees+acknowledges; role+org enforced server-side; accessible. **Verification:** e2e (manager + technician) + accessibility check. **Status:** TODO.

---

## Phase 6 — Seeded V1 verification

### P6-1 — Seeded reference claim fixture + e2e
- **Acceptance:** the spec §39 scenario runs end-to-end for Owner/Admin/Manager/Technician/Customer via UI+API with no direct DB manipulation; every capability row passes within it. **Verification:** full e2e run + collected evidence; re-score V1 readiness. **Status:** TODO — the V1 exit gate.

---

## Sequencing notes
- Phase 0 is parallel-safe internally and should land first (containment).
- Phase 1 and Phase 3 identity work can overlap; P3-1 (Report↔Inspection link) is a keystone many rows depend on.
- Phase 2 money path is strictly sequential (P2-1 → P2-2 → P2-3 → P2-4).
- Phase 4 Margot depends on Phase 1/3 canonical data being trustworthy.
- Phase 5 scheduling is largely independent and can proceed in parallel once Phase 0 lands.
- Phase 6 is the gate, not a parallel stream.
