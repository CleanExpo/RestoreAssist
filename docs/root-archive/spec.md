# spec.md — RestoreAssist (National Inspection Report System)

**Project:** RestoreAssist — the National Inspection Report (NIR) system (Unite Group, Priority 1)
**Owner:** Phill McGurk
**Infrastructure:** Unite Group AI Operating System (Next.js + Claude + Supabase)
**Prepared by:** Senior PM
**Status:** Draft v1 for review

> Companion document: [goals.md](goals.md) holds the current open work as 32 verifiable `/goal` conditions. This spec defines *done*; `goals.md` is the backlog the loop drives to done against these gates.

---

## 0. Where this sits in the pipeline

The RestoreAssist instance of the Unite Group completion spec:

1. **Brainstorming** — refines what to build; surfaces gaps before code.
2. **This spec (spec.md)** — defines what "done, tested, production-ready" means for the NIR system.
3. **Deterministic Loop** — drives work to done and checks against this spec each pass. "Loop-until-done" = all gates in §5 pass.

> **Scope.** spec.md governs the **NIR core** — the consequential capture → interpret → generate → distribute pipeline (§4 gates, §5.1–§5.7). Whole-product concerns (billing, mobile/app-store, branding, dependency hygiene) live in [goals.md](goals.md) and enter these gates only where they touch §5.8 (scale), §5.10 (security/privacy), or §5.11 (deploy/ownership). The §9 mapping shows which open goal serves which gate.

---

## 1. System observatory — what RestoreAssist is

**The product:** one standardized inspection and scope-of-work report (the NIR) to replace the 50+ formats currently used across the industry. The defining design choice: **the technician measures and observes; the system interprets and generates.** A junior tech produces a pro-level report because the interpretation is the system's job, not theirs.

**The pipeline:** Technician captures measurements (moisture, humidity, temp), timestamped photos, and a structured form (dropdowns, no interpretation) → mobile app auto-validates and uploads → NIR generation: derives state building code from the property address, applies IICRC standards (S500/S520/S700), classifies damage (Category/Class), identifies state triggers, evaluates scope, estimates cost, builds a verification checklist, and writes an audit trail → outputs in three formats: PDF (insurer/client/admin), JSON (claims-system integration), Excel (billing/ops).

**The infrastructure (Unite Group):** runs on your existing agent OS. Review roles below map to your agents — Nova (Senior PM), Lens (legal/ethics), Forge (developer), Vex (data/algorithm), Grid (devops). Adjust names if your roster has shifted.

### 1.2 Reviewer roster → runnable mechanism

The persona names are reconciled here to the review mechanisms that actually exist in this system, so every §5/§6 soft gate is executable rather than notional.

| Persona | Role | Runnable mechanism in this system |
|---|---|---|
| Nova | Senior PM | PM-lens reviewer agent + `pi-governance-gate` — signs §5.1, §5.9 |
| Lens | Legal / ethics / defensibility | `security-review` skill + compliance-lens reviewer — signs §5.4, §5.5, §5.10 |
| Forge | Developer / build integrity | `code-reviewer` agent (`feature-dev:code-reviewer`) — signs §5.4, §5.6, §5.7, §5.8 |
| Vex | Data / algorithm / logic | logic-lens `code-reviewer` + `Explore` over the generation engine — signs §5.3, §5.4, §5.5 |
| Grid | DevOps / deploy | `deployment-verifier` agent — signs §5.8, §5.11 |
| Sage | Scout / gap-discovery | `Explore` agent + the goals-discovery workflow — runs §3 |
| Pixel | UX / field usability | UX reviewer + `web-design-guidelines` skill — signs §5.2 |
| Atlas | Ownership / handover / sign-off | human owner sign-off + `pi-governance-gate` (largely human) — signs §5.11, §7 |

### 1.1 Reading note — claims to verify, not assume

The NIR business case cites subscription tiers, per-claim savings ($4,500–8,000), industry-wide savings (up to ~$1B+), and multi-year revenue/ROI projections. These are **business targets, not engineering facts**, and are kept out of the gates below. A "% complete" figure means nothing until "complete" is defined by §5 and §7.

---

## 2. Definition of "Production-Ready & Owned"

RestoreAssist is production-ready and fully owned when **all** are true:

- Every phase in §5 has passed its completion gate.
- All code and IP live under the owning legal entity's repos/accounts — **UNITE-GROUP NEXUS PTY LTD** (GitHub org `CleanExpo`, Vercel, Supabase project `udooysjajglluvuxkijp`).
- Every generated interpretation (classification, scope, cost) is traceable to a cited standard and verified before distribution (§4).
- The standards library is current and versioned.
- A new engineer could run the system from the docs alone.
- The §3 gap-discovery pass returns zero open blockers or majors.

This is the concrete meaning of the roadmap's "Phase 1 outcome: production-ready system."

---

## 3. Gap-discovery mechanism

Run at the end of every phase and before sign-off — a natural fit for Sage (scout) + Nova (PM) on the nightly cycle:

1. Enumerate expected components per phase from §5.
2. Compare against what exists in repo / deployment / docs.
3. List every delta as an open gap: phase, description, severity (blocker / major / minor).
4. Feed gaps back as Linear tickets. Nothing is "done" while a blocker or major is open.

---

## 4. The consequential-output gates (the heart of this product)

Because the system interprets in place of a human, its outputs carry financial and legal weight the moment they leave the building. The "5% oversight" is spent here. The system may *generate* any output below; it may **not distribute** a report until the gate clears.

| Output | Why it's gated | Required gate |
|---|---|---|
| **Data intake** | Incomplete data is the exact cause of re-inspections RestoreAssist exists to kill | Completeness + range validation before generation; incomplete capture is rejected or flagged, never silently passed |
| **Damage classification (Category/Class)** | Drives scope and payout; carries legal weight | Must cite the IICRC standard applied (S500/S520/S700) and be reviewable |
| **Scope determination** | Source of disputes and liability | Standards-justified, with the justification surfaced in the report — not asserted |
| **Cost estimate** | Over/under-scoping causes disputes and wrong payouts | Range check; flag for human review when outside the expected band; target accuracy within 10% of actuals |
| **Final NIR before distribution** | Insurers and clients act and pay on it | Verification checklist complete AND audit trail intact before any send |
| **Standards library currency** | A report citing a superseded standard is a liability | Versioned standards library; generation is blocked if standards are stale |

**Rule:** an un-verified report does not reach an insurer or client. The checklist and audit trail you already designed are the mechanism — this spec makes them **gates, not optional features**.

---

## 5. Phases, completion criteria, and gates

Each phase: **Definition of Done** (checkable), **Test gate** (hard, code-checkable), **Review gate** (the role/agent who signs off).

### 5.1 NIR Specification & Requirements
- **Done when:** the NIR format, fields, classifications, and scope logic are defined and validated with real stakeholders (techs, adjusters, admin).
- **Test gate:** brainstorming self-review passes — no placeholders/contradictions.
- **Review:** Nova confirms the spec matches real-world needs ("confirm NIR aligns with real needs").
- **Status (2026-06-16):** in progress — "defined" leg code-backed (NIR-STANDARDS-SPEC-v2 + lib/nir-*); "validated + Nova-reviewed" leg unmet; spec still Draft v1. No goal maps (§9).

### 5.2 Mobile Data Capture (any-skill technician)
- **Done when:** the form is usable by a junior tech; dropdowns remove interpretation; photos auto-timestamp; poor connectivity at a damage site is handled (offline/retry).
- **Test gate:** captured data always conforms to the schema; a field tech can complete a capture without training.
- **Review:** Pixel + Nova confirm it's genuinely usable in the field.
- **Status (2026-06-16):** in progress — #20 offline engine built+4/4 green but orphaned (zero callers); photo field `photo`≠`file`; #21 residual artifacts absent; no field-usability sign-off.

### 5.3 Validation Engine
- **Done when:** measurements and form data are auto-validated for completeness and plausible range at capture time.
- **Test gate:** incomplete/implausible captures are caught before generation (the §4 intake gate).
- **Review:** Vex + Forge confirm the rules catch the real failure modes.
- **Status (2026-06-16):** in progress — §4 intake gate correctly wired before generation, but Test gate red: zero tests for tiered-completion or any plausible-range rejection branch.

### 5.4 NIR Generation Engine (the core)
- **Done when:** address→building-code derivation, IICRC application, damage classification, scope evaluation, cost estimation, checklist, and audit trail all run end-to-end.
- **Test gate:** every classification/scope/cost output carries its standard citation; generation blocks on stale standards; outputs are reproducible from the same input + standards version.
- **Review:** Forge (build) + Vex (logic) + Lens (defensibility) confirm outputs are standards-justified.
- **Status (2026-06-16):** in progress — full pipeline + citation-aware; lifecycle integrity (#4) done; but no stale-standards block, no reproducibility test, zero engine coverage (#17), S520 stale (#16).

### 5.5 Standards Library
- **Done when:** IICRC S500/S520/S700 and the relevant state building codes are encoded, versioned, and have an update path.
- **Test gate:** every cited standard resolves to a current, versioned entry; updates propagate to all future reports.
- **Review:** Lens + Vex confirm currency and correctness.
- **Status (2026-06-16):** in progress — citations hardcoded across 17 files, no version registry, no staleness gate (degrades open); S520:2024 stale vs advertised 2024 (#16).

### 5.6 Multi-Format Output
- **Done when:** PDF, JSON, and Excel are generated consistently from one NIR.
- **Test gate:** the three formats are mutually consistent; JSON validates against the claims-integration schema.
- **Review:** Forge confirms output integrity.
- **Status (2026-06-16):** in progress — 3+ independent generators per format with no shared source; no claims-integration JSON schema exists; only sketch-chain consistency tested. No goal maps.

### 5.7 Integrations
- **Done when:** the JSON output integrates with target claims systems and fails gracefully.
- **Test gate:** integration tests pass; failures are handled, not crashed.
- **Review:** Forge confirms resilience.
- **Status (2026-06-16):** in progress — outbound resilience strong, but 5 HIGH BYOK gaps (B1-B5) open, ABR split unbuilt (#5), claims-JSON schema undefined; #15 done, #27 cleanup-only.

### 5.8 Architecture & Scale
- **Done when:** the system handles claim volume, including post-disaster surges.
- **Test gate:** load/surge test passes at target volume.
- **Review:** Forge + Grid confirm headroom.
- **Status (2026-06-16):** blocked — load/surge hard gate has zero implementation and no owner-set target volume; #19 routes take-bounded (premise stale), real gap is exemption parser + CI.

### 5.9 QA & Testing (pilot-readiness)
- **Done when:** unit, integration, regression, and field-realistic tests pass.
- **Test gate (folds in pilot metrics):** ≥90% of reports generate successfully; cost estimates within 10% of actuals; zero critical bugs.
- **Review:** Nova confirms tests cover what matters.
- **Status (2026-06-16):** in progress — #7 vitest gate enforcing, #8 smoke appears resolved; but #17 report tests absent, no coverage tooling, no reproducibility test, pilot metrics blocked on owner.

### 5.10 Security, Privacy & Compliance
- **Done when:** property/personal data privacy, Australian data residency, payment security (if billing is in scope), and IICRC/standards usage rights are addressed.
- **Test gate:** security review passes; no secrets in code/logs; access controls tested.
- **Review:** Lens confirms the posture fits insurance-adjacent data.
- **Status (2026-06-16):** in progress — #1 done, but AU-residency contradiction (BLOCKER), 5 HIGH BYOK gaps, RLS #2/#10/#11/#25, and #18 audit-rls.ts/#12 advisor guard absent.

### 5.11 Deploy, Handover & Ownership
- **Done when:** repeatable documented deploy; rollback tested; all code/config/docs under UNITE-GROUP NEXUS PTY LTD's accounts (GitHub `CleanExpo`, Vercel, Supabase); no builder-only knowledge.
- **Test gate:** clean deploy + rollback demonstrated; a non-builder runs it from docs alone.
- **Review:** Grid + Atlas confirm no single point of human dependency.
- **Status (2026-06-16):** in progress — deploy+rollback+handover documented, but rollback not demonstrated, prod schema drift unreconciled (#3), 5 owner-evidence files deferred (#31), no go/no-go (#32).

---

## 6. The review layer — "multiple eyes"

- **Hard gates** (code-checkable, non-negotiable): schema conformance, standard-citation presence, reproducible generation, format consistency, surge test, deploy + rollback, the §4 distribution gate.
- **Soft gates** (judgment): Nova (PM), Lens (legal/ethics), Forge (code), Vex (logic). Valuable — but LLM reviewers vary run to run, so they are not the only protection.
- A phase passes only when its **hard gate passes AND no soft reviewer objects.**

---

## 7. Final sign-off checklist

RestoreAssist is production-ready when every box is true:

- [ ] §3 gap-discovery: zero open blockers, zero open majors.
- [ ] Every §4 gate demonstrably blocks an unverified report from distribution.
- [ ] All phases §5.1–§5.11 passed both test gate and review gate.
- [ ] ≥90% of pilot reports generate successfully.
- [ ] Cost estimates land within 10% of actuals.
- [ ] ≥85% of technicians rate the capture form "easy."
- [ ] Insurance adjusters approve report quality.
- [ ] Zero critical bugs in pilot.
- [ ] Standards library current and versioned.
- [ ] All code and IP under UNITE-GROUP NEXUS PTY LTD's accounts (GitHub `CleanExpo`, Vercel, Supabase).
- [ ] Nova (Senior PM), Lens (Legal/Ethics), and Atlas signed go/no-go.

Any unchecked box = not done, but **in progress with a named, visible gap**. This is the only honest basis for calling the system "production-ready" — and the only "% complete" number worth quoting to a pilot partner or insurer.

---

## 8. Open items for you to close

- [ ] Validate the NIR spec with real stakeholders before deep build.
- [ ] Define "complete": which §5 phases must pass for a readiness claim.
- [ ] Set the §4 thresholds: intake completeness rules; the expected cost band; the cost-estimate value above which a human reviews.
- [ ] Confirm compliance: Australian data residency, payment security if billing is in scope, and your rights to encode and cite IICRC standards.
- [ ] Name the standards-library owner and update cadence — someone must keep S500/S520/S700 and building codes current, or §4's currency gate will fail.
- [ ] Pick the 3–5 pilot partners who will produce the §7 metrics.
- [ ] Verify or retire the financial projections in §1.1 so the spec rests only on evidence.

---

## 9. Execution mapping — spec ↔ goals.md

The deterministic loop (§0.3) works [goals.md](goals.md) to done and checks each pass against the gates here. Current alignment (goal numbers are `goals.md` ranks):

| spec gate / phase | open goals (goals.md) | note |
|---|---|---|
| §5.2 Mobile capture | #20 offline sync, #21 iOS auth | open |
| §5.4 Generation lifecycle | #4 submit→COMPLETED bug | open · code-only |
| §5.5 Standards currency | #16 IICRC S520:2024 | open · code-only |
| §5.7 Integrations | #5 ABR, #15 email fallback, #27 OpenAI/Gemini | open |
| §5.8 Scale / perf | #19 unbounded findMany | open |
| §5.9 QA / reproducibility | #17 report-pipeline tests | open · code-only |
| §5.10 Security / privacy | #1,#2,#10,#11,#25 RLS+storage, #13 CVEs, #29 route auth | open · #1/#2/#10/#11/#25 prod-gated |
| §3 gap-discovery guards | #12 advisor guard, #18 RLS audit script | open |
| §7 Release sign-off | #6 release gate 100/100, #7 vitest, #8 smoke, #31/#32 owner evidence | open |
| §2 Ownership | #6 + IP-entity accounts confirmed | open |
| §5.1, §5.3, §5.6, §5.8(arch) | *(no open goal)* | presumed satisfied by shipped product — **confirm via §3, do not assume** |

Whole-product goals outside the NIR §5 phases (tracked in goals.md only): #22, #23 (store screenshots), #24 (lint), #26 (auth toggle), #28 (CI gate), #30 (branding).
