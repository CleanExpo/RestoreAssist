# RestoreAssist — NIR Delivery Consolidation (.planning)

**Date:** 2026-06-16 · **Owner:** Senior PM (Nova lens) · **Scope:** spec.md §5.1–§5.11 · **Source:** 11 section-plan assessments reconciled against spec.md (gates §6, sign-off §7, open items §8, mapping §9) and goals.md (32 goals + BYOK B1–B5/B-tests).

---

## 1. Executive summary

The product is shipped and runs end-to-end, but **0 of 11 phases pass both their hard test gate and review gate**. Status: **1 blocked (5.8), 10 in progress, 0 done.**

Three structural truths drive this plan:

1. **Security & BYOK is the critical path, not an afterthought.** Five HIGH BYOK gaps (B1–B5) plus open RLS/storage items (#2/#10/#11/#25) and an **AU data-residency contradiction** (US-fronted CDN vs. onboarding/in-app claims of onshore storage — an active Privacy Act / false-claim exposure) gate the §4 distribution gate and the §5.10 Lens review. Most of the BYOK work is agent-fixable; residency is an owner decision. Security goes **first**.

2. **"Built but unverified" is the dominant pattern.** The mechanisms exist; the proof does not. Goal #20's offline sync engine is fully built and 4/4 green but **orphaned** (zero production callers; `useSyncEngine()` never mounted). The generation (5.4), validation (5.3), and standards (5.5) engines run end-to-end but have **near-zero unit coverage**, **no stale-standards block**, and **no reproducibility test** — so citation-presence and determinism are asserted by inspection, not proven. Closing these is mostly code-fixable and high-leverage.

3. **A single missing artifact blocks two phases.** No versioned **claims-integration JSON schema** exists, so §5.6 (format consistency) and §5.7 (integration) both have an unsatisfiable hard gate. The five wired connectors (Xero/MYOB/QuickBooks/ServiceM8/Ascora) are accounting/job systems, not insurer claims platforms — an owner must define what "target claims systems" means.

**The long pole for final sign-off is owner-gated work** (real-stakeholder validation, pilot-partner selection, prod DDL windows, rollback drill, IP/legal sign-offs, threshold-setting). Agents can land every code gate and still not reach §7 sign-off without these human inputs. See the Owner-Gated Register below.

**Stale-premise corrections fed back to goals.md:** #20 should be re-scoped from "engine build" to "engine integration" (engine is done); #5 (ABR) status "shippable now" is inaccurate (CONFIG_ERROR split unimplemented); #19 premise "128 unbounded findMany" is stale (routes are take-bounded, audit reports 0 — real work is the exemption parser + CI wiring); #8 smoke blocker appears resolved on re-run.

---

## 2. Per-phase status table

| Phase | Status | Key open tasks | Owner-gated? |
|---|---|---|---|
| **5.1** NIR Spec & Requirements | in progress | Real-stakeholder validation (techs/adjusters/admin) with dated artifact; resolve §8 owner decisions (define "complete", §4 thresholds); Nova review sign-off; §3 schema reconcile vs shipped engine; promote spec from Draft v1 | **Yes** (validation, Nova sign-off, thresholds, Draft→approved, financials) |
| **5.2** Mobile Data Capture | in progress | Wire offline engine into Expo capture (#20 — engine built, orphaned); fix photo upload field `photo`→`file` + supply chain-of-custody; pick canonical capture surface; #21 residual artifacts (RA-2119 memo, CODEOWNERS, Playwright auth smoke) | **Yes** (canonical surface, iOS OAuth re-test, Pixel+Nova usability, ≥85% metric) |
| **5.3** Validation Engine | in progress | Tests for `validateTieredCompletion` + plausible-range rejection branches; integration test for §4 intake-gate ordering; consolidate scattered range rules; dewPoint validation; reconcile web↔mobile tiered logic | **Yes** (Vex+Forge sign-off; §4 CRITICAL/range thresholds) |
| **5.4** NIR Generation Engine | in progress | **P0** stale-standards generation block; reproducibility/determinism test; engine + report-builder unit tests (#17); citation-presence tests; normalise S520 citations (#16) | **Yes** (S520:2024 re-verify, §4 cost band, Forge/Vex/Lens sign-off, IICRC rights) |
| **5.5** Standards Library | in progress | Versioned standards registry (single source); expand corpus (S520:2024/S700/S540/state codes); **staleness gate** replacing degrade-open; normalise 74 S520:2024 citations across 17 files (#16) | **Yes** (S520:2024 source, library owner+cadence, IICRC rights, Lens+Vex sign-off) |
| **5.6** Multi-Format Output | in progress | **P0** author claims-integration JSON schema + self-validation; single canonical NIR serializer feeding PDF/JSON/Excel; reconcile 4 divergent JSON routes; cross-format consistency test (incl. Excel) | **Yes** (target claims-system contract, Forge sign-off, v1 carrier-integration scope) |
| **5.7** Integrations | in progress | **P0** BYOK B1–B3; B4/B5/B-tests; ABR CONFIG_ERROR/MALFORMED split (#5); claims-JSON schema + conformance test; #27 dead-handler cleanup | **Yes** (ABR_API_GUID prod, prod encryption key, "target claims systems" decision, Forge sign-off) |
| **5.8** Architecture & Scale | **blocked** | Define target volume/surge SLO; **build load/surge harness** (hard gate, unbuilt); `// ra-query-ok` exemption parser + CI enforcement (#19); vercel.json `functions` block; headroom report | **Yes** (target-volume SLO, Forge+Grid sign-off, load-test env authorisation) |
| **5.9** QA & Testing | in progress | Report-pipeline tests (#17); coverage tooling; reproducibility test; stabilise local no-DB vitest path (#7); confirm #8 smoke executes; pilot-metrics harness | **Yes** (pilot selection + metrics, Nova sign-off, "critical bug"/cost-band thresholds) |
| **5.10** Security, Privacy & Compliance | in progress | **BLOCKER** AU residency contradiction; BYOK B1–B5/B-tests; RLS #2/#10/#11/#25; `audit-rls.ts` (#18) + advisor-regression CI (#12); CVEs (#13); route-auth #29 | **Yes** (residency posture, prod DDL window, prod encryption key, #26 toggle, IICRC rights, Lens sign-off) |
| **5.11** Deploy, Handover & Ownership | in progress | **Rollback drill** evidence artifact; reconcile prod schema drift (#3/RA-1807); flip 5 deferred owner-evidence files (#31); Founder/Board go/no-go (#32); IP-ownership confirmation (#6); single consolidated runbook; fix deploy-doc drift | **Yes** (rollback drill, prod DDL, owner evidence, go/no-go, IP confirmation) |

---

## 3. Recommended execution sequence

Ordered by dependency and risk. **Security/BYOK first** (gates distribution and the Lens review; mostly agent-fixable). Wave N's code gates unblock Wave N+1's reviews.

### Wave 0 — Security & BYOK hardening (do first; agent-fixable)
*Gates §5.7, §5.10, and the §4 distribution gate. These are HIGH credential leaks.*
- **B1** resolve AI provider from explicit enum, never `integration.name` (#B1) → test OpenAI-typed key never hits anthropic.
- **B2** contents-manifest resolves key server-side; drop forgeable body `apiKey` (#B2).
- **B3** encrypt `Account.access_token/refresh_token/id_token` at rest (#B3).
- **B4** Gemini key via `x-goog-api-key` header + Sentry span-URL scrub (#B4).
- **B5** 32-byte key assert + reject zeros + prod boot guard (#B5).
- **B-tests** `credential-vault.test.ts` round-trip/tamper/masking/gating (#B-tests).
- **In parallel (owner):** escalate **AU residency contradiction** decision (region-migrate vs retract claims) — active false-claim exposure, no code fix.

### Wave 1 — DB tenant-isolation + security test tooling (RLS prod-gated)
*Gates §5.10 Lens review and §3 gap-discovery (#170).*
- RLS #2 (revoke EXECUTE), #10 (PushToken USING), #11 (search_path), #25 (public bucket listing) — **prod DDL window, owner-gated**.
- `audit-rls.ts` (#18) → "access controls tested"; advisor-regression CI guard (#12); CVEs (#13); route-auth #29 cleanup; #26 leaked-password toggle (owner).

### Wave 2 — Generation correctness & currency (the core, agent-fixable)
*Closes §5.3, §5.4, §5.5 test gates; feeds §5.6/§5.9. Standards currency contaminates §5.4 Lens defensibility, so do together.*
- **5.4 P0** stale-standards generation block + reproducibility test + engine/report unit tests (#17) + citation-presence tests.
- **5.5** versioned standards registry + corpus expansion + staleness gate; normalise S520 citations (#16, owner-gated on the 2024 source).
- **5.3** tiered-completion + plausible-range tests; §4 intake-gate ordering integration test; consolidate range rules; reconcile web↔mobile (#20).

### Wave 3 — Output contract & integrations (depends on Wave 0/2)
*The claims-JSON schema is the shared dependency for §5.6 and §5.7.*
- **5.6 P0** author + version claims-integration JSON schema; single NIR serializer; reconcile 4 JSON routes; cross-format consistency test.
- **5.7** ABR CONFIG_ERROR/MALFORMED split (#5); claims-JSON conformance test; #27 cleanup. (BYOK already landed in Wave 0.)

### Wave 4 — Mobile capture integration (depends on Wave 2 validation)
- **5.2** wire offline engine end-to-end (#20 — integration, not build); fix photo `photo`→`file` + chain-of-custody; #21 RA-2119 memo + CODEOWNERS + Playwright auth smoke.

### Wave 5 — Scale (blocked until SLO set; owner gate first)
- **5.8** owner sets target-volume/surge SLO → build load/surge harness (hard gate) → headroom report; `ra-query-ok` parser + CI enforcement (#19); vercel.json `functions` block.

### Wave 6 — QA consolidation (depends on all code gates)
- **5.9** #17 report tests; coverage tooling; reproducibility test; stabilise local vitest (#7); confirm #8 smoke executes.

### Wave 7 — Spec finalisation + deploy/handover (owner-heavy; last)
- **5.1** real-stakeholder validation; §8 owner decisions; §3 reconcile; Nova sign-off; Draft→approved.
- **5.11** rollback drill artifact; reconcile prod schema drift (#3); flip 5 owner-evidence files (#31); go/no-go (#32); IP confirmation (#6); consolidated runbook; doc-drift fixes.
- **Pilot** (cross-cutting, owner): select 3–5 partners → produce §7 metrics (≥90% generate, cost ±10%, ≥85% easy, zero critical bugs) feeding §5.1/§5.2/§5.9.
- **Final §7 sign-off:** Nova + Lens + Atlas go/no-go.

---

## 4. Owner-gated register

Every human-only decision (agent cannot generate the evidence or flip the toggle), with why and phase. Grouped by theme.

### A. Validation, review & sign-off (judgment / human reviewers)
| Item | Why | Phase |
|---|---|---|
| Real-stakeholder validation of NIR format/fields/classifications (techs/adjusters/admin) with dated artifact | Unmet half of §5.1 Done-when; NotebookLM + video persona briefs do not satisfy it; agent cannot recruit experts | 5.1 |
| Nova (Senior PM) review-gate sign-offs | Soft-gate human PM judgment across phases | 5.1, 5.2, 5.9 |
| Pixel + Nova field-usability sign-off + ≥85%-easy metric | Needs real technicians / pilot | 5.2 |
| Vex + Forge validation-rules sign-off | Soft gate, judgment | 5.3 |
| Forge + Vex + Lens generation/standards defensibility sign-off | Lens legal/ethics is human | 5.4, 5.5 |
| Forge output-integrity + integration-resilience sign-off | Human reviewer | 5.6, 5.7 |
| Forge + Grid headroom sign-off | Needs load result that doesn't exist | 5.8 |
| Lens §5.10 security-posture sign-off | Insurance-adjacent data; blocked until P0/P1 clear | 5.10 |
| Grid + Atlas + Founder/Board go/no-go acceptance | Local evidence can never authorise; BUSINESS_SALE_READINESS.md:20 | 5.11, §7 |

### B. Business thresholds & scope decisions (not code-derivable)
| Item | Why | Phase |
|---|---|---|
| Define "complete": which §5 phases gate a readiness claim | spec.md:189, §8 open item | 5.1 |
| §4 thresholds: intake-completeness/CRITICAL fields, expected cost band, human-review cost ceiling, plausible-range bands | spec.md:190; business+standards decision | 5.1, 5.3, 5.4, 5.9 |
| Canonical field-capture surface (Capacitor web vs Expo) | Product decision; resolves two-surface delta | 5.2 |
| "Target claims systems" definition + v1 carrier-integration scope | Connectors are accounting, not insurer-claims; §5.6/§5.7 DoD ambiguous | 5.6, 5.7 |
| Target-volume / surge SLO (concurrency, RPS, p95, error budget) | The §5.8 hard-gate threshold; agent cannot invent (spec.md:190) | 5.8 |
| "Critical bug" definition for pilot scoring | §5.9 test-gate scoring | 5.9 |

### C. Compliance, legal & IP (legal/business confirmation)
| Item | Why | Phase |
|---|---|---|
| **AU data residency posture** (region-migrate to onshore CDN vs retract onshore claims) | **BLOCKER** — US-fronted CDN vs onboarding/caption claims = active false-claim / Privacy Act 1988 exposure | 5.10 |
| Rights to encode + cite IICRC S500/S520/S700 | §5.10 DoD; underpins citation outputs; no code surface | 5.4, 5.5, 5.10 |
| Name standards-library owner + update cadence | spec.md:192; the human policy the currency gate enforces | 5.5 |
| IP-entity ownership confirmation (GitHub CleanExpo / Vercel / Supabase under UNITE-GROUP NEXUS) | §2 / §7 checkbox; founder account access | 5.11 |
| Verify or retire §1.1 financial projections | spec.md:194; spec rests on evidence only | 5.1 |

### D. Production access & live evidence (founder account / prod-write)
| Item | Why | Phase |
|---|---|---|
| iOS OAuth (RA-2119) re-test on TestFlight/preview | Needs live Apple/Google accounts | 5.2 |
| S520:2024 4th-ed section re-verification | Needs licensed source; #16 warns numbering changed — do not blind-replace | 5.4, 5.5 |
| Set ABR_API_GUID / ABR_BASE_URL in Vercel prod | Founder Vercel access (#5) | 5.7 |
| Confirm live prod INTEGRATION_ENCRYPTION_KEY is real random 32-byte (not zeros placeholder) | Prod env read (B5) | 5.7, 5.10 |
| Prod DDL window for RLS migrations #2/#10/#11/#25 | Supabase prod udooysjajglluvuxkijp write | 5.10 |
| #26 Supabase Auth leaked-password toggle | Dashboard/Management API, not SQL | 5.10 |
| Rollback drill on prod/sandbox + dated evidence artifact | Prod-write; rollback must be demonstrated not documented | 5.11 |
| Reconcile prod schema drift (#3 / RA-1807, 37 tables/cols) | Prod-write DDL window | 5.11 |
| Flip 5 deferred owner-evidence files D1/D3/E1/E2/F1 (#31) | Live Stripe/Apple/Sentry evidence; founder accounts | 5.11 |
| Pilot-partner selection (3–5) + run pilot | spec.md:193; produces §7 metrics; cannot be auto-generated | 5.1, 5.9, §7 |
| Authorise load-test env + load-gen capacity | Could hit prod Supabase; needs authorisation | 5.8 |

---

## 5. Cross-phase dependencies (planner notes)

- **Claims-integration JSON schema** (§5.6 P0) is a hard dependency for §5.7's "JSON validates against claims schema" gate — plan together.
- **Standards currency** (§5.5 #16) contaminates §5.4 Lens defensibility — §5.4 cannot pass its review while it emits S520:2024 citations against a UI advertising S520:2024.
- **Goal #17** (report-pipeline tests) is mapped to §5.9 in spec §9 but its targets (`build-structured-report.ts`/`extract-report-data.ts`) are the §5.4 generation surface — it gates **both** §5.4 reproducibility and §5.9 coverage.
- **BYOK B1–B5** appear in both §5.7 and §5.10 — single sweep (Wave 0) satisfies both.
- **Pilot metrics** are shared across §5.1, §5.2, §5.9 and §7 — one pilot produces all of them.