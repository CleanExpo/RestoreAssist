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

/** Setup wizard AI-key card — optional, not a hard wall (RA-7416). */
export const SETUP_AI_KEY_OPTIONAL_TITLE = "Your own AI key (optional)";

export const SETUP_AI_KEY_OPTIONAL_HINT =
  "Basic reports on the trial work without a key. Add Anthropic, OpenAI or OpenRouter anytime as an optional upgrade — you pay that provider directly.";

/** Paid / expired — BYOK is the required action. */
export const SETUP_AI_KEY_REQUIRED_TITLE = "Add your AI key";

/**
 * Paid / expired workspace copy. Do not say the product cannot operate —
 * Basic on a funded trial still works without BYOK.
 */
export const PAID_AI_KEY_REQUIRED_BODY =
  "After the trial, AI report generation uses your own Anthropic or OpenAI key. You pay the provider directly, at cost. Add it in Settings → AI Providers.";

/**
 * RA-7569 — funded trial whose platform key is missing. Do not ask the
 * owner to add a key: the platform should supply it. Say that plainly,
 * and let setup continue (Skip is not the escape hatch).
 */
export const PLATFORM_KEY_MISSING_TITLE =
  "Trial report generation is not ready";

export const PLATFORM_KEY_MISSING_BODY =
  "Basic reports on the trial should work without your own key. The platform AI key that should power them is not configured, so report generation will fail until that is fixed. You can continue setup. After the trial, AI report generation uses your own Anthropic or OpenAI key.";

/**
 * RA-7600 — report-gen 402 when the platform should have supplied the key.
 * Do not say "add your key": that rewrite is the residual #2229 called out.
 */
export const REPORT_GEN_PLATFORM_NOT_READY_BODY =
  "Trial report generation is not ready. Basic reports on the trial should work without your own key. The platform AI key that should power them is not configured. This is a platform issue. Report generation cannot run until that is fixed.";

/** RA-7600 — report-gen 402 when paid / expired / zero-credit must bring BYOK. */
export function reportGenByokRequiredBody(provider: string): string {
  return `No active ${provider} API key configured for this workspace. Add your own key in Workspace Settings -> AI Providers.`;
}

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

export type PublicPricingCta = {
  kind: PublicPricingCtaKind;
  href?: string | null;
  label: string;
};

/**
 * Purchase-shaped copy on a pack is a silent wrong-plan CTA even with no
 * href (Critic: pack + null href + "Add to Plan" was ok:true).
 * Do not match the informational "after you subscribe" note.
 */
const PACK_PURCHASE_SHAPED =
  /add to plan|add to cart|buy now|^subscribe\b|^checkout\b/i;

/**
 * Fail closed when a public CTA names a plan Stripe will not sell, or
 * a currency Checkout will not present (RA-7541 USD ~$73.85 walk).
 */
export function assertPublicPricingCta(
  cta: PublicPricingCta,
): PublicPricingCtaCheck {
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
    if (PACK_PURCHASE_SHAPED.test(cta.label)) {
      return {
        ok: false,
        reason:
          "Pack copy must not be a purchase CTA (Add to Plan / buy / checkout)",
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

/**
 * RA-7541-class runtime pin. Checkout 400s a USD Price; the public pricing
 * page must throw before a pack / Add to Plan / USD CTA can paint.
 */
export function pinPublicPricingCta(cta: PublicPricingCta): PublicPricingCta {
  const check = assertPublicPricingCta(cta);
  if (!check.ok) {
    throw new Error(`RA-7549 public pricing CTA fail-closed: ${check.reason}`);
  }
  return cta;
}

/** Import-time pins — a drifted SSOT label crashes the pricing module. */
export const PINNED_PUBLIC_TRIAL_CTA = pinPublicPricingCta({
  kind: "trial",
  href: PUBLIC_TRIAL_PATH,
  label: PUBLIC_FREE_CTA_LABEL,
});

export const PINNED_PUBLIC_MONTHLY_CTA = pinPublicPricingCta({
  kind: "monthly",
  href: PUBLIC_TRIAL_PATH,
  label: publicPaidPlanCtaLabel(),
});

export const PINNED_PUBLIC_PACK_NOTE = pinPublicPricingCta({
  kind: "pack",
  href: null,
  label: publicPackAfterSubscribeNote(),
});
