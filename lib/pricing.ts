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
      "30 Quick Fill credits (AI-powered form auto-fill)",
      "Basic report type",
      "IICRC S500 compliant reports",
      "PDF & Excel export",
      "Email support",
    ],
  },

  // Stripe Price IDs - Use environment variables or fallback to dynamic creation
  prices: {
    monthly: process.env.STRIPE_PRICE_MONTHLY || "MONTHLY_PLAN",
    yearly: process.env.STRIPE_PRICE_YEARLY || "YEARLY_PLAN",
  },

  // Pricing Details (for display)
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
        "All integrations",
        "IICRC S500 compliant",
        "Priority processing",
      ],
    },
    yearly: {
      name: "Yearly Plan",
      displayName: "Yearly",
      amount: 1188.0,
      currency: "AUD",
      interval: "year",
      reportLimit: 70, // Reports per month
      monthlyEquivalent: 99,
      popular: false,
      badge: "Best Value",
      signupBonus: 10, // Additional 10 reports on first month signup
      features: [
        "70 inspection reports per month",
        "First month signup bonus: +10 reports",
        "PDF & Excel export",
        "Priority support",
        "All integrations",
        "IICRC S500 compliant",
        "Priority processing",
        "Best value - More reports per month",
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
