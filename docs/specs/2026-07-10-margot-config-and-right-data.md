# SPM Spec — Margot: correct configuration + right-data grounding

> Status: DRAFT (awaiting founder approval). No spec → no build.
> Date: 2026-07-10 · Linear: RA-7026 follow-up · Author: agent (SPM)
> Builds on: docs/specs/2026-07-10-margot-per-contractor-pricing.md (Phase 1 = merged #1890 e1a6a45d)

## 1. Task
Guarantee Margot is (a) **configured** correctly end-to-end and (b) **pulling the right
data** for pricing: her quoted numbers must equal what the app's estimator uses, must
come from the asking contractor's own configured rates, and must never be polluted by a
foreign/example figure from the knowledge corpus.

## 2. Project context
Phase 1 (#1890, merged) injects the asking org's `OrganizationPricingConfig` rates into
Margot's system prompt on pricing-intent messages (`PRICING_HINT`) and the global rate
card was removed from the corpus. Two problems remain, both confirmed against prod.

**Evidence (read-only, 2026-07-10):**
- Estimators read the **user-keyed** table: `lib/billing/rate-engine.ts:106-128`
  (`companyPricingConfig.findUnique({ where: { userId } })`, priority 1),
  `app/api/calculate/route.ts:152`, `lib/nir-cost-estimation.ts:459`. Margot + setup use
  the **org-keyed** table (`OrganizationPricingConfig`).
- The two Prisma models are **field-identical** (`schema.prisma` L1588-1652 vs
  L7464-7525) — only the tenancy key differs (`userId` vs `organizationId`); the user
  table additionally has `electricityRatePer24h`.
- **Prod row counts:** `OrganizationPricingConfig` = **10**, `CompanyPricingConfig` =
  **1**, Organizations = 90. ⇒ estimators fall through to CostDatabase/NRPG fallbacks for
  ~every user, so Margot (org config) and the estimator (fallback) disagree for all 10
  configured orgs. **The drift is near-total, not a corner case.**
- **Corpus:** KNOWLEDGE tier = ~40k **CARSI** (training-LMS) chunks. 12 KNOWLEDGE chunks
  match a dollar-rate pattern; the material ones are CARSI training *examples*
  (`$440/hr consulting`, `$800 per hour` upholstery, `$30/hr course`, `$50,000 van`).
  `retrieveForReasoning` (`lib/rag/retrieve.ts:136-141`) searches ALL tiers, cosine-only,
  **no tier weighting**.
- **Margot route gates** (`app/api/margot/chat/route.ts`): `STANDARDS_HINT` (L324) →
  all-tier RAG retrieval; `PRICING_HINT` (Phase 1) → org-rate injection. A *pure* pricing
  question does NOT trigger RAG (safe). A *mixed* standards+pricing question ("what to
  charge for mould drying?") trips BOTH — so a CARSI `$/hr` example can co-exist in the
  prompt with the org rates.

## 3. Problem
1. **Drift:** Margot quotes the org's configured rate; `/api/calculate` and every
   estimator quote an NRPG fallback (because the user table is empty). Same job, two
   numbers — a credibility and correctness failure.
2. **Contamination:** on mixed questions, a foreign CARSI example rate is in Margot's
   context alongside the org rates. Phase 1's "use ONLY these rates" instruction mitigates
   but does not remove the polluting figure.
3. **Config assurance:** no automated check confirms Margot's prod wiring
   (`OPENROUTER_API_KEY`, injection deployed) or that the pricing injection actually fires
   live post-merge.

## 4. Desired outcome
- Margot's quoted rate == the estimator's rate for the same org/field (single source of
  truth = `OrganizationPricingConfig`).
- No foreign/example dollar figure can enter a pricing answer, on pure OR mixed questions.
- A repeatable verification (test + live probe) proves Margot is configured and grounded.

## 5. Scope
**Phase 1.5 — one pricing SSOT (org config), estimators repointed:**
- New `lib/pricing/effective-pricing.ts`: `resolveEffectivePricing(prisma, userId)` →
  resolve `user.organizationId` → `OrganizationPricingConfig` (authoritative) →
  fallback `CompanyPricingConfig[userId]` (legacy) → `null`. Pure-ish, one extra query.
- Repoint the three read sites (`rate-engine.ts` priority-1, `/api/calculate`,
  `nir-cost-estimation`) to resolve org-first via the shared helper. Preserve the existing
  CostDatabase/NRPG fallback chain when neither config exists.
- Margot Phase-1 resolver and the estimators now agree by construction (both org-first).

**Phase 2 (right-data guard) — pricing answers never see a foreign figure:**
- When `PRICING_HINT` fires, add an explicit prompt guard: "For pricing, use ONLY YOUR
  CONFIGURED RATES above; ignore any dollar figure appearing in STANDARDS KNOWLEDGE."
- Additionally, when the message is pricing-intent, **down-rank/exclude KNOWLEDGE-tier
  chunks from the standards-grounding retrieval** (pass a tier preference to
  `retrieveForReasoning`/`buildStandardsGrounding`) so a CARSI example never enters
  context on a pricing question. Non-pricing reasoning retrieval is unchanged.

**Phase 3 — configuration assurance:**
- A prod-safe smoke: assert `OPENROUTER_API_KEY` present, Phase-1 injection wired, and a
  scripted pricing question returns the org rate (or setup nudge), not a corpus figure.
- Verify the #1890 deploy is live and the injection fires.

**Out (explicit):** wholesale removal of CARSI KNOWLEDGE content (intentional domain
knowledge per RA-7000 — do NOT delete); a full retrieval-tier-weighting rewrite for all
query types (this spec only biases tiers for pricing-intent); back-filling the 80 orgs
with no pricing config (a product/ops task, not code); the DR ops-doc job-value medians
(aggregate context, not charge-out rates — leave, flag only).

## 6. Existing capability (do not rebuild)
- `lib/pricing/org-pricing.ts` (Phase 1) — `getEffectiveOrgPricing`, `PRICING_HINT`,
  `buildPricingGrounding`. Reuse; the estimator resolver is its user-keyed sibling.
- `rate-engine.ts` priority chain (CostDatabase → NRPG). Keep; only swap the priority-1
  source to org-first.
- `buildStandardsGrounding` seam (route L346-361) — extend with a tier preference.

## 7. Specialist board
- **PM:** the drift is the user-visible bug (Margot vs estimator mismatch); ship 1.5
  first. Contamination is lower-frequency (mixed questions only) but a trust-killer when
  it happens.
- **Architect:** unify on ONE resolver keyed by userId that resolves org-first — do not
  leave Margot and estimators on different resolvers; that is how the drift re-appears.
  Keep the resolver pure + DB-gated-tested (mock ≠ live schema is this repo's recurring
  bug class — `ci-parity-verification`).
- **Security:** foreign-tenant/foreign-product data (CARSI) in a pricing answer is a
  correctness+trust risk; tier-exclusion on pricing intent is the durable fix, the prompt
  guard is defence-in-depth.
- **QA:** must test the mixed-question path explicitly (standards + pricing) — that is the
  only contamination route and the easiest to regress.
- **Devil's advocate:** "just delete all CARSI $ chunks" → REJECT (thousands of legit
  training chunks; deletion is lossy and unmaintainable — filter at retrieval instead).
  "just trust the ONLY-these-rates instruction" → REDUCE (LLM can still anchor on an
  in-context number; remove it from context).

## 8. Judge challenge & decisions
- Phase 1.5 (org-SSOT repoint): well-defined, field-identical tables, existing fallback
  chain preserved → **APPROVE BUILD candidate (100/100 achievable).**
- Phase 2 (pricing-intent tier exclusion + prompt guard): well-scoped, low-risk, testable
  → **APPROVE BUILD candidate.**
- Phase 3 (assurance): straightforward → APPROVE.
Open decision **D4:** when both configs are absent for a user/org, keep today's
CostDatabase→NRPG fallback (recommend YES — do not regress existing estimates).

## 9. Proposed solution
```
resolveEffectivePricing(prisma, userId):
    orgId = user.organizationId
    return OrganizationPricingConfig[orgId]            # authoritative (10 rows)
        ?? CompanyPricingConfig[userId]                # legacy (1 row)
        ?? null                                        # → caller's CostDatabase/NRPG chain

estimators (rate-engine P1, /api/calculate, nir-cost-estimation):
    use resolveEffectivePricing(...) instead of companyPricingConfig.findUnique

margot route, pricing intent:
    inject org rates (Phase 1)  +  "ignore corpus $ for pricing" guard
    standards retrieval → exclude/deprioritise KNOWLEDGE tier when PRICING_HINT matches
```

## 10. UX
Invisible infra. Success: ask Margot "what should I charge for an air scrubber for a
mould job?" → returns YOUR configured AFD rate, and `/api/calculate` for the same equipment
returns the SAME number; no `$440`/`$800` CARSI figure ever appears.

## 11. Technical
- `lib/pricing/effective-pricing.ts` (new, pure + DB-gated tests).
- Edits: `rate-engine.ts` (P1 source), `app/api/calculate/route.ts`,
  `lib/nir-cost-estimation.ts`, `app/api/margot/chat/route.ts` (guard + tier pref),
  `lib/rag/retrieve.ts` / `buildStandardsGrounding` (accept `excludeKnowledge`/tier pref).
- No schema change; no migration.

## 12. Security
- Org-first resolution respects org tenancy (one config per org).
- KNOWLEDGE-tier exclusion on pricing intent prevents cross-product (CARSI) figure leak.
- No pricing numbers re-enter the corpus.

## 13. Verification
- DB-gated vitest: `resolveEffectivePricing` returns org config over user config; user
  fallback when no org; null when neither. Estimators return the org number for a seeded
  org. Margot mixed-question path injects org rates AND excludes KNOWLEDGE chunks.
- Parity: estimator number == Margot number for the same org/field (the anti-drift test).
- Live: post-deploy, ask Margot a pure and a mixed pricing question; confirm org rate,
  no CARSI figure, and `/api/calculate` agreement.
- Config: assert `OPENROUTER_API_KEY` set; #1890 injection present in the deployed build.

## 14. Loop + stress testing
20 pricing questions (10 pure, 10 mixed with a standards keyword) across labour/equipment/
fees; every answer traces to the org block; zero CARSI/foreign figures; each equipment
field matches `/api/calculate` for the same org.

## 15. Acceptance criteria
- [ ] One resolver (`resolveEffectivePricing`) is the single pricing source for Margot AND
      estimators; org config authoritative, legacy user + CostDatabase/NRPG fallbacks kept.
- [ ] Margot quote == `/api/calculate` for the same org/field (drift closed).
- [ ] No KNOWLEDGE-tier / CARSI dollar figure can appear in a pricing answer (pure or
      mixed) — proven by the mixed-question test.
- [ ] Config assurance passes (key present, injection deployed, live probe returns org
      rate / setup nudge).
- [ ] DB-gated tests green in CI; admin-only gate unchanged; no corpus deletions.

## 16. Goal command
```
/goal Build docs/specs/2026-07-10-margot-config-and-right-data.md. (1) Add
lib/pricing/effective-pricing.ts resolveEffectivePricing(prisma,userId) = org config
(via user.organizationId) ?? company config[userId] ?? null; DB-gated tests. (2) Repoint
rate-engine.ts priority-1, app/api/calculate/route.ts, lib/nir-cost-estimation.ts to it,
preserving the CostDatabase/NRPG fallback when it returns null. (3) In
app/api/margot/chat/route.ts, when PRICING_HINT fires add the "ignore corpus dollar
figures for pricing" guard AND pass a KNOWLEDGE-exclude/deprioritise flag into the
standards retrieval so CARSI examples never enter a pricing answer; wire the flag through
buildStandardsGrounding/retrieveForReasoning in lib/rag/retrieve.ts. (4) Add the parity
test (Margot number == /api/calculate number for a seeded org) and the mixed-question
contamination test. Keep admin-only gate; no schema change; no corpus deletions. Done when
Section-15 criteria pass and CI is green. DRAFT PR (founder merges).
```

## 17. Implementation sequence
1. Phase 1.5 resolver + repoint (+ parity test) → PR.
2. Phase 2 pricing-intent guard + KNOWLEDGE exclusion (+ mixed-question test) → same PR or
   a fast-follow.
3. Phase 3 assurance + live probe.
4. Flag to founder (ops, not code): 80/90 orgs have no pricing config; the DR ops-doc
   job-value medians remain (aggregate context).

## 18. Session-handoff seed
- Phase 1 merged (#1890 e1a6a45d). Corpus: DR-PRICINGGUIDE removed; 3 DR ops + 5 round-1 +
  ~40k CARSI KNOWLEDGE chunks remain (CARSI intentional; its $ examples are the
  contamination risk).
- Prod: OrganizationPricingConfig=10, CompanyPricingConfig=1, Orgs=90 (drift near-total).
- Tables field-identical → repoint is a key-swap. Estimator read sites: rate-engine.ts:113,
  calculate:152, nir-cost-estimation:459.
- Do NOT delete CARSI content; filter at retrieval for pricing intent.

## 19. Final recommendation
**APPROVE BUILD** Phase 1.5 + Phase 2 together (single resolver = SSOT, plus a
pricing-intent KNOWLEDGE exclusion + prompt guard). This closes the near-total drift and
the only corpus-contamination route for pricing, with no deletions and no schema change.
D4 = keep the existing CostDatabase/NRPG fallback when no config exists.

SPM spec complete. Next safe action: founder approves, then run the Section-16 /goal to build Phase 1.5 + Phase 2.
