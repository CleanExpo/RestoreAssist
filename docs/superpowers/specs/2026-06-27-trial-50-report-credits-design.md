# Free Trial → 50 Report Credits — Design

**Date:** 2026-06-27
**Status:** Approved — ready for implementation plan
**Author:** Phill McGurk (with Claude Code)
**Branch:** `feat/trial-50-report-credits` (off current `main`)

---

## Goal

Increase the honest free-trial **report-credit** grant from **30 → 50**. Everything else about the trial is unchanged: **15-day** length and **30** Quick Fill credits.

## Background

The honest 15-day trial (PR #1254 + the report-cap follow-up) is merged. `lib/pricing.ts` → `PRICING_CONFIG.free` is the single source of truth (SSOT): all four signup paths and the trial report-cap derive their numbers from it, and `lib/__tests__/pricing-integrity.test.ts` asserts the marketing copy stays in lock-step with the actual grants.

Key architectural fact (verified): the trial **report cap** in `lib/report-limits.ts` (lines ~160–184) derives the cap from `PRICING_CONFIG.free.trialReportCredits` — it is **not** a separate hardcoded `30`. So raising the credit grant to 50 raises the usable cap to 50 automatically. There is no "50 credits but capped at 30" contradiction.

## Change (single source of truth)

In `lib/pricing.ts` → `PRICING_CONFIG.free`:

| Field | From | To | Note |
|---|---|---|---|
| `trialReportCredits` | 30 | **50** | The one value that matters — propagates to all 4 signup grants AND the report cap |
| `reportLimit` | 30 | **50** | `@deprecated` alias kept for display cards; keep it mirroring `trialReportCredits` |
| `description` string | "…30 inspection report credits…" | "…**50** inspection report credits…" | Marketing copy |
| `features[]` "30 inspection report credits" | 30 | **50** | Marketing copy line |

**Unchanged:** `trialDays` (15), `trialQuickFillCredits` (30), the Quick Fill copy lines, and all paid-plan config.

## Derived automatically — no code edits needed

Because these already read from the SSOT, they update with no change:
- The 4 signup grants: `app/api/auth/register/route.ts`, `app/api/auth/google-signin/route.ts`, `app/api/auth/native-token-exchange/route.ts`, `app/api/user/profile/route.ts` (each binds `TRIAL_REPORT_CREDITS = PRICING_CONFIG.free.trialReportCredits`).
- The trial report cap in `lib/report-limits.ts`.
- Display pages that read from the config (`app/pricing/page.tsx`, `app/signup/page.tsx`, `app/dashboard/credits/page.tsx`).

## Tests

The two pricing suites are the guardrail — update the **report-credit / cap** expectations of `30 → 50`, leaving **Quick Fill (30)** and **trial-days (15)** expectations untouched:
- `lib/__tests__/pricing-integrity.test.ts` — asserts grants == config and copy mentions the right numbers.
- `lib/__tests__/trial-report-cap.test.ts` — asserts the cap blocks the 51st report (was: the 31st) and that a trial user can file up to 50 (was: 30).

Both suites must pass against the new values. A grep for any other surface that hardcodes "30 inspection report credits" (the integrity test should catch drift) confirms nothing else needs touching.

## Success criteria

1. A new trial signup (any of the 4 paths) grants **50** report credits and **30** Quick Fill credits, expiring in **15 days**.
2. A trial user can create up to **50** reports; the **51st** is blocked by the cap (not the 31st).
3. The signup page, public pricing page, and welcome email all read **"50 inspection report credits"** from the SSOT (no drift).
4. `pricing-integrity.test.ts` and `trial-report-cap.test.ts` pass with the new values.
5. `npm run build` passes.

## Out of scope

Paid plan amounts/limits, Quick Fill credit count, trial length, new plan tiers, and any retroactive change to existing trial users' balances (this affects new grants and the cap going forward).

## Open question

Existing TRIAL users who signed up under the 30-credit grant: do they get topped up to 50, or keep their original balance? **Default (this spec): no retroactive top-up** — the change applies to new signups and to the cap (so an existing trial user with 30 credits already used 25 would now be capped at 50, gaining headroom). Flagged for confirmation; a one-off backfill would be a separate task.
