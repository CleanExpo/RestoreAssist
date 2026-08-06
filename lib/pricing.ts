export const PRICING_CONFIG = {
  /**
   * Public marketing free tier — SSOT for trial copy.
   *
   * This is a TIME-LIMITED free trial, not a "free forever" tier. The signup
   * page, the public pricing page, and the welcome email all source their
   * numbers from here so the marketing copy can never drift from what the
   * registration endpoint actually grants.
   *
   * Every signup path sources its grant from here so a trial is identical
   * regardless of how the user signs up:
   *   - app/api/auth/register/route.ts            (email + password)
   *   - app/api/auth/google-signin/route.ts       (Google OAuth, web)
   *   - app/api/auth/native-token-exchange/route.ts (Apple/Google, native iOS)
   *   - app/api/user/profile/route.ts             (profile auto-create fallback)
   * Each grants `creditsRemaining: trialReportCredits`,
   * `quickFillCreditsRemaining: trialQuickFillCredits`, and
   * `trialEndsAt = now + trialDays days`. Keep these values in lock-step with
   * those grants (asserted by lib/__tests__/pricing-integrity.test.ts).
   */
  free: {
    name: "Free Trial",
    displayName: "Free Trial",
    amount: 0,
    currency: "AUD",
    /** Length of the free trial in days. Mirrors `trialEndsAt` in register/route.ts. */
    trialDays: 15,
    /** Report credits granted on signup. Mirrors `creditsRemaining` in register/route.ts. */
    trialReportCredits: 50,
    /** Quick Fill credits granted on signup. Mirrors `quickFillCreditsRemaining`. */
    trialQuickFillCredits: 30,
    /** @deprecated Use `trialReportCredits`. Kept so display cards reading `reportLimit` still work. */
    reportLimit: 50,
    description:
      "Try Restore Assist free for 15 days — 50 inspection report credits with basic features. No credit card required.",
    features: [
      "15-day free trial",
      "50 inspection report credits",
      // NOT "AI-powered". The shipped Quick Fill copies hardcoded scenario
      // data; `generateQuickFillData` (lib/deepseek-api.ts:74) has zero callers
      // anywhere in the repository, so there is no AI in this path to sell.
      "30 Quick Fill credits (form auto-fill)",
      "Basic report type",
      // NOT "IICRC S500 compliant". lib/iicrc-inclusion-check.ts states the
      // hard rule that this product never asserts "complies", "certifies",
      // "meets [the standard]" or "required by law", enforced by
      // lib/__tests__/iicrc-inclusion-check.test.ts, and full S500 clause
      // ingestion is blocked pending legal clearance. Alignment is the only
      // claim the build supports: the section INDEX ships
      // (lib/standards/s500-sections.ts), the licensed wording does not.
      // Wording matches app/features/page.tsx so the two surfaces agree.
      "Reports structured on IICRC S500:2021 sections",
      "PDF & Excel export",
      "Email support",
    ],
  },

  // Stripe Price IDs — the single source-of-truth catalog is the one $99
  // Monthly Plan (RA-6929/6930/6931 billing-correctness collapse; C1/C3).
  // The Yearly $1188 SKU was retired: a fixed server allowlist rejects any
  // priceId not listed here, so there is no client-set or dynamic price path.
  prices: {
    monthly: process.env.STRIPE_PRICE_MONTHLY || "MONTHLY_PLAN",
  },

  // Pricing Details (for display) — one catalog, one card. Every checkout
  // entry point (public pricing, dashboard pricing, the expired-trial
  // hard-paywall) sells from this single $99 Monthly Plan.
  pricing: {
    monthly: {
      name: "Monthly Plan",
      displayName: "Monthly",
      amount: 99.0,
      currency: "AUD",
      interval: "month",
      reportLimit: 50,
      popular: true,
      signupBonus: 10, // Additional 10 reports on first month signup
      features: [
        "50 inspection reports per month",
        "First month signup bonus: +10 reports",
        "PDF & Excel export",
        "Email support",
        // NOT "All integrations". Three of the seven recurring add-ons in
        // lib/billing/addon-registry.ts ARE integrations — Online Bookkeeping
        // Connection, Service CRM Connection and Payments Collection — each a
        // separate monthly subscription on top of this plan. Promising "all
        // integrations" here promised things that cost extra. Their real
        // prices are rendered on the pricing page by CostDisclosure, read
        // straight from the registry.
        "Integrations available as separately-priced add-ons",
        // See the note on the free tier's equivalent bullet.
        "Reports structured on IICRC S500:2021 sections",
        // "Priority processing" was REMOVED because it does not exist. It is
        // not gated-but-unenforced like the report-type bullets — there is no
        // implementation of any kind. Searched app/, lib/ and components/ for
        // "priority": the only hits are the sitemap's SEO weights in
        // app/sitemap.ts. No queue, no priority column, no ordering logic, and
        // the generation-route rate limits are identical for trial and paid.
        // A positive control on the same search (quickFillCredits, 19 hits)
        // confirms the search itself works.
        //
        // This is the worst class of claim on a pricing page: not a capability
        // the buyer can obtain another way, but one that was never built and is
        // being charged for. Build it before selling it.
      ],
    },
  },

  // Add-ons for additional reports
  addons: {
    pack8: {
      name: "8 Additional Reports",
      displayName: "8 Reports Pack",
      amount: 20.0,
      currency: "AUD",
      reportLimit: 8,
      description: "Add 8 additional reports to your monthly limit",
    },
    pack25: {
      name: "25 Additional Reports",
      displayName: "25 Reports Pack",
      amount: 50.0,
      currency: "AUD",
      reportLimit: 25,
      description: "Add 25 additional reports to your monthly limit",
      popular: true,
    },
    pack60: {
      name: "60 Additional Reports",
      displayName: "60 Reports Pack",
      amount: 100.0,
      currency: "AUD",
      reportLimit: 60,
      description: "Add 60 additional reports to your monthly limit",
      badge: "Best Value",
    },
  },
} as const;

export type PricingPlan = keyof typeof PRICING_CONFIG.pricing;
export type PricingDetails = (typeof PRICING_CONFIG.pricing)[PricingPlan];
export type AddonPack = keyof typeof PRICING_CONFIG.addons;
export type AddonDetails = (typeof PRICING_CONFIG.addons)[AddonPack];
