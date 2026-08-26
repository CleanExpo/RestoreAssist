# RestoreAssist — Job Continuity spec reconciliation (Document Eight)

**Date:** 2026-08-26
**Status:** Proposal for owner review. Nothing here has been applied.
**Governs:** D-010 (spec is the living source of truth). Follows the pattern of
`RESTOREASSIST-SPEC-RECONCILIATION.md`.

---

## 1. Summary and method

A product specification ("Job Continuity", v1.0, 26 August 2026) proposes a Job Story Spine, a
Continuity Check Engine, role-specific experiences, AU/NZ localisation and a WCAG 2.2 AA bar.

This document maps that specification onto what the repository actually contains. Every claim
below was verified by reading the file cited. Where the specification assumes something that does
not exist, that is stated plainly — those gaps are the point of the exercise.

**The headline finding:** the specification substantially overlaps work already decided in
`RESTOREASSIST-DECISIONS.md` (D-001–D-018) and sequenced in `RESTOREASSIST-V1-BACKLOG.md`
(P0–P4). Applying it as written would create a second programme competing with the first. Three of
its pillars point in different directions from decisions already made with reasons recorded.

**Premises agreed with the owner before writing:**

| # | Question | Decision |
|---|---|---|
| 1 | Spec authority | **Reconcile into the existing backlog.** The spec does not supersede D-001–D-018. |
| 2 | Blocking severities | **D-016 stands.** Completeness output is advisory; enforcement stays in the state machines. |
| 3 | Location model | **Extend the sketch twin per D-009.** Do not build the spec's Property>Level>Room>Surface hierarchy. |
| 4 | First deliverable | **This document.** No code. |

---

## 2. Spec concept → repo reality

| Spec concept | What exists today | Governing decision | Verdict |
|---|---|---|---|
| Job Story Spine (§7) | Nothing. Three entities, four lifecycles, two unrelated timeline UIs | — | **absent (blocked)** |
| Canonical location (§6.3) | `SketchRoom` (`schema:6576`) live but unsafe; `Room` (`:8259`) dead | D-009 | **conflicts** |
| Continuity Check Engine (§8) | Eight competing gap engines; the approved unified one is unbuilt | D-004, D-016 | **partial** |
| Blocking severities (§8.2) | `iicrc-inclusion-check.ts` explicitly non-blocking | D-016 | **conflicts** |
| Material disposition (§9.5) | Only `PackOutDecision` for *contents*; nothing for structure | — | **absent** |
| Change / variation (§9.6) | Two unlinked tables: `ScopeVariation`, `EstimateVariation` | D-002 | **partial** |
| Offline field capture (§9.3, §17) | Substantial: SW + typed IndexedDB queue + provider | — | **exists** |
| Consumer plain-English status (§9.7) | `ClientPortalStatus` + 10→5 status mapping | — | **partial** |
| Exception inbox (§9.4) | None. Notifications page exists but is not in any nav | — | **absent** |
| AU/NZ tax + locale (§11.1) | `gst-rules.ts` correct; ~12 call sites bypass it | — | **partial** |
| Jurisdiction registry (§11.2) | `STANDARDS_VERSIONS`, `ncc-edition.ts`, jurisdictional matrix | — | **partial** |
| AI safeguards (§8.5) | `task-policy.ts` + CI audit + copyright guard | — | **exists (stronger)** |
| Accessibility AA (§12) | No jsx-a11y, no axe; Lighthouse a11y is warn-only | — | **absent** |
| Evidence immutability (§13.3) | Photos `update`d and hard-`delete`d in place | D-003 | **partial** |
| Role-aware nav (§6.1) | Three variants exist (6 / 6 / 24 destinations) | — | **exists** |

---

## 3. The four blocking structural findings

### 3.1 There is no single job entity

`Inspection` (`prisma/schema.prisma:2036`) and `Report` (`:633`) both claim the role. The link
between them is optional in both directions, and usually absent: `app/api/inspections/route.ts:390`
creates a `Report` **only** inside the branch that resolves a supplied `clientId`. An inspection
created without a client therefore has no Report — and `Report.clientId` is the only join path to
`Client`.

Four lifecycles advance independently:

| Enum | Location | Values |
|---|---|---|
| `InspectionStatus` | `schema:2257` | 11 |
| `ClaimState` | `schema:7575` | 15 |
| `ReportStatus` | `schema:1095` | 5 |
| `EstimateStatus` | `schema:1644` | 9 |

The UI is split to match: `app/dashboard/inspections/[id]/page.tsx` (3,517 lines, with a
`StatusTimeline` defined inline at line 274) and `app/dashboard/claims/[reportId]/page.tsx`. They
never appear on the same page. The portal has a third status implementation.

**Consequence for the spec:** the Job Story Spine has nothing to attach to. A spine rendered today
would have to pick one lifecycle and silently misrepresent the other three.

**Proposed resolution:** this is existing backlog item **P1-7 — ClaimProgress one protocol**. The
spine depends on it; it is not new work and should not be re-scoped as such.

### 3.2 `SketchRoom` is not yet safe to be canonical

D-009 makes `ClaimSketch`/`SketchElement` canonical for rooms and retires `Room`. That decision
stands. But the live implementation has a data-integrity defect that must be fixed **before**
canonicalisation, not during it.

`app/api/inspections/[id]/sketches/route.ts:334` hard-deletes any `SketchRoom` whose
`fabricObjectId` is no longer present in the saved canvas:

```ts
const staleIds = existingRooms
  .filter((r) => !seenFabric.has(r.fabricObjectId))
  .map((r) => r.id);
if (staleIds.length) {
  await prisma.sketchRoom.deleteMany({ where: { id: { in: staleIds } } });
}
```

Every child relation is `onDelete: SetNull` — `EvidencePin.sketchRoomId` (`schema:6635`) and
`SketchMoistureReading.sketchRoomId` (`schema:6766`). So **a redraw that changes a polygon's fabric
id silently orphans its evidence pins and moisture readings.** No error is raised and nothing
records that the link was lost.

Separately, `ScopeItem` (`schema:3015`) has no `sketchRoomId`. Its only room link is `roomId` →
the **dead `Room` model that D-009 retires**. Scope therefore points at the model being removed.

Fourteen-plus tables carry independent free-text room strings that never reconcile — the migration
surface: `InspectionPhoto.location`, `InspectionPhoto.roomType`, `MoistureReading.location`,
`MoistureReading.affectedArea`, `AffectedArea.roomZoneId`, `EvidenceItem.roomName`,
`LidarScan.roomName`, `VoiceNote.roomName`, `EnvironmentalData.location`,
`CircuitAssessment.locationZone`, `EquipmentDeployment.deploymentLocation`, `SketchRoom.name`,
`Room.name`, plus `MediaAssetTag(category="room")`.

**Proposed resolution, in order:** (a) give `SketchRoom` a stable identity that survives redraw and
stop hard-deleting rooms with children; (b) add `ScopeItem.sketchRoomId`; (c) migrate the free-text
strings behind it. Step (a) is a **prerequisite to D-009**, not a follow-on.

### 3.3 The check engine is already designed — and was never built

D-004 specifies a single deterministic engine at `lib/margot/completeness.ts` returning
facts / missing / conditional / contradictions / risks / next-actions / blocking / human-decisions
with rule sources, and states the consequence: *"one engine … unifies the three prior gap engines"*.

**That file does not exist.** `lib/margot/` contains only social and prompt modules. Meanwhile
there are now **eight** gap/completeness implementations, not three:

| Module | Scope |
|---|---|
| `lib/gap-analysis.ts` | general |
| `lib/revolutionary-gap-analysis.ts` | general |
| `lib/reports/completeness.ts` | report |
| `lib/billing-completeness-check.ts` | billing |
| `lib/billing/completeness-check.ts` | billing (**a second one**) |
| `lib/services/weakness-detection/field-completeness.ts` | field |
| `lib/live-teacher/tools/check-report-gaps.ts` | agent tool |
| `lib/iicrc-inclusion-check.ts` | standards prompts |

**Proposed resolution:** the spec's ten continuity checks land on existing backlog item **P4-3 —
Completeness engine + surfaces**, as the consolidation target. Building a ninth engine called the
"Continuity Check Engine" would move the codebase further from D-004, not closer.

### 3.4 Severity model reconciled to D-016

The spec proposes four severities where Required blocks a milestone and Critical is a hard stop.
D-016 decided the opposite: completeness output is advisory, and enforcement lives in the §9 state
machines and the §23 closure gate. **Per the owner's decision, D-016 stands.**

Reconciled model:

| Spec severity | Reconciled behaviour |
|---|---|
| Information | Engine output. Never blocks. |
| Advisory | Engine output. Surfaces before a milestone. Never blocks. |
| Required | **Not engine authority.** Expressed as a state-machine transition guard. |
| Critical | **Not engine authority.** Expressed as a closure/authority gate. |

This is not a new convention. `lib/iicrc-inclusion-check.ts` already encodes exactly this contract
in its header — *"There is no blocking severity tier: `runInclusionCheck` never gates report save,
sync, or export"* — along with mandated phrasing (`"Review prompt: consider whether…"`) and a rule
that a `groundedSection` may only come from an already-verified clause reference, never hand-typed.
Reuse that contract rather than authoring a second one.

---

## 4. Where the specification is already satisfied

Recording this so it is not rebuilt.

**Offline field capture (§9.3, §17) — largely exists.** `public/sw.js` (cache strategies, offline
API stub, Background Sync tags), `lib/nir-sync-queue.ts` (756 lines: typed queue entries, retry
backoff, conflict store, stale-write rejection), `lib/evidence-upload-queue.ts`,
`lib/voice-note-queue.ts`, `lib/offline/inspection-store.ts`, with
`components/nir-offline-provider.tsx` mounted app-wide in `app/layout.tsx`. Two caveats worth
recording rather than discovering later: `capacitor.config.ts` sets `server.url`, so the native
shells are remote WebViews whose offline ability depends on a prior online session having cached
the shell; and a Permissions-Policy reportedly blocking `camera=()` / `microphone=()` needs
removing before field deployment.

**Consumer plain-English status (§9.7) — partly exists.** `components/portal/ClientPortalStatus.tsx`
plus `lib/portal/client-status-feed.ts` already map the 10-value internal status to five
customer-facing steps (Received → Submitted → Assessed → Scope prepared → Completed), and the
drying timeline deliberately shows a curated on-track/needs-attention label rather than raw
readings. **Contradiction to fix:** the same page renders raw IICRC Cat/Class badges and m² figures
directly to the homeowner, which is precisely what §9.7 says to avoid.

**AI safeguards (§8.5) — exist, and are stronger than the spec asks.** `lib/ai/task-policy.ts`
requires every AI call site to declare a task class, data class, token and cost ceilings; the CI
step "AI guardrail audit" **fails when a new AI surface cannot be classified**.
`lib/standards/copyright-guard.ts` filters verbatim standards text from output. Genuine gaps: no
shared AI-provenance badge component, no persisted "a human accepted this AI output" flag, and
`lib/harness/gate-check.ts` has an `AUTO_SHIP` path that ships without human review above a
confidence threshold.

**Jurisdiction registry (§11.2) — partly exists.** `lib/nir-standards-mapping.ts` holds
`STANDARDS_VERSIONS` with edition, year and designation per standard; `lib/anz/ncc-edition.ts`
makes the NCC edition environment-configurable rather than hardcoded;
`lib/nir-jurisdictional-matrix.ts` carries per-state config with `lastReviewed`/`nextReviewDue`.
What is missing versus §11.2 is a database-backed registry with source URL and verifier, and
surfacing the edition used on the job.

---

## 5. AU/NZ gap register (§11.1)

New Zealand support is real but unwired. The concrete gaps:

| Gap | Evidence |
|---|---|
| **`Organization.country` is read but never written.** No country/locale/currency/timezone selector exists in setup or settings. | No writer found in `app/api/setup`, `app/api/onboarding`, `app/api/user`, `app/dashboard/settings` |
| Country is currently inferred **per sketch**, not per organisation | `components/sketch/SketchEditorV2.tsx` derives NZ-ness by scanning sketches |
| **~12 production paths bypass the GST SSOT.** `lib/gst-rules.ts:5,14` correctly encodes AU 10% / NZ 15%, but callers hardcode 10% | `lib/quotes/quote-calc.ts:12` (`GST_RATE = 0.1`), `lib/invoices/calc.ts:80` (`?? 10.0`), `lib/dispute-pack.ts`, `app/api/invoices/route.ts` |
| `.claude/RULES.md` rule 15 states *"GST = 10%"* as law, with no NZ carve-out | contradicts `gst-rules.ts` |
| **NZBN validation exists with tests and zero callers.** No NZ business number can be entered anywhere. | `lib/validation/nzbn-validator.ts` — no importer outside its own test |
| `lib/locale/format.ts` is the correct AU/NZ helper, but `lib/formatters.ts` (hardcoded `en-AU`) is the de-facto path | |
| No per-AU-state timezones — `Australia/Sydney` hardcoded in 6+ production paths | AU spans five zones with mixed DST |

This register is the highest-value, lowest-risk work in the whole specification: it is
self-contained, testable, and does not depend on §3.1 or §3.2.

---

## 6. Accessibility: §12 is a programme, not a checkbox

The specification targets WCAG 2.2 AA for staff and customer surfaces. The current posture:

- **No `eslint-plugin-jsx-a11y`, no `axe-core`, no `pa11y`** — zero matches in `package.json`.
- **Lighthouse accessibility is warn-only** at `minScore 0.9` (`config/lighthouse-agentic.json:13`),
  so a11y regressions never fail CI. Only `cumulative-layout-shift` is an error.
- **2,276 known AA-failing occurrences** of `text-slate-400`/`text-gray-400` remain unmigrated
  (`docs/design/a11y-tokens.md:4`).
- **Four hand-rolled modals have no focus trap, no Escape close, no `role="dialog"`** — audited
  2026-04-22 and unfixed (`docs/design/modal-focus-audit.md`).
- **The primary CTA colour fails contrast.** `#8A6B4E` measures 4.33:1, below the 4.5:1 floor. A
  fix (`#765C43`) was introduced, but **both remain live in the palette**, so the failing value is
  still selectable.
- No skip-to-content link. Roughly 29% of `.tsx` files under `app/` + `components/` contain any
  `aria-` attribute.

Fixed already, and worth crediting: `prefers-reduced-motion` support in `app/globals.css`, and the
viewport no longer locks zoom (WCAG 1.4.4).

**Recommendation:** treat §12 as its own sequenced epic with a ratchet (as the icon guards already
do), not as an acceptance criterion on Job Continuity work. Claiming AA before the 2,276-token
codemod and the modal fixes would be inaccurate.

---

## 7. Design-system drift blocks any visual refresh

`.claude/DESIGN.md` does not describe the product that ships:

| | DESIGN.md declares | The app actually uses |
|---|---|---|
| Primary | `--ra-primary #E55A2B` (orange) — `.claude/DESIGN.md:38` | `--color-brand-navy #1c2e47` — `app/globals.css:124` |
| Typography | Inter / JetBrains Mono — `:60-61` | Geist / Geist Mono — `app/globals.css:115` |
| Source of truth | `Synthex/packages/brand-config/...` | path does not exist in this repo |

CI cannot detect this. `.github/scripts/design-md-lint.sh` enforces only that the file exists, that
six H2 headings are present, and an icon-import ratchet — no colour, spacing, typography, contrast
or component rule is checked.

**Consequence:** any "visual refresh" that reads DESIGN.md as authoritative will encode the wrong
palette and the wrong typeface. Reconciling DESIGN.md with `app/globals.css` and
`.claude/RULES.md` rule 17 is a prerequisite to §10 of the specification.

---

## 8. Regulatory claims requiring verification before encoding

The specification asserts specific dates. **None should be hardcoded on this evidence.**

| Claim in spec | Status |
|---|---|
| NCC 2022 Amendment 2 is current, effective 29 July 2025 | **Unverified.** Must be confirmed against ABCB before changing `lib/anz/ncc-edition.ts` |
| AU automated-decision transparency obligations from 10 Dec 2026 | **Unverified.** Confirm with OAIC and a qualified reviewer |
| NZ IPP 3A indirect-collection notification from 1 May 2026 | **Unverified.** Confirm with the Office of the Privacy Commissioner |

This is not pedantry — it matches an established norm in this repo.
`lib/nir-standards-mapping.ts` records that the product once cited a **fabricated 2025 edition of
S500** that has never existed, and CI now enforces `check:standards` and `check:no-verbatim` to
prevent recurrence. Regulatory dates should enter through the versioned registry with a source URL
and a named verifier, exactly as §11.2 proposes — never as a literal.

> Worth recording: the first draft of this section quoted that fabricated citation verbatim as a
> negative example, and `npm run check:standards` failed this document at the line above. The gate
> works. It was rephrased rather than suppressed with a `standards-cite-ignore` marker — an
> exemption inside a section arguing against fabricated citations would be the wrong precedent.

---

## 9. Proposed decisions and backlog entries

For owner acceptance. **Not self-applied** — nothing has been written to
`RESTOREASSIST-DECISIONS.md` or `RESTOREASSIST-V1-BACKLOG.md`.

### Proposed decisions

**D-019 — The Job Story Spine is a projection, not an authority.**
The spine renders state derived from the unified claim entity; it authors no state and gates
nothing. Depends on P1-7. *Reason:* prevents a fifth lifecycle appearing alongside the four in §3.1.

**D-020 — Continuity findings are advisory output of the single completeness engine.**
Restates D-016 in the spine's terms: the engine emits Information/Advisory; Required/Critical are
expressed as state-machine guards and the closure gate. The spec's ten checks are delivered as
rules within P4-3, not as a separate engine.

**D-021 — Organisation-level locale is a required tenant setting.**
`Organization.country` becomes writable and authoritative for currency, GST rate, date format and
timezone. Per-sketch `country` is derived from it, not the reverse.

### Proposed backlog additions

| ID | Item | Depends on | Note |
|---|---|---|---|
| P1-12 | `SketchRoom` stable identity; stop hard-deleting rooms with children | — | **Prerequisite to D-009.** Fixes live evidence orphaning |
| P1-13 | `ScopeItem.sketchRoomId`; retire `ScopeItem.roomId` | P1-12 | Scope currently points at the retiring `Room` model |
| P3-4 | Organisation locale settings surface (country/currency/GST/timezone) | — | Independent of §3.1/§3.2 |
| P3-5 | GST call-site consolidation onto `getGstTreatment()`; NZBN wired into setup | P3-4 | Also update RULES.md rule 15 |
| P4-4 | Cross-job exception inbox (§9.4); adopt the orphaned notifications page into nav | P4-3 | No cross-job surface exists today |
| P4-5 | Consumer jargon removal — Cat/Class and m² out of the homeowner portal | — | Small, contradicts §9.7 today |
| P5-1 | Accessibility ratchet epic (§12) | — | Sequence separately; see §6 |
| P5-2 | Reconcile `.claude/DESIGN.md` with shipped tokens | — | **Prerequisite to any §10 visual work** |

---

## 10. Recommended sequence

```
Independent, start now
  ├── P3-4  org locale settings          (§5)
  ├── P3-5  GST consolidation + NZBN     (§5)
  ├── P4-5  consumer jargon removal      (§4)
  └── P5-2  DESIGN.md reconciliation     (§7)   ← gates all visual work

Structural, in order
  P1-12 SketchRoom stable identity       (§3.2) ← fixes a live defect
    └── P1-13 ScopeItem → sketchRoomId
          └── free-text room migration
  P1-7  ClaimProgress one protocol       (§3.1)
    └── D-019 Job Story Spine projection
          └── Job Overview / Field Capture / Consumer Overview screens

Consolidation
  P4-3  completeness engine (8 → 1)      (§3.3)
    └── ten continuity checks as rules
          └── P4-4 exception inbox

Separate track
  P5-1  accessibility ratchet            (§6)
```

**The three high-fidelity screens named in the specification (Job Overview, Field Capture,
Consumer Overview) are blocked** until P1-7 and P1-12 land. Built earlier, they would have to fake
the spine against one of four competing lifecycles and against room links that a redraw can sever.

The work in the top block is not blocked by anything and delivers measurable AU/NZ value on its
own.

---

## 11. What this document does not do

- It does not modify the schema, any code, `RESTOREASSIST-DECISIONS.md`, or the V1 backlog.
- It does not verify the regulatory claims in §8 — that needs a qualified reviewer.
- It does not cost or date any item; per D-010, that follows owner acceptance.
- It does not evaluate the specification's marketing sections (§15) or success measures (§4),
  which need baseline measurement before targets mean anything.
