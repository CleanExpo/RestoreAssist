# RestoreAssist — Master Specification

**Status:** CANONICAL — frozen for V1 implementation (2026-07-17)
**Owner:** Phill McGurk · **Entity:** UNITE-GROUP NEXUS PTY LTD · **Repo:** `CleanExpo/RestoreAssist`
**Supersedes:** the prior `spec.md` production-readiness gates document (retained verbatim in Appendix A).

> **This document is the single source of truth.** Where the codebase and this specification differ, this specification defines the approved target and the difference is a tracked gap (see `docs/architecture/RESTOREASSIST-TRACEABILITY.md`). The spec must be kept current as implementation evolves: any change to product behaviour during build triggers a spec update and a decision record (§44). No backlog item is "done" on "it compiles" — done requires the evidence named in its acceptance criteria (§38, §42).

> **Consolidation basis.** This spec reconciles the prior repo `spec.md`, `RA-AUDIT-SPEC`, `RA-INVENTORY`, `RA-V1-READINESS`, the four claim-lifecycle dry-run reports, and the seven architecture reviews (`RA-ARCH-01`..`07`). Contradictions resolved and content superseded are logged in `docs/architecture/RESTOREASSIST-SPEC-RECONCILIATION.md`.

---

## 1. Product identity

RestoreAssist is an **AI-native restoration operations system**. It connects the complete restoration-job lifecycle — first notification, scheduling, inspection, drying, scope, reporting, invoicing, payment, closure — through **one canonical operational record per claim**.

It is explicitly **not** merely a CRM, a report builder, an inspection form, a chatbot, a learning-management system, an accounting product, or a sketching tool. It may contain elements of several of these, but its identity is the connective operational record, not any single surface.

Governing principle:

```
Capture once. Validate once. Reuse everywhere.
```

Core purpose: help restoration organisations create **complete, defensible, operationally useful** claim records while reducing repeated entry, missed information, and administrative pressure.

## 2. Product principles

1. **One canonical record.** Every claim fact has exactly one canonical, editable owner (§8). Competing editable sources are prohibited.
2. **Capture once, reuse everywhere.** No datum entered on a claim is re-keyed downstream.
3. **Deterministic truth, AI assistance.** Deterministic services own required-information rules, validation, completeness, pricing maths, drying calculation, and state transitions. AI (Margot) explains, prioritises, drafts, and assists — it never originates a compliance rule, price, drying threshold, or state change.
4. **Evidence-grade by construction.** Operational history is immutable and append-only where it carries legal or dispute weight; provenance is preserved; distribution and closure are gated.
5. **Organisation-owned commercials.** The platform prescribes no restoration prices; each organisation owns its rate card.
6. **The spec is the source of truth** and is kept current with implementation (§44).
7. **Done means evidenced.** Completion requires the acceptance evidence in §38, not a successful compile.

## 3. Personas and roles

| Role | Scope |
|---|---|
| **Owner** | Full organisation control, commercial config, go/no-go, all data within the organisation. |
| **Administrator** | Organisation configuration, users, rate cards, integrations, audited impersonation. |
| **Manager** | Claim oversight, approvals (estimate, closure), assignment, cross-technician visibility. |
| **Technician** | Field capture, drying, scope quantities, own assigned claims; acknowledges appointments. |
| **Customer portal user** | Read/approve on their own claim's shared artefacts; submit quarantined evidence. |
| **External (insurer / referrer)** | Time-boxed, revocable, scoped read of shared report artefacts. |
| **Margot** | A context-aware assistant layer acting *through* the same services as a human of the invoking role (§7, §24). |

All access is organisation-isolated. Role is enforced server-side on every write; JWT role claims are re-validated against the database for privileged actions.

## 4. V1 scope

V1 is complete when a restoration organisation can legitimately operate a representative **water-damage** claim from first notification to closure without bypassing controls or re-entering canonical data. The full V1 inclusion list is §10–§37 read as requirements; the boundary summary:

**In V1:** organisation isolation and roles; direct and partner intake with full site logistics; minimum scheduling and dispatch (§11); inspection capture with measurement provenance and offline replay; drying with immutable history and legitimately-achievable certification; scope from organisation rate card; estimate versioning with immutable commercial snapshot; report generation from canonical sources with delivery evidence; invoicing from the approved estimate; payment reconciliation with idempotency; server-validated closure; Margot read/draft assistance over authorised claim context with a deterministic completeness feed; and the security, concurrency, audit, and offline requirements of §30–§34.

**V1 claim-type focus:** water damage. The completeness and rule architecture must be claim-type-extensible (§25) but only the water-damage rule pack ships in V1.

## 5. V1.x scope (architecturally allowed, not release blockers)

Advanced LiDAR workflows; public property-plan discovery; automated plan scraping; AI plan reconstruction; advanced freehand affected-area painting; AI contents recognition; serial/model extraction; replacement-cost research; full contents pack-out intelligence; client contents search portal; advanced box tracking; historical-job machine learning; route and dispatch optimisation; fire/mould/biohazard completeness rule packs; full CARSI embedded-learning integration; advanced automated scope generation.

**Preserve any working implementation of these.** Do not remove or rebuild a capability merely because it is classified V1.x. Dark/partial assets (LiDAR ingest, contents vision, similar-jobs, meter OCR) remain in place and are wired in V1.x, not deleted.

## 6. Claim lifecycle

```
Intake → Scheduled → Inspection → Drying → Scope → Estimate (approved)
      → Report (generated → sent → delivered) → Invoice → Payment → Closed
                                                                  ↘ Reopened (reason + authority)
```

Each stage is a state in an explicit machine (§9). Progression is server-validated against required conditions, evidence, role, and approvals. The canonical claim-level state is `ClaimProgress.currentState` (append-only, hash-chained); inspection, report, invoice, and payment each run their own sub-state machine that maps into it (§9). No single overloaded status stands for multiple operational facts.

## 7. Domain architecture

Layering (top consumes down; no layer bypasses the one below):

```
UI / API routes / Customer portal / Margot surface
        ↓ (never around)
Domain services  — validation, authorisation, transactions, state transitions, audit
        ↓
Canonical data (Prisma/Postgres)  + object storage (private) + RAG corpora
```

- **Domain services** are the only writers of canonical data. They own validation, org-boundary checks, transaction boundaries, idempotency, state transitions, and audit emission.
- **Margot** and **UI** are peers above the service layer. Margot never writes around a domain service (§24).
- **AI providers** are reached only through the BYOK gateway (§26); RAG only through the provenance-tiered retrieval gateway (§24, §26).

## 8. Canonical data ownership

The final source-of-truth matrix. For each datum: **canonical model** (sole editable owner), **writer** (service/route), **allowed editors** (roles), **derived/snapshot** consumers, **legacy duplicate to retire**, **migration**, **concurrency control**. Full per-field rows live in `docs/architecture/RESTOREASSIST-TRACEABILITY.md`; the ownership decisions:

| Datum | Canonical owner | Legacy duplicate retired | Concurrency |
|---|---|---|---|
| Organisation | `Organization` | — | version |
| Customer | `Client` (+ `Inspection.clientId` FK) | `Report.clientName` free-text (→ display cache); name-match heuristic | version |
| Claim / property / address | `Inspection` (+ populated `Inspection.reportId`) | `Report.propertyAddress`; address-string join | version |
| **Water Category (S500 Cat 1/2/3) + Class (1–4)** | `Inspection` classification fields (cited to S500) | ad-hoc/absent | version |
| **Loss timeline — cause of loss, date of loss, date notified, first-attendance date/time** | `Inspection` required timeline fields | free-text "incident" | version |
| **Hazards (typed: asbestos/ACM, electrical, structural, biological) + WHS pathway status** | `Hazard` (sketch/inspection-anchored, typed enum + status) | free-text/`Report.hazardType` narrative | version |
| **Pre-work safety record (SWMS/JSA), signed + timestamped** | `AuthorityFormInstance` of type safety-record (or dedicated safety model) | absent | append |
| **Authority to dispose (per strip-out / contents disposal)** | `AuthorityFormInstance` of type disposal, linked to the disposed item/scope | absent | append |
| Site access / parking / animals / occupants / storeys / access difficulty | `Inspection` structured fields | free-text scattered copies | version |
| Insurer + claim number | `InsurerProfile` via `Inspection.insurerProfileId` FK + `Inspection.claimNumber` | metadata-JSON pointer; `Report.insurerName` free-text | version |
| Rooms / geometry / dimensions / cubic volume / affected area | `SketchElement`/`ClaimSketch` twin (operator-measured provenance) | dormant `Room`/`RoomAnnotation` (retire); typed `AffectedArea` dims → derived + override | best-effort → transactional derivation |
| Moisture monitoring points + readings | relational `MoistureReading` | `Report.moistureReadings` JSON blob; `SketchMoistureReading` → pin projection | append + invalidation event |
| Atmospheric / psychrometric | `PsychrometricReading` (per-visit) + `EnvironmentalData` (per-chamber) | Report JSON copies | append |
| Equipment + placement + runtime | `EquipmentDeployment` re-anchored to `inspectionId` | `Report.equipmentSelection`/`equipmentPlacement` JSON | version |
| Contents / containers / movements | `ContentsPackOutItem` (+ PATCH) | client-state-only manifest | version |
| Images / documents | `InspectionPhoto` (file owner); `EvidenceItem`/`MediaAsset` reference via FK | unlinked parallel tables | append |
| Scope | twin-side `ScopeItem` | `Report.scopeOfWorksData` JSON; wizard hardcoded rates; `Scope` → immutable snapshot | version |
| Rate cards | `OrganizationPricingConfig` (canonical editable pricing) | hardcoded rate cards | version |
| Estimates | `Estimate`/`EstimateLineItem` from ScopeItems, priced from rate card | `CostEstimate` (retire) | version + status CAS |
| Invoices / lines | `Invoice`/`InvoiceLineItem` from approved estimate snapshot | `$50` hardcode path; caller-less contract → wired | idempotent + status CAS |
| Payments | `InvoicePayment` ledger (atomic increments) | Stripe PAID-without-ledger | idempotent |
| Communications | `Communication`/history models | — | append |
| Reports | `Report` (versioned snapshots; sources are canonical records) | authorable JSON blobs → snapshots | status CAS |
| Approvals / signatures | `AuthorityFormInstance`/`AuthorityFormSignature` | dead `FormSignature` cluster (retire) | append |
| Closure evidence | append-only `ProgressTransition` (integrityHash) | — | version CAS |
| Completeness findings | computed projection (`lib/margot/completeness.ts`), not stored authorable | duplicate gap engines unified | n/a (derived) |

**JSON blobs** may remain **only** when formally classified as immutable snapshots, import payloads, export payloads, cached projections, or temporary migration structures — never as a parallel editable claim record.

## 9. State machines

Explicit machines are defined for: Claim, Inspection, Drying, Scope, Estimate, Report, Invoice, Payment, Closure, External share, Margot action, AI execution. Each transition specifies: current state, permitted next states, required role, required conditions, required evidence, idempotency behaviour, concurrent-update behaviour (CAS predicate), audit event, and reversal/reopen rule. Per-machine tables live in `docs/architecture/RESTOREASSIST-TRACEABILITY.md`. Load-bearing rules:

- **Claim** (`ClaimProgress.currentState`) is master; all writers use version-CAS `updateMany({ where: { id, version } })`. Close/reopen mirror-writes must participate in the same protocol (fixes RA-ARCH-02 H1).
- **Report** distinguishes six facts that must not collapse into one status: **generated, approved, sent, delivered, acknowledged, superseded.** `ReportStatus.COMPLETED` is **not** the sole proof of delivery. Closure's `report_sent` precondition binds to a real delivery event, not a user-settable status (fixes RA-ARCH-01 M2; see §23 and Draft PR #1967 in §40).
- **Drying** certification (`DRYING_ACTIVE → DRYING_CERTIFIED`) is legitimately achievable: monitoring-point/baseline flags are writable, and the goal evaluates the **latest valid reading per point/material**, not full history (§14; fixes RA-V1-READINESS drying defects).
- **Payment/Invoice** transitions are idempotent with atomic money-field increments (§22).

## 10. Intake

Direct and partner (DR/NRPG, Ascora) intake create one `Inspection` with `source`. Captured at intake: customer (`Client` picker, not free-text), claim/incident, property, insurer/referrer where applicable, the **loss timeline** — cause of loss, date of loss, date notified, and first-attendance date/time (required; date of loss governs coverage and mould causation, first-attendance evidences the duty to mitigate) — and **site logistics** — access instructions, parking constraints, container-placement constraints, animals, occupants, storeys, navigation difficulty, initial hazard information, contact/communication history. Partner intake maps claim number and address onto the `Inspection` at creation (no re-entry). Customer-initiated intake and inbound-email FNOL remain V1.x; V1 intake is staff- or partner-originated.

Acceptance: creating a claim requires a `Client` selected from the organisation's records (or created inline) and a recorded date-of-loss and cause-of-loss; the address, claim number, loss-timeline, and site-logistics fields are written once to `Inspection` and read unchanged by inspection, report, portal, and invoice.

## 11. Scheduling and dispatch

Minimum scheduling is **in V1** (resolves the prior contradiction). V1 supports: appointment with start/end time; assigned technician or team; link to claim + customer + property; current status; access instructions, parking, animals/occupant alerts; required equipment; required competency/role; reschedule; cancel; technician acknowledgement; calendar or list view; audit history.

"Required competency" in V1 is an **RA-local skill/role tag** on the technician and appointment (an enum/tag owned by the organisation), not a lookup against CARSI credentials; CARSI-credential-gated dispatch is V1.x (it would introduce a cross-system dependency V1 does not otherwise build).

V1 excludes (→ V1.x): automated route optimisation, AI workforce optimisation, capacity forecasting, multi-depot/dynamic-traffic routing, subcontractor marketplaces, CARSI-credential-gated dispatch.

Acceptance: a manager creates an appointment against a claim, assigns a technician with a required role, and the technician sees and acknowledges it; reschedule and cancel emit audit events; assignment respects role/competency and organisation isolation.

## 12. Inspection

Field-mode capture (offline-first, IndexedDB replay): authority documentation; **water Category (S500 Cat 1/2/3) and Class (1–4) classification**, cited to the standard applied — this drives PPE, containment, contents restore-vs-replace, mandatory strip-out, and equipment sizing, so it is a required canonical datum, not a report-time derivation; **structured hazard assessment** across typed classes (asbestos/ACM, electrical, structural, biological) each with a WHS pathway status (suspected / assessed / licensed-removal-required / cleared) — suspected ACM blocks strip-out scope until a pathway is recorded; a **signed, timestamped pre-work safety record (SWMS/JSA)** captured before a technician enters the structure; property structure; rooms; dimensions; ceiling height; area; cubic volume; affected geometry; images; notes; moisture and atmospheric readings; **measurement provenance** (only `operator_measured` geometry feeds drying/scope calcs — the provenance firewall, RA-ARCH-06 (a)); offline capture and replay with duplicate-safe reconciliation. The guided-capture surface is reachable by technicians (not admin-only). Homeowner capture lands in a quarantine sidecar and never feeds compliance until a technician promotes it.

Acceptance: a water claim records a Category and Class with a standard citation before scope generation; a hazard marked suspected-ACM blocks strip-out scope until a WHS pathway is recorded; the pre-work safety record is captured and signed before drying/strip-out work is actioned, and is reproducible from the claim years later.

## 13. Property twin and sketch

The `ClaimSketch`/`SketchElement` twin is the canonical geometry. Dimensions, area, and cubic volume derive from operator-measured elements in a transaction (derivation is not best-effort/swallowed; on failure the sketch is stamped `derivationStale`, not silently divergent — fixes RA-ARCH-02 M2). One `ClaimSketch` per floor enforced by unique constraint. `Room`/`RoomAnnotation` are retired after a prod row-count check (§40). LiDAR RoomPlan ingest is preserved but wired in V1.x.

## 14. Drying and monitoring

- Baseline readings, monitoring points, daily readings, trend history, equipment placement/movement/runtime, drying goals, exceptions, professional override with reason, completion certification, full historical evidence.
- **Immutable history.** Historical readings are never deleted because a later result improved. Current drying state is computed from the **latest valid reading per monitoring point / material / assembly / room**. Earlier readings remain for trend, reporting, audit, dispute, and drying-duration calculation.
- **Controlled invalidation only.** A reading may be marked invalid only via an action recording original reading, reason, user, time, replacement (where applicable), approval requirement, and audit event. Invalidation never physically deletes the source.
- **Certification is legitimately achievable:** the moisture write path sets `isBaseline`/`isMonitoringPoint`; the certify guard evaluates latest-valid-per-point. Drying-goal thresholds are backed by authorised business methodology; AI never invents thresholds or replaces deterministic calculation.

## 15. Equipment

`EquipmentDeployment` (re-anchored to `inspectionId`) owns placement, movement, and runtime, with a real write surface in the field flow (place/remove/runtime) and from the equipment calculator. Runtime feeds invoicing (equipment days) and drying context. Report JSON equipment blobs become render caches.

## 16. Contents

`ContentsPackOutItem` owns inventory with per-item condition, photos, and restore/replace decision; a PATCH path exists (edit, not delete-and-recreate). A decision of replace/dispose is **not actionable without a linked authority-to-dispose** (§8) — a customer's property may not be disposed of without documented, specific consent tied to the item or strip-out. The same disposal-authority gate applies to structural strip-out. V1 captures contents manually; AI contents recognition, serial/model extraction, replacement-cost research, and pack-out intelligence are V1.x (existing implementations preserved).

Acceptance: marking a contents item or strip-out for disposal requires a linked, signed disposal authority; disposal without it is rejected and audited.

## 17. Scope

Twin-side `ScopeItem` is canonical, derived from operator-measured geometry, moisture, and captured equipment, each with IICRC clause citation. `ScopeItem.suggestedRate` is populated from the organisation rate card (§18). The report-side `Scope` becomes an immutable approval snapshot; the hardcoded-rate wizard and `Report.scopeOfWorksData` authorable JSON are retired.

## 18. Organisation pricing

The **organisation rate card (`OrganizationPricingConfig`) is the canonical, editable pricing source.** The platform prescribes no prices. No production path uses hardcoded generic restoration pricing (the `$50/line` path is deleted). Canonical commercial flow:

```
Organisation rate card → scope quantities → estimate version
→ rate + GST snapshot → approval → invoice draft → human review
→ accounting sync → payment reconciliation
```

## 19. Estimates

`Estimate`/`EstimateLineItem` generate from ScopeItems, priced from the rate card, with GST, versioning, and approval. An **approved estimate stores an immutable commercial snapshot**: rate-card version, rate, unit, quantity, tax treatment, description, adjustment, approver, timestamp. `CostEstimate` is retired.

Acceptance: approving an estimate freezes a snapshot no later edit mutates; a subsequent rate-card change does not alter an approved estimate.

## 20. Reports

Reports are versioned snapshots whose **sources are the canonical operational records** (twin geometry, relational moisture, equipment history, scope, photos, signatures) — not re-keyed JSON. Field moisture readings reach the final report (the PDF reads the relational store, not a hand-keyed blob — fixes RA-V1-READINESS #4). A report carries photographic evidence, moisture history, equipment history, scope, signatures, approval, integrity record, and **delivery evidence** (§9 six-fact status).

Acceptance: a report generated from a claim contains every moisture reading captured in the field for that claim, with no manual re-entry; report status distinguishes generated/approved/sent/delivered.

## 21. Invoices

An invoice **derives from the approved estimate snapshot** (the `estimateId` contract is wired to a caller), with correct customer (resolved via `Inspection.clientId`, not oldest-client), correct organisation, correct line items, accounting integration (Xero/QBO/MYOB), and idempotent creation (unique `Invoice.sourceInspectionId`; fixes RA-ARCH-02 C1). An authorised user may record a documented adjustment; no silent divergence from the estimate.

## 22. Payments

`InvoicePayment` is the single ledger. Manual, EFT, partial, credit, and refund are recorded via atomic in-transaction `increment`/`decrement`; status is derived from the resulting row (fixes RA-ARCH-02 C2). The Stripe webhook writes an `InvoicePayment` row and maintains `amountPaid` (no PAID-without-ledger). Manual payment recording is not paywalled when `invoice_paid` gates closure (fixes RA-V1-READINESS #3). External payment dedupe is constraint-backed (fixes RA-ARCH-02 M3).

## 23. Closure

Closure is server-validated: no generic status bypass; requires delivered-report evidence (bound to a real delivery event, not a user-settable `COMPLETED`), **validated financial state** — an invoice must exist and be reconciled (issued with a balancing payment ledger); **full payment is not required to close by default and is an organisation-configurable precondition** — required approvals, and writes hash-chained `ProgressTransition` audit evidence. (Full closure gate in traceability §E.9.) The ungated `bulk-status` COMPLETED path cannot satisfy `report_sent` (Draft PR #1967, §40). Reopening requires reason and authority and is audited.

## 24. Margot

Margot is a layer over the operational platform, never a parallel source of truth. Flow:

```
Canonical claim data → deterministic validation + completeness rules
→ structured findings + next actions → authorised Margot context
→ explanation / prioritisation / drafting → human-confirmed action
→ canonical write service → audit event
```

Margot answers: *what do we know, what is missing, what should happen next, what is a risk, what evidence is required.* Margot is **not** a general FAQ bot, a substitute for a qualified restorer, an insurer, a coverage decision-maker, a certification authority, an autonomous claim closer, a CARSI replacement, or the source of mandatory compliance rules.

- **One claim-context service** (`lib/margot/context.ts`) composes the teacher-context derivation + evidence submission gate into one `ClaimContext` (RA-ARCH-04 ADR-1), consumed by the claim-aware chatbot, the (V1.x) capture coach, and background checks.
- **Two surfaces, one brain:** the founder-PA admin plane stays separate; the tech-facing chatbot becomes claim-aware by passing the claim id and injecting `ClaimContext`.
- **Margot writes only through domain services** with the same validation, authorisation, transactions, idempotency, state transitions, and audit as human actions.
- **Capability matrix** (each Margot action classified): read-only · draft-only · human-confirmation · manager-approval · owner-approval · prohibited. Full matrix in `docs/architecture/RESTOREASSIST-TRACEABILITY.md`. Every AI-suggested claim mutation is at minimum human-confirmation; closure and pricing changes are prohibited to Margot.

## 25. Completeness engine

Completeness is **deterministic, explainable, and stage-specific — not one universal percentage.** Evaluated by claim type, lifecycle stage, jurisdiction, organisation policy, applicable hazards, work undertaken, required approvals, and required evidence. Returns: known facts, missing requirements, conditional requirements, contradictions, risks, recommended next actions, blocking requirements, human decisions, and the **source of each rule**. Organisation requirements may *extend* the platform baseline but never silently weaken mandatory platform safety/integrity controls. The completeness output is an **advisory projection** (traceability DO-20): its `blockingRequirements` field advises the human and is surfaced in the UI, but it does **not** itself gate a state transition — enforcement lives in the state machines (§9) and closure gate (§23). The exact per-stage water-damage rule *content* (beyond the §25 baseline minimum) carries the same scaffold latitude granted to drying numeric thresholds (§14): the engine and its S500-cited rule structure build now; the full rule list is an authorised-methodology input tracked as non-blocking (§43). Lives in `lib/margot/completeness.ts` (extends the submission-gate pattern; not a fourth parallel engine). V1 ships the **water-damage** rule pack; architecture supports later packs for fire/smoke, mould, biohazard, trauma, storm, contents-only, general. The water-damage pack's baseline (extensible per organisation, never weakenable below it) must at minimum require: a recorded water Category and Class with citation; a complete loss timeline (cause, date of loss, notified, first-attendance); a signed pre-work safety record; a WHS pathway for any suspected ACM before strip-out; baseline and monitoring-point readings; and a linked disposal authority for any disposed item.

## 26. BYOK and AI providers

Customer-facing generative AI is **bring-your-own-key** unless a specific commercial feature states otherwise. The existing provider abstraction is retained and assessed before any replacement. The spec distinguishes four planes; **no AI call silently shifts cost between parties**:

| Plane | Funded by | Examples |
|---|---|---|
| Deterministic platform processing | platform | validation, completeness rules, indexing |
| RestoreAssist-funded AI | platform (only where the commercial model approves) | limited essential service functions |
| Customer-key AI | customer | Margot conversations, report/scope drafting, contents recognition, image/serial analysis, replacement-cost research, plan interpretation, org reasoning |
| Optional provider fallback | as declared | cross-provider fallback where the customer's keys allow |
| Prohibited fallback | — | any silent house-key substitution for a customer-key call |

`lib/ai/workspace-byok-dispatch.ts` is the single client-plane gateway (budget + logging + model policy); the platform gateway serves only platform-plane calls. House-key call sites that serve customer features are migrated (RA-ARCH-04 ADR-5).

## 27. CARSI boundary

**CARSI trains; RestoreAssist guides; Margot helps the user apply and document.** CARSI is the canonical owner of formal courses, lessons, assessments, learner progress, credentials, and IICRC continuing-education records. RestoreAssist may include contextual procedure guidance, safety prompts, operational refreshers, organisation SOPs, links into *entitled* CARSI learning, and CARSI completion checks where commercially required. A RestoreAssist subscription does **not** automatically grant access to paid CARSI courses. No LMS surface is built into RestoreAssist.

## 28. Entitlements

Feature access is entitlement-gated per organisation (existing add-on model). Entitlement checks precede paid features and Margot capabilities. Payment recording required for closure is not gated behind an add-on (§22). Entitlements never weaken mandatory safety/integrity controls.

## 29. External integrations

Accounting (Xero/QBO/MYOB) sync with idempotency and constraint-backed dedupe; partner dispatch (DR/NRPG) inbound with HMAC + freshness + ordering marker; Ascora FSM sync. All webhooks verify signatures constant-time, fail closed on unset secret, and carry replay protection (Ascora replay guard added — RA-ARCH-01 M4).

## 30. Security

Integrate all `RA-ARCH-01` findings. Every write path defines authentication, authorisation, organisation boundary, validation, transaction boundary, unique constraint, idempotency key, locking, conflict response, retry policy, audit event, recovery path. Priority resolutions: private evidence + sketch storage (no public buckets; signed URLs) [H1]; DB-backed revocable, per-recipient, separately-scoped share/insurer links [H2]; portal token-namespace unification on one revocable verifier [M1]; closure-spoof fix [M2, PR #1967]; TOTP secret encryption [M3]; privileged-action protection; Ascora replay guard [M4]; org-scoped originals RLS [M5]; hashed portal/signing tokens [L4].

## 31. Privacy

Australian data residency; property/personal data minimisation; access controls tested; audited impersonation; customer-evidence quarantine; no secrets in code or logs; retention aligned to long-term claim-defence needs (§34).

## 32. Concurrency and idempotency

Integrate all `RA-ARCH-02` findings. Web mutations carry idempotency keys via one shared fetch helper [C1]; money-field writers use atomic increments with in-transaction status derivation [C2]; report status uses a transition matrix + per-row CAS [C3]; `ClaimProgress` mirror-writes participate in version-CAS [H1]; long-running handlers use leases ≥ their duration; `ScheduledEmail`, `AgentTask`, and cron runners use CAS claims / stale-sweeps / advisory locks [H2–H5]; unique constraints back all find-then-create paths [M1, M3]; offline/mobile edits carry version preconditions [M6].

## 33. Mobile and offline

Offline-first field capture with durable mutation queue, per-mutation idempotency keys, stale-processing recovery, and version-preconditioned replay so an offline device cannot silently clobber concurrent edits (fixes RA-ARCH-02 M6). Capacitor wraps the live app; the `MobileInspection` reconciliation lane is either wired or removed (no orphaned model).

## 34. Audit and evidence

Append-only, hash-chained `ProgressTransition` for lifecycle events; chain-of-custody on evidence; signature capture with IP/UA/timestamp; **photographs bound to timestamp, geotag where available, and the room/element they evidence** (so "this image was taken at this property on this date, showing this element" is provable); immutable drying and reading history; long-term retention for claim defence years later. No mutable field masquerades as an audit trail.

## 35. Analytics

Operational analytics (claim throughput, drying duration, completeness trends, revenue) read canonical records and derived projections; no analytics path becomes a competing editable source.

## 36. Accessibility

WCAG AA: ARIA labels, keyboard navigation, colour contrast, screen-reader text, focus management; field mode usable one-handed in bright light with gloves.

## 37. Operational support

Deploy is repeatable and documented; rollback tested; a non-builder can run the system from docs; observability via Vercel + `lib/observability.ts` (no Sentry); alerts edge-triggered on state change.

## 38. Acceptance criteria

Every V1 capability has testable acceptance criteria. Banned: "works correctly", "supports reporting", "AI assisted", "secure", "integrated", "user friendly" without measurable conditions. Each criterion states: starting state, user role, user action, expected system behaviour, expected data write, expected audit event, expected failure behaviour, expected concurrency behaviour, expected offline behaviour where relevant. Each V1 requirement maps to one or more of: unit, integration, security, organisation-isolation, concurrency, idempotency, end-to-end tests, accessibility checks, manual evidence checks. The requirement→test map is `docs/architecture/RESTOREASSIST-TRACEABILITY.md`.

## 39. Seeded V1 reference claim

One canonical seeded end-to-end scenario: a synthetic Australian water-damage claim with partner-or-direct intake, customer, property, **recorded loss timeline (cause, date of loss, first attendance)**, difficult access, restricted parking, a dog on site, two storeys, container-placement assessment, multiple rooms, partial-room affected areas, **a recorded water Category and Class**, **a signed pre-work safety record**, a typed hazard with WHS pathway, an authority form, baseline readings, daily monitoring across multiple points, equipment placement + movement + runtime, photographs, contents items with a **disposal authority** on any disposed item, box location, scope, organisation rate card, estimate, approval, report, delivery, invoice, EFT payment, and **accounting reconciliation against Xero** (the V1 exit-gate accounting provider; QBO/MYOB supported but not required for the exit gate), closure, and Margot completeness guidance. It is run as Owner, Administrator, Manager, Technician, and Customer-portal user, through the supported UI and API paths with **no direct database manipulation**. Passing this scenario is the V1 exit gate (§42, §12 of the implementation sequence).

## 40. Migration and deprecation

Sequenced in §41 phases; full per-datum migration and risk in `docs/architecture/RESTOREASSIST-TRACEABILITY.md` (derived from RA-ARCH-03). Preconditions: **prod row-count audit** of every dead store (`Room`, `RoomAnnotation`, `FloorPlan.dimensions`, `LidarScan.dimensions`, `EquipmentDeployment`, `CostEstimate`, `FormSignature` cluster) before any drop — "zero writers in code" is not "zero rows in prod". Client/insurer dedupe requires phone/email agreement before auto-merge; ambiguous pairs park for manual review; legacy free-text is retained as a display cache, never deleted.

**Draft PR #1967** (block `bulk-status` from setting `COMPLETED`) remains **unmerged** and is classified as a **temporary defence-in-depth fix**: it is compatible with the final report state model (§9, §23) and may merge once assessed against it, but the durable fix is decoupling `report_sent` from a user-settable status. See `docs/architecture/RESTOREASSIST-SPEC-RECONCILIATION.md`.

## 41. Implementation sequence

- **Phase 0 — Immediate containment:** private evidence storage; revocable share links; token-boundary defects; privileged-action protection; preserve the draft closure safeguard; prevent destructive bypasses.
- **Phase 1 — Claim integrity:** fix drying reading creation (baseline/monitoring flags); latest-valid-reading logic; legitimately achievable certification; connect field readings to reports; protect report history; repair closure state semantics.
- **Phase 2 — Financial integrity:** rate card canonical; snapshot approved estimates; invoices from approved estimates; remove hardcoded prices; correct customer mapping; unify payment ledger; add idempotency.
- **Phase 3 — Canonical data reuse:** identity spine (Report↔Inspection link, Client, insurer); remove repeated address entry; unify room/geometry ownership; reuse cubic volume, equipment history, evidence, scope; deprecate competing report blobs.
- **Phase 4 — Margot V1 activation:** claim-context service; completeness output; authorised claim context; UI mount; read/draft assistance; citations; entitlements; action auditing.
- **Phase 5 — Scheduling and V1 operations:** minimum scheduling; assignment; operational constraints; appointment↔claim↔technician; role boundaries.
- **Phase 6 — Seeded V1 verification:** run the reference claim; correct failures; collect evidence; re-score V1 readiness; prepare controlled release.

## 42. Definition of done

A V1 capability is done only when: its acceptance criteria (§38) pass with **named evidence** (test run, audit-event observation, or manual evidence artefact — never "it compiles"); its security, concurrency, and audit requirements are integrated; its traceability row is `Done` with a linked test; and it does not regress the seeded reference claim (§39). The whole of V1 is done when the seeded reference claim passes end-to-end for all five roles through UI/API with no direct DB manipulation, and both §13 quality reviews pass. The legacy production-readiness gates and sign-off checklist (Appendix A, prior §4/§6/§7) remain in force as release-level gates.

## 43. Open owner decisions

The founder directives (2026-07-17) resolved the prior open decisions: scheduling **in V1**; organisation rate card **canonical pricing**; drying **latest-valid-per-point with immutable history**; completeness **deterministic, stage-specific, water-damage pack for V1**; BYOK **four-plane boundary**; CARSI **train/guide boundary**. **No V1-blocking owner decision remains open.** Remaining owner inputs are non-blocking and tracked in `docs/architecture/RESTOREASSIST-DECISIONS.md` (e.g. the authorised drying-goal methodology source, per-organisation completeness baseline content, pilot-partner selection).

## 44. Change-control process

Any change to product behaviour during implementation triggers, in the same change set: (1) a spec update (this document), (2) a decision record appended to `docs/architecture/RESTOREASSIST-DECISIONS.md`, and (3) an updated traceability row. A PR that changes behaviour without updating the spec is not mergeable. The spec is versioned with the repo; the reconciliation report records superseded content. This keeps the spec the living source of truth rather than a point-in-time artefact.

---

## Appendix A — Prior production-readiness gates (retained verbatim, superseded as the product spec)

The prior `spec.md` defined the RestoreAssist NIR production-readiness gates, consequential-output distribution gates (§4), the multiple-eyes review layer (§6), and the final sign-off checklist (§7). Those **release-level gates remain in force** and are referenced by §42. The full prior text is preserved in git history at the pre-consolidation revision and summarised here:

- **Consequential-output gates:** data intake completeness, damage classification citing IICRC standard, standards-justified scope, cost-estimate range check (target ±10% of actuals), verified-checklist-and-audit-trail before any report distribution, versioned-standards currency. An unverified report never reaches an insurer or client.
- **Review layer:** hard gates (schema conformance, citation presence, reproducible generation, format consistency, surge test, deploy+rollback, distribution gate) plus soft reviewer sign-off; a phase passes only when its hard gate passes and no soft reviewer objects.
- **Final sign-off:** zero open blockers/majors; every distribution gate demonstrably blocks an unverified report; ≥90% pilot reports generate; estimates within 10% of actuals; ≥85% technician "easy" rating; adjuster quality approval; zero critical pilot bugs; standards library current and versioned; IP under UNITE-GROUP NEXUS PTY LTD; owner go/no-go signed.

These are compatible with, and subsumed by, the acceptance-criteria (§38) and definition-of-done (§42) of this master specification.

---

## Appendix B — Continuous Implementation Mode

**Activation.** This mode activates only after the master specification passes both independent reviews (§13 of the consolidation task: engineering-ambiguity review and restoration-operations review) with no material ambiguity remaining. Until then, no broad implementation begins.

**The loop.** Once active, implementation proceeds as a disciplined loop rather than a single hand-off:

1. **Take the top item** from `docs/architecture/RESTOREASSIST-V1-BACKLOG.md` (highest priority whose dependencies are satisfied), honouring the Phase 0→6 order in §41.
2. **Implement it** — surgically, on a branch, within one phase's scope. No unrelated feature work.
3. **Run its tests** — the acceptance evidence named in the item's criteria (§38): unit / integration / security / isolation / concurrency / idempotency / e2e as applicable, plus the seeded reference claim (§39) once its stage is reachable. Report raw pass/fail.
4. **Update the docs in the same change set** (§44) — spec, decision log, and traceability row — so the spec never lags the code.
5. **Repeat** with the next top item.

**Stop conditions (a "real blocker").** The loop pauses and hands back only on: a missing owner decision (§43); a failing gate that requires human judgement (a soft-reviewer objection, a domain-methodology question); an external dependency (credential, third-party outage, accounting sandbox); a security/legal/data-integrity risk surfaced mid-build; or exhaustion of the ready backlog. Compilation success, a green typecheck, or a merged PR are **not** stop conditions and are **not** completion — completion is the evidenced acceptance criteria (§42).

**Guardrails.** Every loop iteration honours the change-control process (§44), the definition of done (§42), and the state-machine, security, and concurrency requirements. The loop never merges a behaviour change without a spec update, never marks an item done on "it compiles", and never advances a phase whose predecessor phase is not evidenced complete. Draft PR #1967 stays unmerged until assessed against the final report state model (§40).

This mode keeps implementation momentum without letting the code drift from the specification.
