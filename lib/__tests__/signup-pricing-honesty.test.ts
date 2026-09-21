/**
 * RA-7549 — signup / pricing honesty.
 *
 * A stranger must see that Basic works without pasting an API key, and
 * when provider charges apply. The post-signup CTA must name that path
 * and land on `/dashboard/reports/new`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASIC_REPORT_CTA_LABEL,
  BASIC_REPORT_PATH,
  BASIC_WITHOUT_KEY_BODY,
  BASIC_WITHOUT_KEY_HEADLINE,
  PAID_AI_KEY_REQUIRED_BODY,
  PUBLIC_FREE_CTA_LABEL,
  PUBLIC_TRIAL_PATH,
  SETUP_AI_KEY_OPTIONAL_HINT,
  SETUP_AI_KEY_OPTIONAL_TITLE,
  SETUP_AI_KEY_REQUIRED_TITLE,
  PLATFORM_KEY_MISSING_BODY,
  PLATFORM_KEY_MISSING_TITLE,
  REPORT_GEN_PLATFORM_NOT_READY_BODY,
  reportGenByokRequiredBody,
  SELLABLE_CHECKOUT_PLANS,
  afterTrialPlanNote,
  assertPublicPricingCta,
  pinPublicPricingCta,
  publicPackAfterSubscribeNote,
  publicPaidPlanCtaLabel,
} from "@/lib/signup-pricing-honesty";
import { catalogMonthlyCurrency } from "@/lib/billing/checkout-presentation";

const repoRoot = join(__dirname, "..", "..");
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const DISHONEST = [
  /API key is required to operate/i,
  /You will need an Anthropic or OpenAI API key to generate/i,
  /Without a key configured, report generation will be unavailable/i,
  /Report generation on every plan[^.]*runs on your own/i,
  /Bring your own AI key/i,
];

describe("RA-7549 signup/pricing honesty SSOT", () => {
  it("names the Basic-without-key claim and the working report path", () => {
    expect(BASIC_WITHOUT_KEY_HEADLINE).toMatch(/without an API key/i);
    expect(BASIC_WITHOUT_KEY_BODY).toMatch(/without pasting/i);
    expect(BASIC_WITHOUT_KEY_BODY).toMatch(/Provider charges apply only when/i);
    expect(BASIC_REPORT_CTA_LABEL).toBe("Create Basic report without API key");
    expect(BASIC_REPORT_PATH).toBe("/dashboard/reports/new");
    expect(SETUP_AI_KEY_OPTIONAL_TITLE).toMatch(/optional/i);
    expect(SETUP_AI_KEY_OPTIONAL_TITLE).not.toMatch(/add your/i);
    expect(SETUP_AI_KEY_REQUIRED_TITLE).toMatch(/add your/i);
    expect(SETUP_AI_KEY_OPTIONAL_HINT).toMatch(/optional upgrade/i);
    expect(SETUP_AI_KEY_OPTIONAL_HINT).not.toMatch(/required to operate/i);
    expect(PAID_AI_KEY_REQUIRED_BODY).toMatch(/after the trial/i);
    expect(PAID_AI_KEY_REQUIRED_BODY).not.toMatch(/required to operate/i);
    expect(PLATFORM_KEY_MISSING_TITLE).toMatch(/not ready/i);
    expect(PLATFORM_KEY_MISSING_TITLE).not.toMatch(/add your/i);
    expect(PLATFORM_KEY_MISSING_BODY).toMatch(/platform AI key/i);
    expect(PLATFORM_KEY_MISSING_BODY).toMatch(/continue setup/i);
    expect(PLATFORM_KEY_MISSING_BODY).not.toMatch(/add your/i);
    expect(REPORT_GEN_PLATFORM_NOT_READY_BODY).toMatch(/not ready/i);
    expect(REPORT_GEN_PLATFORM_NOT_READY_BODY).toMatch(/platform AI key/i);
    expect(REPORT_GEN_PLATFORM_NOT_READY_BODY).not.toMatch(/add your/i);
    expect(reportGenByokRequiredBody("ANTHROPIC")).toMatch(/add your own key/i);
    expect(reportGenByokRequiredBody("ANTHROPIC")).toMatch(/ANTHROPIC/);
  });

  it("signup and pricing pages source the claim from the SSOT", () => {
    const signup = readSrc("app/signup/page.tsx");
    expect(signup).toContain("SIGNUP_KEY_NOTE_TITLE");
    expect(signup).toContain("SIGNUP_KEY_NOTE_BODY");
    expect(signup).toContain("@/lib/signup-pricing-honesty");

    const pricing = readSrc("app/pricing/page.tsx");
    expect(pricing).toContain("PRICING_KEY_ALERT_TITLE");
    expect(pricing).toContain("PRICING_KEY_ALERT_BODY");
    expect(pricing).toContain("@/lib/signup-pricing-honesty");

    const aiKeyCard = readSrc("components/setup/AiKeyCard.tsx");
    expect(aiKeyCard).toContain("SETUP_AI_KEY_OPTIONAL_HINT");
    expect(aiKeyCard).toContain("SETUP_AI_KEY_OPTIONAL_TITLE");
    expect(aiKeyCard).toContain("@/lib/signup-pricing-honesty");

    const setupShell = readSrc("components/setup/SetupShell.tsx");
    expect(setupShell).toContain("SETUP_AI_KEY_OPTIONAL_TITLE");
    expect(setupShell).toContain("SETUP_AI_KEY_REQUIRED_TITLE");

    const onboardingStep = readSrc("lib/onboarding/ai-provider-step.ts");
    expect(onboardingStep).toContain("PAID_AI_KEY_REQUIRED_BODY");
    expect(onboardingStep).toContain("PLATFORM_KEY_MISSING_TITLE");
    expect(onboardingStep).toContain("PLATFORM_KEY_MISSING_BODY");

    const resolver = readSrc("lib/ai/resolve-workspace-ai-key.ts");
    expect(resolver).toContain("REPORT_GEN_PLATFORM_NOT_READY_BODY");
    expect(resolver).toContain("reportGenByokRequiredBody");
    expect(resolver).toContain("describePlatformTrialCoverage");
  });

  it("signup, pricing, and post-signup surfaces drop the BYOK-required lie", () => {
    for (const rel of [
      "app/signup/page.tsx",
      "app/pricing/page.tsx",
      "components/pricing/CostDisclosure.tsx",
      "lib/email.ts",
      "app/dashboard/onboarding/OnboardingClient.tsx",
      "app/dashboard/page.tsx",
      "components/setup/AiKeyCard.tsx",
      "components/setup/WelcomeOverview.tsx",
      "lib/onboarding/ai-provider-step.ts",
      "lib/setup/wizard-steps.ts",
    ]) {
      const src = readSrc(rel);
      for (const pattern of DISHONEST) {
        expect(src, `${rel} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("post-signup CTA component links the labelled action to the Basic path", () => {
    const src = readSrc("components/onboarding/BasicReportWithoutKeyCta.tsx");
    expect(src).toContain("BASIC_REPORT_CTA_LABEL");
    expect(src).toContain("BASIC_REPORT_PATH");
    expect(src).toContain("href={BASIC_REPORT_PATH}");
  });
});

describe("RA-7549 Stripe-path CTA honesty (RA-7541 class)", () => {
  it("Checkout sells only the AUD monthly plan", () => {
    expect(SELLABLE_CHECKOUT_PLANS).toEqual(["monthly"]);
    expect(catalogMonthlyCurrency()).toBe("aud");
    expect(publicPaidPlanCtaLabel()).toMatch(/\$99 AUD\/month/);
    expect(afterTrialPlanNote()).toMatch(/\$99 AUD/);
    expect(publicPackAfterSubscribeNote()).toMatch(/\$99 AUD monthly plan/);
  });

  it("accepts the live trial and monthly CTAs", () => {
    expect(
      assertPublicPricingCta({
        kind: "trial",
        href: PUBLIC_TRIAL_PATH,
        label: PUBLIC_FREE_CTA_LABEL,
      }),
    ).toEqual({ ok: true });
    expect(
      assertPublicPricingCta({
        kind: "monthly",
        href: PUBLIC_TRIAL_PATH,
        label: publicPaidPlanCtaLabel(),
      }),
    ).toEqual({ ok: true });
    expect(
      assertPublicPricingCta({
        kind: "pack",
        href: null,
        label: publicPackAfterSubscribeNote(),
      }),
    ).toEqual({ ok: true });
  });

  it("rejects USD presentment, yearly, and pack-to-signup purchase CTAs", () => {
    const usd = assertPublicPricingCta({
      kind: "monthly",
      href: PUBLIC_TRIAL_PATH,
      label: "Subscribe — $73.85 USD",
    });
    expect(usd.ok).toBe(false);
    if (usd.ok) throw new Error("expected rejection");
    expect(usd.reason).toMatch(/USD/i);

    const yearly = assertPublicPricingCta({
      kind: "yearly",
      href: PUBLIC_TRIAL_PATH,
      label: "Start yearly plan",
    });
    expect(yearly.ok).toBe(false);

    const packLinked = assertPublicPricingCta({
      kind: "pack",
      href: "/signup",
      label: "Add to Plan",
    });
    expect(packLinked.ok).toBe(false);
    if (packLinked.ok) throw new Error("expected rejection");
    expect(packLinked.reason).toMatch(/monthly/i);

    const packSoft = assertPublicPricingCta({
      kind: "pack",
      href: null,
      label: "Add to Plan",
    });
    expect(packSoft.ok).toBe(false);
    if (packSoft.ok) throw new Error("expected rejection");
    expect(packSoft.reason).toMatch(/purchase CTA/i);

    expect(() =>
      pinPublicPricingCta({
        kind: "pack",
        href: null,
        label: "Add to Plan",
      }),
    ).toThrow(/RA-7549 public pricing CTA fail-closed/);
  });

  it("pricing page renders only through the runtime PublicPricingCta pin", () => {
    const src = readSrc("app/pricing/page.tsx");
    expect(src).toContain("PublicPricingCta");
    expect(src).toContain('kind={plan.isFree ? "trial" : "monthly"}');
    expect(src).toContain('kind="pack"');
    expect(src).not.toMatch(/Add to Plan/);
    expect(src).not.toMatch(/\bUSD\b/);
    expect(src).not.toMatch(/href=\{PUBLIC_TRIAL_PATH\}/);
  });

  it("signup names the AUD monthly plan that Stripe will sell after trial", () => {
    const src = readSrc("app/signup/page.tsx");
    expect(src).toContain("afterTrialPlanNote");
    expect(src).not.toMatch(/\bUSD\b/);
  });
});
