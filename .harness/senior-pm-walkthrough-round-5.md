# Senior PM Walkthrough — Round 5 (Sellability)

**Date:** 2026-04-22
**Rubric:** Is the product sellable?
**Verdict:** **AMBER** — ship to pilot/design-partners with known limitations; do not open public self-serve until blockers clear.

---

## Sellability scorecard

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Pricing page reads correctly (GST-inclusive, tax invoice promise, no drift) | **FAIL** | `app/pricing/page.tsx` has no GST, ABN, "tax invoice", "AUD", or "incl. GST" copy. `lib/pricing.ts` sets `currency: "AUD"` but the page never says AUD to the buyer. No monthly/annual toggle — each plan is a separate card. |
| 2 | Onboarding time-to-value < 3 min (measurable activation events) | **PARTIAL** | `app/onboarding/account-type` + `app/dashboard/onboarding` + `FirstRunChecklist` + `/api/onboarding/first-run` exist. No wired activation event telemetry visible. Needs observed time-to-first-report measurement. |
| 3 | Demo mode / sample data covers 80% of features | **PARTIAL** | `prisma/seed-demo.ts`, `seed-demo-inspection.ts`, `api/admin/seed-demo`, and `is_sample_demo_data` migration exist. No user-facing "Load sample data" button in dashboard; only admin surface. No DEMO badge component. |
| 4 | Privacy + ToS + retention align with shipped code | **PASS** | `/privacy` has a retention section (line 170+), `/terms` exists, support FAQ references 7-year record retention + 30-day deletion SLA consistent with privacy copy. |
| 5 | Mobile install flow smooth (iOS + Android) | **PARTIAL** | `app/manifest.ts` shipped with icons + lang `en-AU`. No install prompt component, no iOS "Add to Home Screen" helper, support FAQ points to App/Play stores but no native apps are actually listed. |
| 6 | Support channel visible + responsive | **PASS** | `/support` page with `support@restoreassist.app`, response SLA (1 business day, Mon-Fri AEST), FAQ, password/cancel/mobile/sync/deletion topics. |
| 7 | Incident/status page live | **FAIL** | No `/status`, no embed, no Statuspage/Atlassian link. Zero incident surface. |
| 8 | Billing disputes have in-app resolution path | **PARTIAL** | `CancelSubscriptionDialog` + `/api/cancel-subscription` shipped with reason capture (RA-1243). No refund request form, no "dispute a charge" affordance. `/api/inspections/[id]/dispute-pack` exists but is for claim disputes, not billing. |

Overall: **3 PASS, 4 PARTIAL, 2 FAIL → AMBER.**

---

## Launch blockers (MUST ship before GA)

1. **Pricing page: add GST / AUD / tax-invoice copy.** AU consumer law expects clear price disclosure inclusive-or-exclusive of GST + a tax-invoice promise. Without it, B2B buyers reject the purchase.
2. **Status / incident page.** Even a one-pager `/status` with "All systems operational" placeholder + incidents list is enough for procurement to tick the box.
3. **Trust signals on marketing.** No ABN, no business address, no security page. Add footer block with ABN, registered address, security@ contact.
4. **Pricing drift lint / source-of-truth test.** `components/landing/HeroSection.tsx:319` hardcodes `$8,750 AUD` and `DamageTypesSection.tsx` has ranges. Low risk today (not product price) but add CI guard that no hardcoded `$N` in non-pricing surfaces references subscription tiers.

## Launch nice-to-haves (defer post-GA)

5. User-facing "Load sample data" button in dashboard (admin surface exists).
6. DEMO badge component and demo-mode route.
7. Refund request form (today = email support, acceptable for early GA).
8. PWA install prompt helper + iOS Add-to-Home-Screen coach mark.
9. Activation-event telemetry wired for time-to-first-report measurement.
10. Monthly/annual toggle on pricing (low priority — the two tiers are explicit).

## Trust / pricing / demo / legal findings

- **Trust:** no ABN anywhere in marketing, no security page, no SOC2/ISO claim (fine — don't claim what you don't have), no testimonials/logos on landing — the hero promises "AI-powered" without social proof.
- **Pricing:** plans = Free / Monthly / Yearly, AUD-denominated in code but not labelled AUD on page. "Start Free Trial" CTA on paid cards + "Free Forever" on Free plan — trial-vs-free mental model is muddy.
- **Demo:** seed scripts + `is_sample_demo_data` flag shipped, but nothing in user UI to trigger. Admin-only via `/api/admin/seed-demo`.
- **Legal:** privacy/terms/retention coherent with code. Signup gates on ToS+Privacy checkbox (RA-1255). Deletion path documented; email-based.

---

## Round 5 ticket summary

6 tickets filed below with `[PM Round 5]` prefix. All autonomous-shippable (copy/markup changes + one new route).
