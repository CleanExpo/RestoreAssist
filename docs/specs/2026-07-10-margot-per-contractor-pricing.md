# SPM Spec — Multi-tenant Margot grounded on per-contractor pricing

> Status: DRAFT (awaiting founder approval). No spec → no build.
> Date: 2026-07-10 · Linear: RA-7026 follow-up · Author: agent (SPM)

## 1. Task
Make Margot answer pricing questions from **each contractor's own configured rates**
(the prices they enter during setup), never a global/hardcoded rate card — and lay the
path for Margot to become contractor-facing (multi-tenant) rather than the founder's
single-principal admin PA.

## 2. Project context
- **Margot chat route:** `app/api/margot/chat/route.ts`. Admin-only
  (`verifyAdminFromDb`, L365-367), **single principal** — persona hardwired to "Phill
  McGurk" (`MARGOT_SYSTEM_PROMPT_BASE`, L50-77). Resolves `organizationId` but discards
  it. No pricing is injected anywhere; grounding is RAG-only via
  `buildStandardsGrounding` (L346-361), gated by the `STANDARDS_HINT` regex (L324-325)
  which does **not** include price/charge/rate.
- **RAG retrieval:** `retrieveForReasoning` (`lib/rag/retrieve.ts` L136-141) searches
  ALL provenance tiers (AUTHORITATIVE_STANDARD + KNOWLEDGE), pure cosine, **no tier
  weighting** — so any dollar figure in the corpus can be surfaced verbatim into a
  Margot answer. (This is why the just-removed DR-PRICINGGUIDE global rate card was
  unsafe.)
- **Two pricing stores that DRIFT (the central trap):**
  - `OrganizationPricingConfig` (`prisma/schema.prisma:7464-7525`), key
    `organizationId @unique` — **written by the setup wizard**
    (`components/setup/PricingCard.tsx` → `PATCH /api/setup/pricing` →
    `app/api/setup/pricing/route.ts:142-147`). Prefilled from `getDefaultPricing()` at
    onboarding (`lib/setup/jobs.ts:150-193`), then overridden by contractor edits. This
    is "the prices they input on setup."
  - `CompanyPricingConfig` (`prisma/schema.prisma:1588-1652`), key `userId @unique` —
    **read by every estimation engine**: `lib/billing/rate-engine.ts` `lookupRate({
    userId, field, region })` (L106-171), `app/api/calculate/route.ts:152`,
    `lib/nir-cost-estimation.ts:459`.
  - The two are linked only by a one-time backfill
    (`scripts/backfill-setup-wizard.ts:78-96`); they drift after setup.

## 3. Problem
The founder's directive: *"These prices need to be directly linked to the Contractors'
Prices, not my prices. They input their prices on setup. That's where Margot gets these
numbers from."* Today Margot has **no** pricing grounding, and the only pricing that
could reach it was a shared global rate card in the RAG corpus (now removed). There is
no code path that feeds a contractor's own setup-entered rates into a Margot answer, and
Margot is not tenant-scoped at all.

## 4. Desired outcome
1. When any contractor asks Margot a pricing question ("what should I charge for an air
   scrubber / a Cat-3 tech / after-hours labour"), Margot answers with **that
   contractor's configured rates** from their setup store — or, if they haven't set them,
   tells them to complete pricing setup rather than inventing a number.
2. The number Margot quotes matches what the app's estimator would use (no drift).
3. Margot can be safely exposed to contractors (multi-tenant) without leaking one
   contractor's data to another.

## 5. Scope
**Phase 0 — DONE (2026-07-10):** removed the global rate card (`DR-PRICINGGUIDE`, 6
chunks) from prod `IicrcChunk`. Corpus now holds zero global charge-out figures.

**Phase 1 — per-contractor pricing grounding (forward-compatible, ships the core value):**
- New pure resolver `getEffectiveOrgPricing(prisma, organizationId)` reading
  `OrganizationPricingConfig` (the setup truth), returning a typed rate set + a
  `configured: boolean` flag (false when the row is absent/defaults-only).
- Inject a compact `--- YOUR CONFIGURED RATES ---` block into Margot's system prompt
  when the question is pricing-related. Extend the retrieval/injection gate with a new
  `PRICING_HINT` regex (price, charge, rate, quote, $/hr, day-rate, per day, per hour,
  labour rate, call-out, after-hours).
- Prompt instruction: answer pricing strictly from the injected rates; if
  `configured=false`, direct the user to Settings → Pricing; never quote a rate not in
  the block.
- Use the `organizationId` already resolved by `verifyAdminFromDb` (stop discarding it).
- Tests (vitest, DB-gated per `ci-parity-verification`): resolver returns configured
  rates / defaults-flag / missing-config; gate fires on pricing words and not on casual
  threads; prompt block formatting; no injection when `configured=false` beyond the
  "complete setup" nudge.

**Phase 1.5 — reconcile the two-table drift (correctness dependency):**
- Make `OrganizationPricingConfig` the single source of truth and route the estimation
  readers (`rate-engine.ts`, `/api/calculate`, `nir-cost-estimation.ts`) to the org
  config (or add an org-aware `lookupRate` overload), so Margot's quote == estimator's
  quote. Alternatively a live sync org↔user on write. **Decision required** (see §8).

**Phase 2 — contractor-facing (multi-tenant) Margot:**
- De-hardwire the persona (remove "Phill McGurk"; parameterise by org/brand).
- Replace the admin gate with `getServerSession` + subscription gate (CLAUDE.md rule 5:
  allowlist TRIAL/ACTIVE/LIFETIME, 402 otherwise) + per-`session.user.id` rate limit
  (rule 8).
- Org-scope EVERY context source (Nexus bundle, memory, tools) so no cross-tenant leak;
  add/verify RLS on any Margot-readable table.
- Audit the Linear/deep-research/image tools for tenant-safety before exposing them.

**Out (explicit):** changing the RAG retrieval tier-weighting (separate hardening spec);
re-ingesting any pricing numbers into the corpus (pricing is live-injected, never RAG);
building a new contractor pricing UI (setup wizard already captures it).

## 6. Existing capability (do not rebuild)
- Setup capture + persistence: `PricingCard.tsx` + `/api/setup/pricing`. Reuse as-is.
- Defaults + scaling: `lib/pricing/defaults-au.ts` `getDefaultPricing()`. Reuse for the
  prefill only; never as an answer-time source.
- User-scoped resolver pattern: `lib/billing/rate-engine.ts` — mirror its priority-chain
  shape for the org resolver; do not fork its user-keyed logic.
- Margot prompt-assembly seam: `route.ts:391-407` — the injection slots in right after
  `buildStandardsGrounding`.

## 7. Specialist board (15-yr perspectives)
- **PM:** Phase 1 is the founder's actual ask and ships standalone; Phase 2 is a product
  bet (contractor-facing AI) that shouldn't block the pricing fix.
- **Architect:** the org/user table drift is the real hazard — pick ONE SSOT before
  Margot and the estimator can disagree in front of a customer. Resolver must be pure +
  DB-gated-tested (mock ≠ live schema is this repo's recurring bug class — see
  `ci-parity-verification`).
- **UX/Margot:** frame the injected block as imperative ("YOUR configured charge-out
  rates"), and make the missing-config path a helpful nudge, not a hallucinated number.
- **Security:** Phase 2 is where tenant-isolation risk lives. Do NOT expose Margot to
  contractors until persona de-hardwiring + subscription gate + RLS + tool-tenancy audit
  are all done. Phase 1 stays admin-only and is safe today.
- **QA:** DB-gated tests are mandatory (Docker locally unavailable → gate on CI run).
- **Devil's advocate:** "just re-ingest the contractor's numbers into RAG per-tenant" →
  REJECT (retrieval has no tenant filter; would cross-contaminate and re-create the
  global-rate-card bug).

## 8. Judge challenge & decisions required
Score today: **Phase 1 = APPROVE BUILD candidate (blocked on one decision).** Phases 2
and 1.5 are APPROVE-PLAN, not yet 100/100 (open decisions below). Per the hard line, I am
NOT authorising a build until these are resolved to a real 100.

Decisions the founder must make:
- **D1 (drift SSOT):** make `OrganizationPricingConfig` the estimation SSOT (repoint
  readers), OR keep both tables with a live write-sync? Recommend: org config as SSOT,
  repoint readers (removes a whole class of "Margot says X, invoice says Y").
- **D2 (Phase 2 trigger):** build contractor-facing Margot now, or ship Phase 1 (admin,
  your org) first and treat Phase 2 as a separate epic? Recommend: Phase 1 first.
- **D3 (per-contractor persona/brand):** when Margot goes multi-tenant, is the persona
  per-org-branded or a single neutral "RestoreAssist assistant"?

## 9. Proposed solution (Phase 1 detail)
```
question → verifyAdminFromDb → organizationId (STOP discarding it)
        → PRICING_HINT.test(question)?
             yes → getEffectiveOrgPricing(prisma, organizationId)
                   → format "--- YOUR CONFIGURED RATES ---" block (labour $/hr by role,
                     equipment $/day, fees, after-hours multipliers) + imperative instr
                   → append to system prompt
             no  → unchanged
        → (standards grounding path unchanged)
```
Missing config → inject only: "This contractor has not completed pricing setup — direct
them to Settings → Pricing; do not quote a rate."

## 10. UX
Invisible infra; surface is Margot's answers. Success = ask "what should I charge for an
air scrubber?" → Margot returns the org's configured AFD/day rate (or the setup nudge),
never a corpus number.

## 11. Technical
- `lib/pricing/org-pricing.ts` (new): `getEffectiveOrgPricing`, `formatOrgPricingBlock`,
  `PRICING_HINT`. Pure functions, unit-tested.
- `route.ts`: use `auth.user.organizationId`; call the resolver+formatter behind the
  gate; append to `system`.
- Phase 1.5/2 land in follow-up PRs.

## 12. Security
- Phase 1 stays admin-gated → no new exposure.
- Phase 2 gates: subscription (rule 5), rate-limit by user id (rule 8), RLS, persona
  de-hardwire, tool-tenancy audit — ALL required before any contractor sees Margot.
- No pricing numbers ever return to the RAG corpus.

## 13. Verification
- Phase 1: DB-gated vitest green in CI (resolver + gate + formatter + missing-config);
  manual — ask admin Margot a pricing question, confirm it returns YOUR configured rate,
  and returns the setup-nudge when the config row is cleared.
- Phase 1.5: estimator (`/api/calculate`) and Margot return the SAME number for the same
  role/equipment.

## 14. Loop + stress testing
20 pricing questions across labour/equipment/fees/after-hours; confirm every answer
traces to the injected block; 10 casual questions confirm the gate does not fire; 1
cleared-config case returns the nudge.

## 15. Acceptance criteria (Phase 1)
- [ ] `getEffectiveOrgPricing` reads `OrganizationPricingConfig` by `organizationId`,
      returns typed rates + `configured` flag.
- [ ] Margot injects YOUR-configured-rates block only on pricing-intent questions.
- [ ] Missing/defaults-only config → setup nudge, never a fabricated rate.
- [ ] No global/corpus pricing number can appear in a pricing answer.
- [ ] DB-gated tests pass in CI; admin-only gate unchanged.

## 16. Goal command (Phase 1, after approval + D1/D2)
```
/goal Build Phase 1 of docs/specs/2026-07-10-margot-per-contractor-pricing.md. Add
lib/pricing/org-pricing.ts (getEffectiveOrgPricing reading OrganizationPricingConfig by
organizationId → typed rates + configured flag; formatOrgPricingBlock; PRICING_HINT
regex). Wire app/api/margot/chat/route.ts to use auth.user.organizationId (stop
discarding it) and, when PRICING_HINT matches, inject the YOUR-CONFIGURED-RATES block
into the system prompt with an imperative "answer only from these rates; if not
configured, send them to Settings → Pricing" instruction. DB-gated vitest for resolver +
gate + formatter + missing-config. Keep admin-only gate unchanged. Done when Section-15
criteria pass and CI is green. Open a DRAFT PR (founder merges — agent PRs are not
self-merged).
```

## 17. Implementation sequence
1. Phase 0 — DONE (rate card removed).
2. Founder resolves D1/D2/D3.
3. Phase 1 build (1 session) → DRAFT PR → founder merge.
4. Phase 1.5 drift reconciliation (depends on D1) → PR.
5. Phase 2 contractor-facing epic (separate spec if large) → PRs.

## 18. Session-handoff seed
- Corpus is clean (no global rates); 3 ops docs + 5 round-1 docs remain.
- Two-table drift is the load-bearing risk; do not ship Phase 1.5 without picking an SSOT.
- Margot is admin-only/single-principal today — Phase 1 is safe; Phase 2 needs the full
  tenant-isolation gate before any contractor exposure.
- Evidence anchors: route L324-407, retrieve.ts L136-141, schema L1588-1652 & L7464-7525,
  setup/pricing route L142, rate-engine.ts L106-171.

## 19. Final recommendation
**APPROVE Phase 1 build** once D1 (drift SSOT) and D2 (Phase-2 timing) are answered —
recommend org-config-as-SSOT and Phase-1-first. Phase 1 delivers the founder's directive
(contractor's own rates, never a global card) on an admin-safe, forward-compatible path.
Treat contractor-facing Margot (Phase 2) as a separate, security-gated epic.

SPM spec complete. Next safe action: founder answers D1/D2/D3, then run the Phase-1 /goal.
