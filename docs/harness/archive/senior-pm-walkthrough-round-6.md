# Senior PM Walkthrough — Round 6 (Sellability re-score)

**Date:** 2026-10-06
**Rubric:** Is the product sellable? (same eight criteria as round 5)
**Verdict:** **AMBER** — zero FAILs remain, but two of the four round-5 launch
blockers close on owner action rather than on code, so this is not GREEN yet.

Round 5 is at `senior-pm-walkthrough-round-5.md`. This round re-scores all
eight criteria and closes blocker 4.

---

## Sellability scorecard

| #   | Criterion                                                                   | R5          | R6          | What changed, and what was actually checked                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pricing page reads correctly (GST-inclusive, tax invoice promise, no drift) | **FAIL**    | **PASS**    | `app/pricing/page.tsx` now carries GST / AUD / tax-invoice copy (7 matches). Drift is guarded as of this round — see blocker 4 below.                                                                                                                                                                                                       |
| 2   | Onboarding time-to-value < 3 min (measurable activation events)             | **PARTIAL** | **PARTIAL** | The telemetry gap is closed: `lib/analytics/track.ts` emits and `app/api/analytics/activation-funnel/route.ts` (RA-1246) aggregates `signup_completed → first_report_started → first_report_saved → first_interview_completed → first_integration_connected`. It returns **counts and conversion rates only** — no duration, so "< 3 min" is still unmeasured. |
| 3   | Demo mode / sample data covers 80% of features                              | **PARTIAL** | **PARTIAL** | A DEMO MODE banner now ships (`app/dashboard/DashboardShell.tsx:837`), but it is gated on one hardcoded account (`:431`, `demo@restoreassist.app`). Still no "Load sample data" affordance for a normal account; `components/initial-data-entry/UseCaseModal.tsx:53` fills a **form**, not an organisation.                                   |
| 4   | Privacy + ToS + retention align with shipped code                           | **PASS**    | **PASS**    | Unchanged. `app/privacy/page.tsx` and `app/terms/page.tsx` both present.                                                                                                                                                                                                                                                                     |
| 5   | Mobile install flow smooth (iOS + Android)                                  | **PARTIAL** | **PARTIAL** | `components/pwa-install-prompt.tsx` (RA-1462) ships and is wired at `app/layout.tsx:176`. It is Chrome / Edge / Android only — the component documents that no iOS banner is shown **by design**, because Safari never fires `beforeinstallprompt`. `ios/` and `android/` Capacitor shells exist and `docs/MOBILE_RELEASE_RUNBOOK.md` §5 uploads to TestFlight and the Play internal track, so there is still no public store listing: no store URL appears anywhere in `app/`, `components/` or `lib/`. |
| 6   | Support channel visible + responsive                                        | **PASS**    | **PASS**    | Unchanged — `app/support/page.tsx:32` promises one business day, Mon–Fri AEST. Note `docs/SUPPORT_SLA.md` now states explicitly that P1 is **not** 24/7 cover, so a green release gate is not misread as one.                                                                                                                                 |
| 7   | Incident/status page live                                                   | **FAIL**    | **PASS**    | `app/status/page.tsx` exists.                                                                                                                                                                                                                                                                                                                |
| 8   | Billing disputes have in-app resolution path                                | **PARTIAL** | **PARTIAL** | Unchanged. `charge.refunded` is reconciled **inbound** (`app/api/webhooks/stripe/__tests__/charge-refunded.test.ts`), so a refund issued in Stripe lands correctly — but a grep of `app/dashboard/subscription`, `app/billing` and `components/billing` finds no buyer-facing refund or dispute affordance. Today the path is still email support. |

**Round 6: 4 PASS, 4 PARTIAL, 0 FAIL.** Round 5 was **2 PASS, 4 PARTIAL,
2 FAIL** — its own summary line says "3 PASS, 4 PARTIAL, 2 FAIL", which sums to
nine for eight criteria. The PASS count was the one that was wrong; the AMBER
verdict it drove was not affected.

Every remaining PARTIAL is a round-5 *nice-to-have* (items 5, 6, 7 and 9 on
that list), not a blocker. None of them is a reason to hold a pilot.

---

## Round-5 launch blockers — status

1. **Pricing page: GST / AUD / tax-invoice copy.** **FIXED.**
2. **Status / incident page.** **FIXED** — `app/status/page.tsx`.
3. **Trust signals on marketing.** **CODE SHIPPED, DATA NOT SET.** Both footers
   render the ABN and address conditionally (`components/landing/Footer.tsx:128`
   and `:129`, `components/landing/home/LandingFooter.tsx:95`), and `security@`
   renders unconditionally because `lib/brand.ts:35` carries a default. The ABN
   and address do **not**: `lib/brand.ts:26` and `:31` fall back to `""`, so
   until `NEXT_PUBLIC_COMPANY_ABN` and `NEXT_PUBLIC_COMPANY_ADDRESS` are set in
   Vercel the footer shows neither. `docs/compliance/LAUNCH-CHECKLIST.md:29` is
   the box for exactly this and is still unticked. Round 5 also asked for a
   security *page*; a `security@` footer link ships instead, and there is no
   `app/security/page.tsx`.
4. **Pricing drift lint / source-of-truth test.** **FIXED THIS ROUND** — below.

---

## Blocker 4, and the drift it was already hiding

A pricing-drift guard did exist: `lib/__tests__/pricing-integrity.test.ts`
(RA-1585). It guards `PRICING_CONFIG`'s own invariants — AUD, non-zero amounts,
a single `$99` monthly SKU, no retired yearly price — and checks that the
**trial** numbers are interpolated into copy rather than typed.

Neither of those catches a price typed straight into buyer-facing copy, which is
what blocker 4 asked about. The surface it named,
`components/landing/HeroSection.tsx:319`, no longer exists; the drift moved
elsewhere, and it was live:

> `components/landing/home/homeContent.ts` told buyers **"Add-ons are $11/month
> each."** `lib/billing/floorplan-underlay-addon.ts:38` charges **$9.95**, and
> the pricing page's own `components/pricing/TierComparison.tsx:231` already
> said **"from $9.95 per month each"**. Two live surfaces, two different numbers
> for the same thing.

The file's own doc comment had drifted with it: it described "six $11 flat
unlocks" when the registry now holds nine recurring add-ons, eight at $11 and
one at $9.95.

**The guard.** A new `describe` block in the same file — it claims to be "the
single source of truth for those invariants", so it should be — scans the
surfaces that quote a price to a buyer and fails on any typed `$N`. Comments are
stripped first, so the doc comments that record *why* a number is what it is
(including homeContent's "NEVER claim flat, no-per-seat, or whole-team pricing
here" warning) stay readable. `$0` is exempt: the free tier's amount is
structurally zero and cannot drift. A second assertion checks the **rendered**
`HOME.stance` string against the SSOT, so the guard cannot be satisfied by
deleting the claim instead of correcting it.

Four surfaces failed it:

| Surface | Was | Why it matters |
| --- | --- | --- |
| `components/landing/home/homeContent.ts:67` | `$99`, `$1.98`, `$11` | The `$11` was false. Now derived; the sentence reads "Add-ons from $9.95 a month each", matching TierComparison. |
| `app/billing/upgrade/CheckoutCTA.tsx:57` | `$99` | The last number a buyer reads before Stripe charges them, on the hard-paywall screen. |
| `app/pricing/layout.tsx:18` | `$99` | A half-derived sentence: the allowance beside it was already `${allowance}`. This is the copy that ends up in search results. |
| `app/features/page.tsx:360` | `$20` | Correct today, but unguarded against the pack price changing. |

All four now interpolate. Apart from the add-on claim, the rendered copy is
byte-identical to what shipped before — the plan price, allowance and per-report
rate all resolve to the same `$99` / `50` / `$1.98`, and the paywall button
still reads "Subscribe — $99/month" because `PRICING_CONFIG` carries
`interval: "month"`.

---

## Verification — exact commands

The positive control was run **first, against the unfixed code**, because a
guard that has never been observed to fail has not been shown to guard
anything:

```
npx vitest run --config config/vitest.config.js lib/__tests__/pricing-integrity.test.ts
# BEFORE the fix: 5 failed | 17 passed (22)
#   - homeContent.ts hardcodes $99, $1.98, $11
#   - CheckoutCTA.tsx hardcodes $99
#   - pricing/layout.tsx hardcodes $99
#   - features/page.tsx hardcodes $20
#   - home copy must quote the real cheapest add-on price ($9.95)
# AFTER the fix:  22 passed (22)
```

All 17 pre-existing assertions passed in both runs, so the new block did not
weaken them.

```
npx vitest run --config config/vitest.config.js \
    app/__tests__/pricing-crm-copy.test.tsx \
    lib/__tests__/plan-allowance-single-source.test.ts \
    lib/__tests__/one-crm-copy-grep-proof.test.ts \
    lib/__tests__/pricing-integrity.test.ts \
    components/pricing/__tests__/
# 7 files / 133 tests pass

npm run type-check                  # exit 0
npx eslint -c config/eslint.config.mjs <the five changed files>   # clean
node scripts/check-au-english.mjs   # passed, 58 files scanned
node scripts/check-no-emoji.mjs     # OK
node scripts/check-encoding.mjs     # OK
```

The rendered stance copy was read back out of the module rather than inferred
from the diff, to confirm what a visitor actually sees.

**Not checked.** No browser. `restoreassist.app` and Vercel previews are
unreachable from this environment (egress, not downtime), so the pricing page,
the paywall button and the marketing home have not been viewed rendered. The
`$9.95` correction is asserted at the string level, not visually.

**Prettier is not a gate here.** It is neither a dependency in `package.json`
nor invoked by any workflow in `.github/workflows/`; the style gate is ESLint
(`--max-warnings 851`), which is clean on all five changed files. An
npx-downloaded Prettier with default settings flags three of them, and would
also reformat lines this change never touched, so it was not run.

---

## Still open

1. **Set `NEXT_PUBLIC_COMPANY_ABN` and `NEXT_PUBLIC_COMPANY_ADDRESS`** in Vercel
   and tick `docs/compliance/LAUNCH-CHECKLIST.md:29`. Until then blocker 3 is
   not closed, however complete the code path is. Owner action.
2. **Dispatch `release-gate.yml` against `main`** to confirm the projected
   45/85. That number is arithmetic from #2067, never a measurement.
3. **Decide whether `app/security/page.tsx` is wanted** or whether the
   `security@` footer link settles blocker 3's third limb.
4. **Add a duration to the activation funnel** if "< 3 min" is to be a claim
   rather than an aspiration. The events are in place; only the arithmetic is
   missing.
5. **Criterion 3 needs a normal-account path to sample data** before it clears.
   The DEMO banner only fires for `demo@restoreassist.app`.
6. **Criterion 5 clears when there is a public store listing**, not before. The
   upload pipeline reaches TestFlight and the Play internal track only.
7. **Criterion 8 is a product decision**, not a gap: email support for refunds
   may be acceptable for early GA, as round 5 judged. Worth confirming rather
   than carrying as a PARTIAL forever.
