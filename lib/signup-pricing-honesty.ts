/**
 * RA-7549 — signup / pricing / post-signup honesty.
 *
 * D-022 (RA-6801) already lets a funded trial generate a Basic report
 * without a workspace BYOK key. This module is the copy SSOT so the
 * public signup page, the public pricing page, and the post-signup CTA
 * cannot drift back to "an API key is required to operate".
 *
 * Functional key wiring stays in lib/ai/platform-trial-credential.ts.
 * Do not re-derive eligibility here.
 *
 * Stripe-path addendum (same class as RA-7541 AUD pin): public CTAs may
 * only start the free trial or name the one SKU Checkout sells — the
 * $99 AUD monthly plan. Report packs, yearly, and USD presentment fail
 * closed. Checkout session wiring stays in lib/billing/checkout-presentation.ts.
 */

import { PRICING_CONFIG } from "@/lib/pricing";
import { catalogMonthlyCurrency } from "@/lib/billing/checkout-presentation";

export const BASIC_WITHOUT_KEY_HEADLINE =
  "Basic reports work without an API key";

export const BASIC_WITHOUT_KEY_BODY =
  "Create a Basic report on the free trial without pasting an Anthropic or OpenAI key. Provider charges apply only when you add your own key — they bill you directly, at their published rates, and we take no share.";

export const BASIC_REPORT_CTA_LABEL = "Create Basic report without API key";

/** Working Basic-report start. Trial users reach the form without a BYOK wall. */
export const BASIC_REPORT_PATH = "/dashboard/reports/new";

/** Short pricing-alert title — same claim as the headline, fewer words. */
export const PRICING_KEY_ALERT_TITLE = BASIC_WITHOUT_KEY_HEADLINE;

export const PRICING_KEY_ALERT_BODY = BASIC_WITHOUT_KEY_BODY;

export const SIGNUP_KEY_NOTE_TITLE = BASIC_WITHOUT_KEY_HEADLINE;

export const SIGNUP_KEY_NOTE_BODY = BASIC_WITHOUT_KEY_BODY;

/** Only plan `POST /api/create-checkout-session` will sell. */
export const SELLABLE_CHECKOUT_PLANS = ["monthly"] as const;

export const PUBLIC_TRIAL_PATH = "/signup";

export const PUBLIC_FREE_CTA_LABEL = "Get Started Free";

export function publicPaidPlanCtaLabel(): string {
  const { amount } = PRICING_CONFIG.pricing.monthly;
  return `Start free trial — $${amount} ${catalogMonthlyCurrency().toUpperCase()}/month after`;
}

/** Packs are sold after subscribe, not at signup. Not a purchase link. */
export function publicPackAfterSubscribeNote(): string {
  const { amount } = PRICING_CONFIG.pricing.monthly;
  return `Available after you subscribe to the $${amount} ${catalogMonthlyCurrency().toUpperCase()} monthly plan`;
}

export function afterTrialPlanNote(): string {
  const { amount } = PRICING_CONFIG.pricing.monthly;
  return `After the trial, the paid plan is $${amount} ${catalogMonthlyCurrency().toUpperCase()} per month, GST inclusive.`;
}

export type PublicPricingCtaKind =
  | "trial"
  | "monthly"
  | "pack"
  | "yearly"
  | "unknown";

export type PublicPricingCtaCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Fail closed when a public CTA names a plan Stripe will not sell, or
 * a currency Checkout will not present (RA-7541 USD ~$73.85 walk).
 */
export function assertPublicPricingCta(cta: {
  kind: PublicPricingCtaKind;
  href?: string | null;
  label: string;
}): PublicPricingCtaCheck {
  if (/\busd\b/i.test(cta.label) || /73\.85/.test(cta.label)) {
    return {
      ok: false,
      reason: "USD presentment — Stripe Checkout sells the catalog in AUD",
    };
  }
  if (cta.kind === "yearly" || /yearly/i.test(cta.label)) {
    return {
      ok: false,
      reason: "Yearly is not a sellable Stripe plan",
    };
  }
  if (cta.kind === "pack") {
    if (cta.href) {
      return {
        ok: false,
        reason:
          "Report packs are not sold at signup; Stripe checkout only sells monthly",
      };
    }
    return { ok: true };
  }
  if (cta.kind === "monthly") {
    if (cta.href !== PUBLIC_TRIAL_PATH) {
      return {
        ok: false,
        reason: "Public monthly CTA must start the trial at /signup",
      };
    }
    if (!/AUD/i.test(cta.label)) {
      return {
        ok: false,
        reason: "Monthly CTA must name AUD presentment",
      };
    }
    return { ok: true };
  }
  if (cta.kind === "trial") {
    if (cta.href !== PUBLIC_TRIAL_PATH) {
      return {
        ok: false,
        reason: "Trial CTA must land on /signup",
      };
    }
    return { ok: true };
  }
  return { ok: false, reason: `Unknown CTA kind: ${cta.kind}` };
}
