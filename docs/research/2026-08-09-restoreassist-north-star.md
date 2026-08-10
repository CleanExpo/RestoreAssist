# RestoreAssist North Star

**Decision brief — 9 August 2026**
**Repository evidence audited:** `4656767e4d03f02a0ab0c62543022aa6bccfe871`
**Decision status:** Recommended product direction; not a claim that every target behaviour is implemented or live in production.

## Executive decision

### One-sentence North Star

> **Turn one trustworthy field capture into a complete, defensible and commercially reconciled restoration claim—without re-keying, losing provenance, or letting AI replace accountable human judgement.**

This is a **recommendation**, synthesised from RestoreAssist's canonical product identity—“Capture once. Validate once. Reuse everywhere”—and its declared lifecycle from first notification through closure ([`spec.md`, §§1–9](../../spec.md)). It is also consistent with the first-party brand promise that office and field use one system ([`lib/brand.ts`](../../lib/brand.ts)).

## 1. Product truth already present in the repository

The repository does not lack a vision. It contains a strong but unevenly implemented one.

**Sourced RestoreAssist facts:**

- The canonical specification defines RestoreAssist as an **AI-native restoration operations system** connecting first notification, scheduling, inspection, drying, scope, reporting, invoicing, payment and closure through one canonical record per claim. It explicitly rejects being merely a CRM, form, report builder, chatbot, LMS, accounting package or sketching tool ([`spec.md`, §§1–7](../../spec.md)).
- Its governing data rule is: **“Capture once. Validate once. Reuse everywhere.”** Every claim fact is to have one canonical editable owner; downstream products are derived views or immutable snapshots, not competing records ([`spec.md`, §§1–2 and §8](../../spec.md)).
- The earlier job-close audit names the product North Star as **no double-handling**: if information already exists in an authorised integration, prior inspection, registry, profile or captured job, the system pulls it instead of asking a human to type it again ([job-close audit, §10](../superpowers/specs/2026-05-14-signin-jobclose-audit-design.md)).
- Current first-party product language repeats the same promise: office and field in one system; evidence captured once flows into scope, estimate and report ([`app/how-it-works/page.tsx`](../../app/how-it-works/page.tsx), [`components/landing/home/homeContent.ts`](../../components/landing/home/homeContent.ts), [`lib/brand.ts`](../../lib/brand.ts)).

**Decision:** use the one-sentence North Star above as the product-level filter. “One System. Fewer Gaps. More Confidence.” remains the brand expression; “one trustworthy capture to a defensible, reconciled claim” becomes the operating definition behind it.

### Authority and conflicts found

The frozen July 2026 [`spec.md`](../../spec.md), its [decision log](../../docs/architecture/RESTOREASSIST-DECISIONS.md) and [reconciliation](../../docs/architecture/RESTOREASSIST-SPEC-RECONCILIATION.md) outrank older brainstorms, marketing copy and partial implementations.

- The May job-close audit usefully articulates “no double-handling,” but its blanket rule that any pullable form field is a P0 and its references to AI-drafted scope lines are too broad. The canonical July spec requires an authorised, provenance-preserving source, deterministic validation, operator-measured quantities and organisation-owned rates; AI may draft narrative or propose an action, never become the canonical scope or pricing author.
- The canonical V1 boundary is **water damage**. First-party landing/marketing surfaces that imply an equally complete fire, storm, mould or biohazard lifecycle are ahead of the frozen specification and should not set delivery priority until those rule packs and exit evidence exist.
- The current implementation contains multiple workflow and commercial shortcuts that contradict the target spec. This brief treats those differences as gaps, not as alternative product decisions.

## 2. Primary user and core job-to-be-done

### Primary user

**Recommendation:** the primary user is the **Australian water-damage restoration operator accountable for a job's operational and commercial completion**—typically an owner-operator, restoration manager or operations lead in a small-to-mid-sized firm.

The technician is a critical contributing user and must receive a fast, mobile, offline-tolerant capture experience. The office administrator, estimator, customer, insurer/referrer and accountant are downstream participants. However, the accountable operator is the only persona whose job spans the whole system and who experiences the full cost of missing evidence, repeated entry, delayed reporting and commercial mismatch.

This choice is an **inference**, not validated customer-research evidence. The repo defines Owner, Administrator, Manager and Technician roles but does not contain current behavioural analytics or interview evidence proving which persona most strongly predicts retention ([`spec.md`, §3](../../spec.md)).

### Core job-to-be-done

> **When a water-loss job arrives, help my field and office team move it from first notification to a delivered, defensible report and reconciled invoice using the same verified facts, so we can act quickly without rebuilding the file at the desk or creating evidence and pricing contradictions.**

The emotional and social dimensions matter: the operator needs confidence that the file will withstand internal review, customer questions, insurer scrutiny and later dispute—not merely confidence that a PDF can be generated.

## 3. Unit of value

### Recommended unit: a verified claim completion

A **verified claim completion** is one claim that reaches the server-validated `CLOSED` state with:

1. required safety, classification, inspection, drying and approval gates satisfied for the work actually performed;
2. canonical field evidence reused downstream without manual re-keying;
3. a versioned report generated from canonical records and delivery evidenced;
4. an invoice derived from the approved commercial snapshot and financially reconciled under the organisation's policy; and
5. an immutable transition/audit trail sufficient to explain who recorded, changed, approved, sent and reconciled what.

This is a **recommendation grounded in the target architecture**, not a statement that today's code can prove all five conditions. The canonical spec explicitly defines server-validated closure, delivered-report evidence and a reconciled invoice while making full payment an organisation-configurable—not universal—closure condition ([`spec.md`, §§20–23](../../spec.md); [`RESTOREASSIST-TRACEABILITY.md`, §E](../../docs/architecture/RESTOREASSIST-TRACEABILITY.md)).

## 4. Canonical end-to-end workflow

The product should expose one job with role-appropriate views, not a chain of separately authored documents.

| Stage                    | Canonical action and record                                                                                                                                                                     | Value handed forward                                           | Required human control                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1. Intake                | Create/select the client; capture claim reference, loss timeline, address, insurer/referrer and site logistics once on `Inspection`. Partner-imported facts map into the same record.           | A dispatchable, uniquely identified job.                       | Confirm imported facts and exceptions.                                      |
| 2. Schedule              | Assign a suitably tagged technician, time and site instructions; technician acknowledges.                                                                                                       | Field-ready job with no phone-note reconstruction.             | Manager assignment; technician acknowledgement.                             |
| 3. Make safe and inspect | Record pre-work safety evidence, hazards and pathways, authority, water Category/Class, affected areas, photos, operator-measured geometry and readings. Offline replay must be duplicate-safe. | Trusted site facts with source, actor and time.                | Technician owns observation; deterministic guards block unsafe progression. |
| 4. Map and monitor       | Place rooms, moisture points, affected areas and equipment on the property twin; append atmospheric/moisture visits and equipment movements. Preserve history; invalidate only with reason.     | Spatial and time-series evidence of conditions and drying.     | Technician validates measurements; approved methodology owns thresholds.    |
| 5. Scope                 | Derive quantities from operator-measured geometry, readings and equipment; attach applicable standard/rule sources; select and edit scope items.                                                | Explainable work required and quantities.                      | Qualified human reviews work decisions.                                     |
| 6. Price and approve     | Apply the organisation's rate card; create a versioned estimate; approval freezes the commercial snapshot.                                                                                      | Defensible agreed commercial basis.                            | Manager/authorised approver controls rates, adjustments and approval.       |
| 7. Report and deliver    | Generate a versioned report from canonical geometry, readings, photos, equipment, scope and signatures; approve, send and record delivery separately.                                           | Audience-ready evidence package without re-keying.             | Manager approves; recipient/delivery event proves distribution.             |
| 8. Invoice and reconcile | Generate the draft invoice from the approved estimate snapshot; review; issue; sync/account for payments and adjustments in the ledger.                                                         | Commercially consistent receivable.                            | Authorised review; accounting/payment events are idempotent.                |
| 9. Close or reopen       | Server checks required evidence, delivery, approvals, hazards and financial reconciliation; writes a hash-chained transition. Reopen only with authority and reason.                            | A defensible completed claim and reusable operational history. | Closure/reopen remain human-accountable actions.                            |

**Architecture recommendation:** every UI, integration and Margot action must call the same domain services. API routes should authenticate and translate transport; they should not become alternate writers. This follows the repository's declared layering but is not yet uniformly true across the current route surface ([`spec.md`, §7](../../spec.md)).

## 5. North Star metric

### Straight-Through Verified Closeout Rate (STVCR)

```text
STVCR =
  eligible attended water jobs that, within the agreed service window:
    - reach the server-validated CLOSED state,
    - satisfy the verified-claim-completion contract,
    - reuse original structured field facts downstream,
    - need no evidence-driven return visit,
    - contain no duplicate manual entry or material avoidable correction, and
    - have no unresolved safety/compliance exception
  -----------------------------------------------------------------------------
  all eligible attended water jobs whose agreed service window ended
  in the measurement cohort
```

“Eligible,” “attended,” “material avoidable correction” and each service window must be defined before instrumentation. Exclude documented customer/insurer holds from the timeliness clock, not from evidence-quality failures. “Verified” means the product can prove the contract from canonical events; it does not mean an insurer has accepted coverage or liability.

Why this metric:

- It measures whether RestoreAssist delivers the promised **straight-through outcome**, not merely whether a job eventually closes after manual repair.
- It requires value to cross field, office, evidence and commercial boundaries.
- A rate exposes re-entry and rework even as customer and claim volumes change.
- It avoids rewarding logins, forms saved, AI calls, PDFs generated or invoices created in isolation.

Track **verified claim completions per active organisation per 28 days** as the companion volume metric so a high rate cannot be manufactured by processing only easy claims or shrinking usage:

```text
VCC/AO28 = verified claim completions in trailing 28 days
           -------------------------------------------------
           organisations with a legitimate workflow event
           in trailing 28 days
```

### Guardrails

The numerator must be contract-backed, not a dashboard label. Track these guardrails alongside it:

| Guardrail                      | Recommended definition                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical reuse rate           | `downstream populated claim fields sourced from canonical records / all downstream populated claim fields`. Target is effectively 100% for fields the system already knows; manually documented exceptions remain visible. |
| Duplicate-write defect rate    | Claims with duplicated editable child rows after retry/re-save divided by claims saved. Target: 0.                                                                                                                         |
| Evidence-gate bypass rate      | Closed claims missing a required deterministic transition condition. Target: 0.                                                                                                                                            |
| Report integrity rate          | Delivered reports whose snapshot resolves to all referenced canonical source records and hashes. Target: 100%.                                                                                                             |
| Commercial consistency         | Issued invoices matching their approved estimate snapshot, except explicit authorised adjustments. Target: 100%.                                                                                                           |
| Median cycle times             | Intake→first field capture, final field capture→approved report, approved estimate→issued invoice. Improve without weakening gates.                                                                                        |
| First-pass closeout acceptance | Verified closeout packs approved internally and delivered without material evidence correction divided by packs submitted for approval.                                                                                    |
| Evidence-driven return visits  | Return visits caused by missing or unusable evidence divided by attended jobs. Target: 0; separately label legitimate monitoring visits and newly discovered conditions.                                                   |
| Material rework rate           | Claims reopened or reports superseded because of missing/incorrect evidence, classification, customer or price data. Downward trend.                                                                                       |
| Safety/compliance incidents    | Safety blocks bypassed, evidence deleted without controlled invalidation, cross-tenant access, or privacy/security incident. Target: 0.                                                                                    |
| Drying-record integrity        | Claims with complete, immutable chronological readings and controlled invalidations divided by claims requiring drying monitoring. Target: 100%.                                                                           |
| Post-close harm                | Closed claims later associated with a substantiated safety, evidence-integrity, privacy or material commercial failure. Target: 0.                                                                                         |
| AI correction/escalation       | Material AI drafts rejected or corrected, grouped by capability and model. A quality diagnostic, never a target that pressures automatic acceptance.                                                                       |

**Instrumentation gap:** current evidence does not establish an event taxonomy capable of calculating canonical reuse or verified completion reliably. Define the metric contract and events before publishing a baseline or target.

## 6. Non-negotiable product principles

1. **One canonical claim record.** One editable owner per fact; documents, exports and AI context are projections or immutable snapshots.
2. **Capture once; never silently copy.** Known authorised data is pulled. If a human must re-enter or override it, record why and preserve provenance.
3. **Field truth reaches every downstream surface.** A field reading that cannot reach the spatial view, scope, report and review trail is not complete.
4. **Deterministic controls own truth.** Required information, lifecycle transitions, safety blocks, pricing maths, GST, completeness rules and drying calculations are deterministic and testable.
5. **AI assists; accountable people decide.** AI may explain, organise, draft and propose. It does not invent standards, measurements, prices, thresholds, coverage decisions, approvals or closure.
6. **Evidence is append-first and attributable.** Preserve actor, time, source, version and reason. Correct errors by controlled supersession/invalidation, not deletion of history.
7. **Commercials remain organisation-owned.** The approved estimate is the frozen basis for the invoice; later rate-card changes cannot rewrite history.
8. **The workflow degrades safely.** Loss of AI, integration, plan retrieval or connectivity cannot erase work, corrupt the canonical record or force fabricated values.
9. **Role and tenant boundaries are enforced at the write.** Every surface—including Margot, imports and portals—uses the invoking human's authority and the same organisation boundary.
10. **Done means demonstrated end to end.** A feature is not complete until a representative claim proves retry safety, progression, report delivery, invoice consistency and auditability.

## 7. What RestoreAssist is—and is not

### RestoreAssist is

- the canonical operational record and workflow engine for restoration claims;
- the connective tissue between field capture, office review, compliance/evidence, scope, commercial approval, reporting, invoicing and closure;
- a deterministic control system with AI assistance above it;
- an AU-first, AU/NZ-aware product that makes applicable standards, safety duties, tax treatment and organisational policy visible in context; and
- an integration orchestrator that pulls authorised facts into the canonical record and exports trusted outputs.

### RestoreAssist is not

- a generic CRM with restoration forms attached;
- a PDF generator whose report can disagree with field evidence;
- an estimating price authority, insurer, loss adjuster or coverage decision-maker;
- a replacement for a qualified restorer, licensed trade, WHS professional, accountant or lawyer;
- a floor-plan marketplace or CAD product competing on drawing sophistication alone;
- an autonomous agent allowed to approve estimates, close claims or weaken safety/compliance gates; or
- a second LMS beside CARSI.

These boundaries are substantially **sourced product decisions** from [`spec.md`, §§1, 18, 24 and 27](../../spec.md) and the decision log ([`RESTOREASSIST-DECISIONS.md`](../../docs/architecture/RESTOREASSIST-DECISIONS.md)).

## 8. Role of the floor plan

### Decision

The floor plan/property twin is the **spatial index of claim evidence and measured quantities**, not the product's end goal and not a mandatory blocker before evidence capture.

It should:

- anchor rooms, dimensions, affected geometry, moisture points, photos, hazards and equipment placement;
- provide operator-measured quantities to deterministic scope and equipment calculations;
- carry provenance that separates an imported/listing underlay or AI interpretation from field-verified measurement;
- flow automatically into appropriate report views; and
- permit readings and photos to be captured before a plan is available, then placed later without duplication.

**Sourced market facts:** official magicplan documentation says field-captured floor plans, photos, readings and equipment flow into reports, with quantities pulled from floor-plan measurements into scope ([magicplan water mitigation](https://magicplan.app/solution/water-mitigation), [magicplan reports](https://magicplan.app/product/reports)). Encircle's official help says users can capture readings without a map and place those existing points after the floor plan arrives; its floor plans can become room sketches and moisture maps and appear in PDF reports ([readings before floor plan](https://help.encircleapp.com/hc/en-us/articles/13472318967949-Can-I-take-material-readings-while-I-wait-for-my-floor-plan), [creating a sketch](https://encircleapp.zendesk.com/hc/en-us/articles/12199419131405-Creating-a-Sketch-from-Your-Floor-Plan), [floor-plan FAQ](https://help.encircleapp.com/hc/en-us/articles/12200869740557-Encircle-Floor-Plan-FAQ)). Xactimate's official help describes a claim estimate as customer/loss/property information plus a sketch and repair/replace line items; XactScope can calculate quantities from a sketch ([Xactimate glossary](https://xactware.helpdocs.io/l/enUS/article/itqn1d36lm-xactimate-glossary), [XactScope](https://xactware.helpdocs.io/l/enUS/article/3axb9l4a6e-about-xact-scope)). These are competitor product claims, not independent proof of accuracy or customer outcomes.

**RestoreAssist fact:** the canonical spec makes `ClaimSketch`/`SketchElement` the geometry owner and restricts calculation to operator-measured geometry ([`spec.md`, §§8 and 13](../../spec.md)). The current code also retains a manual image-upload route with magic-byte validation ([`app/api/inspections/[id]/floor-plan/route.ts`](../../app/api/inspections/%5Bid%5D/floor-plan/route.ts)). Prior first-party design work identifies remaining provenance, persistence, freshness, entitlement and licensing issues ([floor-plan/report design](../superpowers/specs/2026-07-01-floorplan-branded-reports-design.md); [`docs/mapping-v2/spec.md`](../mapping-v2/spec.md)).

## 9. Role of AI

AI should compress interpretation and administration, never become a shadow database or decision authority.

### Permitted roles

- explain known facts, missing facts, contradictions, risks and next actions;
- structure notes and draft report/scope narrative from authorised canonical context;
- propose tags, room/photo organisation and mappings with confidence and provenance;
- retrieve cited organisational knowledge through the authorised gateway;
- make human review faster by showing evidence beside every material suggestion.

### Prohibited roles

- invent a standard clause, water classification, measurement, drying threshold, price or tax rule;
- silently overwrite a technician's observation or approved commercial snapshot;
- decide coverage, liability, approval, disposal, certification, payment reconciliation or closure;
- bypass tenant, role, subscription, budget, state-machine or audit controls; or
- silently shift a customer-key AI call to a platform-funded key.

This section is a **sourced restatement** of [`spec.md`, §§24–26](../../spec.md). The operational recommendation is to evaluate AI by material-correction rate, citation/provenance quality and time saved in verified completions—not by token volume or draft-generation count.

## 10. Compliance and evidence role

RestoreAssist should make a good restoration record easier to produce and harder to contradict. It should not claim that software use alone creates legal or standards compliance.

### Sourced external facts

- IICRC's announcement states that Standards Australia published **AS-IICRC S500:2025**, an Australian adoption of ANSI/IICRC S500:2021. The described coverage includes psychrometry/drying, equipment, safety and health, administrative procedures, project documentation, risk management, inspections and structural restoration ([IICRC release](https://iicrc.org/wp-content/uploads/2025/04/AS-IICRC-S500-Published-Press-Release_March-2025.pdf)). The release is not the licensed full standard and does not justify asserting exact clauses not independently checked. <!-- standards-cite-ignore: AS-IICRC S500:2025 is the Standards Australia adoption of ANSI/IICRC S500:2021, not a stale S500 edition -->
- Safe Work Australia's November 2024 model Code says records of risk management help demonstrate what was done, support later review and should capture identified hazards, assessed risks, selected controls, implementation/monitoring/review and consultation. It also notes that specific hazards can carry specific record-keeping requirements ([model Code, §6](https://www.safeworkaustralia.gov.au/sites/default/files/2024-11/model_code_of_practice-how_to_manage_work_health_and_safety_risks-nov24.pdf)). Its electrical-safety guidance says risk increases in wet environments and gives controls for suitable equipment, inspection/testing and RCDs ([Safe Work Australia electrical safety](https://www.safeworkaustralia.gov.au/duties-tool/construction/hazards-information/electrical-safety)). Applicability still depends on jurisdiction, task and duty holder.
- WorkSafe New Zealand describes HSWA 2015 as New Zealand's key work-health-and-safety legislation and places management of work risk on businesses; its inspection guidance says inspectors may examine whether systems and records support good health and safety practice ([general risk/workplace guidance](https://www.worksafe.govt.nz/managing-health-and-safety/businesses/general-requirements-for-workplaces/general-risk-and-workplace-management-part-1/), [workplace assessments](https://www.worksafe.govt.nz/managing-health-and-safety/businesses/workplace-assessments/)).
- The Insurance Council of Australia says its voluntary General Insurance Code sets standards for subscribing general insurers, including openness, fairness, claims-handling timeframes and requests for information ([ICA Code](https://insurancecouncil.com.au/cop/)). This does **not** directly make a restorer a Code subscriber; it supports the inference that timely, legible and attributable evidence is valuable in insurer-facing workflows.
- ICA's consumer scope-of-works guidance says a scope may require several discussions and versions and may need reassessment when new damage information appears after work starts ([ICA scope-of-works information sheet](https://insurancecouncil.com.au/wp-content/uploads/2021/06/ScopeofWorks.pdf)). The product implication is controlled versioning and explicit variations—not pretending the first scope is infallible.
- Australian GST law requires a tax invoice to contain enough information to ascertain specified supplier, recipient (where applicable), supply, price, GST and issue details ([GST Act §29-70](https://www.ato.gov.au/law/view/document?LocID=%22PAC%2F19990055%2F29-70%282%29%22)). ATO guidance describes tax invoices as a GST integrity measure ([PS LA 2004/11](https://www.ato.gov.au/law/view/document?LocID=%22PSR%2FPS200411%2FNAT%2FATO%22)). New Zealand Inland Revenue likewise states that taxable-supply information and GST records must be kept ([IRD GST guide, April 2025](https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir300---ir399/ir375/ir375.pdf)).

### Product recommendation

Treat compliance as a **deterministic, cited rules-and-evidence layer**:

- store the rule source, edition, jurisdiction and organisation extension behind every required field or block;
- distinguish legal requirement, adopted standard, insurer/contract condition, organisation policy and recommended practice in the UI;
- preserve source data, measurement provenance, signatures, approvals, delivery events and commercial versions;
- generate audience-specific views from the same evidence graph; and
- never market “compliance” as a blanket outcome when applicability or professional judgement remains unresolved.

## 11. How observed defects violate the North Star

The observations below are first-party evidence from the audited repair branch. Where the branch contains a repair, the defect describes the pre-fix behaviour and is **not** a claim that it still exists at `4656767e` or in current production.

| Observed defect                                                                                                                                              | North Star violation                                                                                                                                                   | Evidence/status at audited SHA                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Re-saving a draft appended moisture readings and affected areas.                                                                                             | One field observation became multiple contradictory records; retries were not safe; downstream counts and report evidence could not be trusted.                        | Repaired by transactional draft-snapshot replacement with repeated-save regression coverage ([route](../../app/api/inspections/%5Bid%5D/draft-snapshot/route.ts), [test](../../app/api/inspections/%5Bid%5D/draft-snapshot/__tests__/route.test.ts)).                                                                                    |
| Manual water Category/Class could persist incorrectly.                                                                                                       | A qualified human's material classification was overwritten or misrepresented, breaking deterministic truth and every downstream decision based on it.                 | The draft snapshot now upserts the manual classification and the regression test asserts Category 1/Class 2; the UI preview respects the override ([test](../../app/api/inspections/%5Bid%5D/draft-snapshot/__tests__/route.test.ts), [`NIRTechnicianInputForm.tsx`](../../components/NIRTechnicianInputForm.tsx)).                      |
| Empty scope correctly failed invoice generation, but the UI attempted to render a structured error object and crashed.                                       | The system converted a valid safety/commercial guard into a dead-end, teaching users to bypass controls rather than resolve them.                                      | Rendering repaired through the shared error normaliser with a UI regression test ([invoice page](../../app/dashboard/inspections/%5Bid%5D/invoice/page.tsx), [test](../../app/dashboard/inspections/%5Bid%5D/invoice/__tests__/page.test.tsx)).                                                                                          |
| Report onboarding claimed setup was skipped, then blocked the user again after reload.                                                                       | State and language contradicted each other; the user could neither trust the workflow nor know the actual prerequisite.                                                | Current branch relabels the action “Finish Later” and explicitly says setup remains required ([new-report page](../../app/dashboard/reports/new/page.tsx)). This is clearer but does not prove activation friction is solved.                                                                                                            |
| Automatic floor-plan retrieval was unavailable while only manual upload was usable in the acceptance path.                                                   | The spatial evidence graph became an entitlement/integration dead end and risked delaying the rest of capture.                                                         | Current code supports validated manual upload; separate mapping/design sources track automatic retrieval, provenance and entitlement. Production entitlement/integration state was not re-verified in this research ([floor-plan route](../../app/api/inspections/%5Bid%5D/floor-plan/route.ts), [mapping spec](../mapping-v2/spec.md)). |
| Current inspection invoice generation selects the user's oldest client and prices selected scope lines at a hardcoded `$50` unit price.                      | Customer and price facts are not sourced from the claim and approved estimate. The resulting invoice can be commercially inconsistent even if the workflow “succeeds.” | Still visible at the audited SHA in [`generate-invoice/route.ts`](../../app/api/inspections/%5Bid%5D/generate-invoice/route.ts); directly contradicts canonical [`spec.md`, §§18–21](../../spec.md). This is a P0 target-code gap.                                                                                                       |
| A wide set of inspection/report/invoice API routes write through Prisma directly while the canonical architecture says domain services are the only writers. | Transport-specific write paths can drift in validation, tenancy, idempotency and audit semantics, creating multiple behavioural truths even when tables are shared.    | Code-architecture observation from `app/api/inspections`, `app/api/reports`, `app/api/invoices` versus [`spec.md`, §7](../../spec.md). This requires route-by-route tracing before refactor; route count alone does not prove every path is unsafe.                                                                                      |

## 12. Prioritised delivery implications

### P0 — make a completed claim true

1. **Replace the inspection invoice shortcut.** Require a claim-linked client, organisation rate card, versioned estimate, approval snapshot and idempotent invoice keyed to the inspection/estimate. Remove oldest-client lookup and hardcoded pricing. This is the clearest current violation of both commercial integrity and capture-once.
2. **Define and enforce the verified-completion contract in code.** One server-side closure service must check report delivery, approvals, unresolved hazards, estimate/invoice lineage and financial reconciliation, then emit the auditable transition.
3. **Finish canonical writer consolidation on the golden water-claim path.** Route every mutation in the seeded journey through tenant-aware, role-aware, idempotent domain services. Do this surgically by lifecycle stage; do not attempt a whole-repo rewrite.
4. **Keep retry and offline semantics explicit.** Draft saves are replaceable snapshots; submitted measurements and evidence are append-only with controlled correction. Add positive retry/replay tests at every boundary.
5. **Prove the whole path with one labelled seeded claim.** Intake → repeated draft save → classification → safety → mapping/readings → scope → approved estimate → report generation/delivery → invoice/reconciliation → closure. Assertions must verify source lineage, not just visible text.

### P1 — make the workflow fast and inspectable

6. **Instrument the North Star contract and guardrails.** Emit stable events for source reuse, override/re-entry, version creation, gate result, delivery, reconciliation, closure and reopen. Establish a baseline before setting targets.
7. **Make the floor plan a non-blocking evidence index.** Allow capture before plan availability, support later placement, maintain measurement provenance and guarantee the current verified render appears in the report.
8. **Present deterministic completeness as stage-specific work.** Show facts, missing requirements, contradictions, blocking conditions, rule source and next human decision. Do not hide these behind one percentage.
9. **Make onboarding state honest and resumable.** Every “later” path must land the user somewhere useful, preserve progress and explain exactly which capability remains unavailable and why.

### P2 — deepen the compounding advantage

10. **Pull known data through authorised integrations.** Prior jobs, partner intake, ABR/organisation data, property context, accounting state and authorised profiles should populate the canonical record with provenance and confirmation rather than cause re-entry.
11. **Use Margot to shorten verified completion.** Prioritise evidence-linked summaries, contradiction detection and draft assistance; measure accepted material suggestions and time saved, not chat engagement.
12. **Build organisational learning from completed claims.** Reuse approved templates, rate cards and patterns without cloning historical facts or letting prior-job AI output become current-job truth.

## 13. Assumptions and unresolved evidence gaps

### Explicit assumptions

- Water-damage restoration remains the V1 claim type and the best cohort for the North Star contract.
- The accountable operator is the correct primary persona even though technician speed is essential.
- `CLOSED` is the right value-completion boundary once its server-side contract is fully enforced; report generation alone is too early.
- Full payment is not universally required for closure; organisation policy controls that condition, consistent with the canonical spec.
- Floor-plan source availability is optional; measurement provenance and evidence continuity are mandatory.

### Evidence gaps that should remain open

1. **Customer validation:** no current interviews, churn analysis, support taxonomy or product analytics were available to validate the primary persona, job statement or metric's relationship to retention.
2. **Metric baseline:** no trustworthy count of verified completions, active organisations, re-entry events, material rework or median lifecycle times was found.
3. **Production parity:** this research audited branch SHA `4656767e`; it did not verify which fixes or schema behaviours are deployed in production.
4. **Full standard text:** the IICRC announcement verifies AS-IICRC S500:2025 publication and scope, not exact normative clauses. Exact UI gates and citations require the licensed standard and an authorised methodology review. <!-- standards-cite-ignore: AS-IICRC S500:2025 is the Standards Australia adoption of ANSI/IICRC S500:2021, not a stale S500 edition -->
5. **Jurisdiction matrix:** AU state/territory WHS application, New Zealand duties, insurer contracts and licensing requirements need a controlled, reviewed matrix. Do not infer blanket obligations from model guidance.
6. **Retention:** the repository correctly rejects one universal retention period, but the claim-type/jurisdiction/record-category matrix remains an owner/legal/privacy input. No automated evidence destruction should be introduced until approved.
7. **Commercial policy:** rate-card ownership is decided, but variation, discount, insurer schedule and reconciliation policies need representative pilot validation.
8. **Floor-plan rights and accuracy:** automated property-plan sources need licensing, copyright, availability and provenance decisions. Imported underlays and AI interpretations must never masquerade as operator measurements.
9. **AI effectiveness:** no audited dataset establishes model accuracy, cost, material correction rate or time saved across the golden claim path.
10. **Integration authority:** the “pull known data” principle depends on explicit tenant authorisation, data licences, graceful degradation and conflict resolution; absence of an integration must never justify fabricated data.

## 14. Decision test for every roadmap item

Before funding or shipping a feature, ask:

1. Does it increase verified claim completions or protect a guardrail?
2. Which canonical fact or transition does it own, consume or derive?
3. Does it remove re-entry—or create another editable copy?
4. Can the field complete the work under weak connectivity and retry safely?
5. What evidence, provenance and human approval survive into the final claim?
6. Is any AI output clearly subordinate to deterministic rules and accountable judgement?
7. Can one seeded claim prove the behaviour from capture through report, invoice and closure?

If the answers are unclear, the item is not ready for implementation. If it produces engagement but does not improve or protect a verified completion, it is not North Star work.

## Primary-source register

### RestoreAssist first-party sources

- [`spec.md`](../../spec.md) — canonical product identity, lifecycle, data ownership, state machines, Margot and acceptance contract.
- [`docs/architecture/RESTOREASSIST-DECISIONS.md`](../../docs/architecture/RESTOREASSIST-DECISIONS.md) — resolved product and architecture decisions.
- [`docs/architecture/RESTOREASSIST-TRACEABILITY.md`](../../docs/architecture/RESTOREASSIST-TRACEABILITY.md) — target ownership/state-machine traceability and implementation gaps.
- [Job-close audit](../superpowers/specs/2026-05-14-signin-jobclose-audit-design.md) — earlier “no double-handling” North Star and workflow audit.
- [`docs/mapping-v2/spec.md`](../mapping-v2/spec.md) and [floor-plan/report design](../superpowers/specs/2026-07-01-floorplan-branded-reports-design.md) — spatial evidence, provenance and report integration.
- Current implementation and regression evidence linked inline, audited at `4656767e`.

### External primary sources

- [IICRC — AS-IICRC S500:2025 publication release](https://iicrc.org/wp-content/uploads/2025/04/AS-IICRC-S500-Published-Press-Release_March-2025.pdf) <!-- standards-cite-ignore: AS-IICRC S500:2025 is the Standards Australia adoption of ANSI/IICRC S500:2021, not a stale S500 edition -->
- [Safe Work Australia — How to manage work health and safety risks, November 2024](https://www.safeworkaustralia.gov.au/sites/default/files/2024-11/model_code_of_practice-how_to_manage_work_health_and_safety_risks-nov24.pdf)
- [Safe Work Australia — Electrical safety](https://www.safeworkaustralia.gov.au/duties-tool/construction/hazards-information/electrical-safety)
- [WorkSafe New Zealand — General risk and workplace management](https://www.worksafe.govt.nz/managing-health-and-safety/businesses/general-requirements-for-workplaces/general-risk-and-workplace-management-part-1/)
- [WorkSafe New Zealand — Workplace assessments](https://www.worksafe.govt.nz/managing-health-and-safety/businesses/workplace-assessments/)
- [Insurance Council of Australia — General Insurance Code of Practice](https://insurancecouncil.com.au/cop/)
- [Insurance Council of Australia — Scope of works for a home building insurance claim](https://insurancecouncil.com.au/wp-content/uploads/2021/06/ScopeofWorks.pdf)
- [Australian Taxation Office — GST Act §29-70](https://www.ato.gov.au/law/view/document?LocID=%22PAC%2F19990055%2F29-70%282%29%22)
- [Australian Taxation Office — PS LA 2004/11](https://www.ato.gov.au/law/view/document?LocID=%22PSR%2FPS200411%2FNAT%2FATO%22)
- [Inland Revenue New Zealand — Working with GST, April 2025](https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir300---ir399/ir375/ir375.pdf)
- [magicplan — Water mitigation](https://magicplan.app/solution/water-mitigation) and [reports](https://magicplan.app/product/reports)
- [Encircle — Floor-plan/readings help](https://help.encircleapp.com/hc/en-us/articles/13472318967949-Can-I-take-material-readings-while-I-wait-for-my-floor-plan), [sketch creation](https://encircleapp.zendesk.com/hc/en-us/articles/12199419131405-Creating-a-Sketch-from-Your-Floor-Plan) and [floor-plan FAQ](https://help.encircleapp.com/hc/en-us/articles/12200869740557-Encircle-Floor-Plan-FAQ)
- [Xactimate — Glossary](https://xactware.helpdocs.io/l/enUS/article/itqn1d36lm-xactimate-glossary) and [XactScope](https://xactware.helpdocs.io/l/enUS/article/3axb9l4a6e-about-xact-scope)
