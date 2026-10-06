/**
 * RA-1585 — pricing drift guard.
 *
 * The public pricing page renders from `PRICING_CONFIG`, so drift can
 * only creep in via config edits that violate one of the contracts
 * the landing copy promises (AUD currency, GST-inclusive amounts, at
 * least one paid tier, non-zero amounts). This test is the single
 * source of truth for those invariants.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRICING_CONFIG } from "@/lib/pricing";
import { RECURRING_ADDONS } from "@/lib/billing/addon-registry";
import { HOME } from "@/components/landing/home/homeContent";

const repoRoot = join(__dirname, "..", "..");
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

describe("RA-1585 pricing-config integrity", () => {
  it("free tier is a 15-day trial whose copy matches the credit grant", () => {
    const { free } = PRICING_CONFIG;
    // Decided model: a 15-day free trial that grants 50 report credits.
    // These three values are the SSOT the register route + marketing copy read.
    expect(free.trialDays).toBe(15);
    expect(free.trialReportCredits).toBe(50);
    // `reportLimit` is the deprecated alias the display cards still read; it
    // must equal the real credit grant so the card never shows a stale number.
    expect(free.reportLimit).toBe(free.trialReportCredits);
    // No "Free Forever" / unlimited claim — this is time-limited.
    expect(free.name).not.toMatch(/forever/i);
    expect(free.description).not.toMatch(/forever|unlimited/i);
    for (const bullet of free.features) {
      expect(bullet).not.toMatch(/forever|unlimited/i);
    }
    // The feature list must state the real trial length and credit count.
    expect(
      free.features.some((f) =>
        f.toLowerCase().includes(`${free.trialDays}-day free trial`),
      ),
      "free tier should advertise the trial length",
    ).toBe(true);
    expect(
      free.features.some((f) =>
        f
          .toLowerCase()
          .includes(`${free.trialReportCredits} inspection report`),
      ),
      "free tier should advertise the real report-credit count",
    ).toBe(true);
  });

  it("declares at least one paid tier", () => {
    expect(Object.keys(PRICING_CONFIG.pricing).length).toBeGreaterThan(0);
  });

  // RA-6929/6930/6931 — single-catalog collapse (C1/C3). The catalog is the
  // ONE $99 Monthly Plan; the Yearly $1188 SKU is retired from both the
  // display catalog and the Stripe price map so no page can offer it.
  it("catalog is a single $99 Monthly Plan (yearly retired)", () => {
    expect(Object.keys(PRICING_CONFIG.pricing)).toEqual(["monthly"]);
    expect(PRICING_CONFIG.pricing).not.toHaveProperty("yearly");
    expect(PRICING_CONFIG.pricing.monthly.amount).toBe(99.0);
  });

  it("the Stripe price map exposes only the monthly price (no yearly)", () => {
    expect(Object.keys(PRICING_CONFIG.prices)).toEqual(["monthly"]);
    expect(PRICING_CONFIG.prices).not.toHaveProperty("yearly");
  });

  it("every paid tier is priced in AUD", () => {
    for (const [key, plan] of Object.entries(PRICING_CONFIG.pricing)) {
      expect(plan.currency, `tier ${key} currency`).toBe("AUD");
    }
  });

  it("no paid tier may have a zero or negative amount (the landing page promises a paid service)", () => {
    for (const [key, plan] of Object.entries(PRICING_CONFIG.pricing)) {
      expect(plan.amount, `tier ${key} amount`).toBeGreaterThan(0);
    }
  });

  it("every tier declares a positive reportLimit", () => {
    for (const [key, plan] of Object.entries(PRICING_CONFIG.pricing)) {
      expect(
        (plan as { reportLimit: number }).reportLimit,
        `tier ${key} reportLimit`,
      ).toBeGreaterThan(0);
    }
  });

  it("every addon is priced in AUD and has a positive amount + report credit", () => {
    for (const [key, addon] of Object.entries(PRICING_CONFIG.addons)) {
      const a = addon as {
        currency: string;
        amount: number;
        reportLimit: number;
      };
      expect(a.currency, `addon ${key} currency`).toBe("AUD");
      expect(a.amount, `addon ${key} amount`).toBeGreaterThan(0);
      expect(a.reportLimit, `addon ${key} reportLimit`).toBeGreaterThan(0);
    }
  });

  it("every tier exposes a features array with at least three bullets (sellability minimum)", () => {
    for (const [key, plan] of Object.entries(PRICING_CONFIG.pricing)) {
      const features = (plan as { features: unknown[] }).features;
      expect(Array.isArray(features), `tier ${key} features array`).toBe(true);
      expect(
        features.length,
        `tier ${key} feature count`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("free-trial honesty — grant matches advertised copy", () => {
  it("register route grants a ~15-day trialEndsAt sourced from PRICING_CONFIG", () => {
    const src = readSrc("app/api/auth/register/route.ts");

    // The route must derive its trial window from the SSOT, never hardcode it.
    expect(src).toContain("const TRIAL_DAYS = PRICING_CONFIG.free.trialDays;");
    expect(src).toContain(
      "const TRIAL_REPORT_CREDITS = PRICING_CONFIG.free.trialReportCredits;",
    );
    // trialEndsAt is computed from the SSOT-derived duration, not a literal 30 days.
    expect(src).toContain("new Date(Date.now() + TRIAL_DURATION_MS)");
    expect(src).not.toMatch(/Date\.now\(\)\s*\+\s*30\s*\*\s*24/);
    expect(src).not.toMatch(/creditsRemaining:\s*30\b/);

    // Mirror the route's grant formula and assert it lands ~15 days out.
    const trialDurationMs = PRICING_CONFIG.free.trialDays * 24 * 60 * 60 * 1000;
    const trialEndsAt = new Date(Date.now() + trialDurationMs);
    const daysOut =
      (trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysOut).toBeGreaterThan(14.9);
    expect(daysOut).toBeLessThan(15.1);
  });

  it("signup page copy is sourced from PRICING_CONFIG (no hardcoded credit/day numbers)", () => {
    const src = readSrc("app/signup/page.tsx");
    expect(src).toContain("PRICING_CONFIG.free.trialDays");
    expect(src).toContain("PRICING_CONFIG.free.trialReportCredits");
    // The old hardcoded "30 free report credits" line must be gone.
    expect(src).not.toMatch(/30 free report credits/i);
    expect(src).not.toMatch(/Free Tier Available/i);
  });

  it("public pricing page reads the trial from PRICING_CONFIG and drops 'Free Forever'", () => {
    const src = readSrc("app/pricing/page.tsx");
    expect(src).toContain("freeCfg.trialDays");
    expect(src).toContain("freeCfg.trialReportCredits");
    expect(src).not.toMatch(/Free Forever/i);
  });

  it("marketing home CTA copy is sourced from PRICING_CONFIG (no stale '3 trial reports')", () => {
    const src = readSrc("components/landing/home/homeContent.ts");
    expect(src).toContain("PRICING_CONFIG.free.trialDays");
    expect(src).toContain("PRICING_CONFIG.free.trialReportCredits");
    expect(src).not.toMatch(/3 trial reports/i);
    expect(src).not.toMatch(/three trial reports/i);
    expect(src).not.toMatch(/3 complimentary/i);
  });

  // RA-7549 — D-022 lets a funded trial generate Basic reports without BYOK.
  // Marketing that still says "an API key is required first" is the lie this
  // ticket exists to stop. Instant-setup remains unpromised; the honest
  // claim is that Basic works without a key, and provider charges apply
  // only when the buyer adds their own.
  it("marketing copy states Basic works without a key, not that BYOK is required first", () => {
    for (const rel of [
      "components/landing/home/homeContent.ts",
      "components/landing/home/FAQSection.tsx",
    ]) {
      expect(readSrc(rel), `${rel} should not promise instant setup`).not.toMatch(
        /instant setup/i,
      );
      expect(
        readSrc(rel),
        `${rel} should not say a key is required to operate`,
      ).not.toMatch(/API key is required to operate/i);
    }
    const src = readSrc("components/landing/home/homeContent.ts");
    expect(src).toMatch(/reassurances/);
    expect(
      /Basic reports without an API key/i.test(src),
      "home copy should state Basic works without pasting an API key",
    ).toBe(true);
    expect(
      /provider charges apply only if you add your own/i.test(src),
      "home copy should say when provider charges apply",
    ).toBe(true);
  });

  it("how-it-works metadata states Basic-without-key alongside the trial claim", () => {
    const src = readSrc("app/how-it-works/layout.tsx");
    const advertisesTrial = /trial|report credits/i.test(src);
    expect(advertisesTrial).toBe(true);
    expect(
      /without pasting an API key/i.test(src),
      "how-it-works metadata advertises the trial, so it must state Basic works without a key",
    ).toBe(true);
    expect(
      /provider charges apply only if you add your own key/i.test(src),
      "how-it-works metadata must say when provider charges apply",
    ).toBe(true);
  });

  it("OAuth createUser grant matches PRICING_CONFIG (not a hardcoded 30)", () => {
    const src = readSrc("lib/auth.ts");
    expect(src).toContain("PRICING_CONFIG.free.trialReportCredits");
    expect(src).toContain("PRICING_CONFIG.free.trialQuickFillCredits");
    expect(src).not.toMatch(/creditsRemaining:\s*30\b/);
    expect(src).not.toMatch(/quickFillCreditsRemaining:\s*30\b/);
  });

  it("upgrade-user script stamps Monthly Plan from PRICING_CONFIG (not a free trial)", () => {
    const src = readSrc("scripts/upgrade-user-package.ts");
    expect(src).toContain("MONTHLY_PLAN_NAME");
    expect(src).toContain('subscriptionStatus: "ACTIVE"');
    expect(src).toContain("subscriptionPlan: MONTHLY_PLAN_NAME");
    expect(src).toContain("grantAllAddons");
    expect(src).toContain("ADDON_SKUS");
    expect(src).not.toMatch(/subscriptionStatus:\s*"TRIAL"/);
  });
});

/**
 * Round-5 launch blocker 4 — the hardcoded-price drift guard.
 *
 * The invariant assertions above protect `PRICING_CONFIG` itself, and the
 * free-trial block checks that the *trial* numbers are interpolated. Neither
 * catches a dollar figure typed straight into buyer-facing copy, and one had
 * already drifted: the marketing home said "Add-ons are $11/month each" while
 * `floorplan-underlay-addon.ts` charged $9.95 and the pricing page's own
 * `TierComparison` said "from $9.95" — two live surfaces quoting different
 * numbers for the same thing. The outlier was levelled to $11 on 06/10/2026,
 * matching byok-monetisation-spec §2, so the claim is true again; these
 * assertions exist so it cannot quietly stop being true a second time.
 *
 * So on every surface that quotes a subscription price to a buyer, the figure
 * must be interpolated from the SSOT rather than typed. `$0` is exempt: the
 * free tier's amount is structurally zero and cannot drift.
 */
describe("blocker 4 — no hardcoded subscription prices in buyer-facing copy", () => {
  /**
   * Each of these quotes the plan, pack or add-on price to a buyer. Comment
   * blocks are stripped before scanning, so the doc comments that record *why*
   * a number is what it is (and the "NEVER claim flat pricing" warning in
   * homeContent) stay readable.
   */
  const PRICE_QUOTING_SURFACES = [
    "components/landing/home/homeContent.ts",
    "app/billing/upgrade/CheckoutCTA.tsx",
    "app/pricing/layout.tsx",
    "app/features/page.tsx",
    // Added after the $9.95 -> $11 levelling: this in-app upgrade CTA had the
    // price typed into it and would have gone on quoting $9.95 while Stripe
    // charged $11 — a worse failure than the marketing copy, because the buyer
    // reads it immediately before being charged.
    "components/sketch/FloorPlanUnderlayLoader.tsx",
  ] as const;

  const stripComments = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith("//") && !t.startsWith("*");
      })
      .join("\n");

  // `\$\d` cannot match `${expr}`, so interpolation is unaffected.
  const TYPED_PRICE = /\$\d[\d,]*(?:\.\d+)?/g;

  for (const rel of PRICE_QUOTING_SURFACES) {
    it(`${rel} interpolates its prices instead of typing them`, () => {
      const typed = (stripComments(readSrc(rel)).match(TYPED_PRICE) ?? [])
        // The free tier is $0 by construction — not a drift risk.
        .filter((m) => m !== "$0");
      expect(
        typed,
        `${rel} hardcodes ${typed.join(", ")}; derive from PRICING_CONFIG / RECURRING_ADDONS instead`,
      ).toEqual([]);
    });
  }

  it("marketing home quotes the real plan price and the real cheapest add-on price", () => {
    const monthly = PRICING_CONFIG.pricing.monthly;
    const cheapestAddon = Math.min(
      ...Object.values(RECURRING_ADDONS).map((a) => a.amount),
    );
    const money = (n: number) =>
      n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;

    const pricingPillar = HOME.stance.pillars.find((p) =>
      /priced/i.test(p.title),
    );
    expect(pricingPillar, "home stance strip should carry a pricing pillar")
      .toBeDefined();
    const body = pricingPillar!.body;

    expect(body).toContain(money(monthly.amount));
    expect(body).toContain(String(monthly.reportLimit));
    expect(
      body,
      `home copy must quote the real cheapest add-on price (${money(cheapestAddon)})`,
    ).toContain(money(cheapestAddon));

    // The claim that broke, and the shape of the fix. "each" is only honest
    // while every add-on costs the same; the moment one differs the copy has
    // to say "from". Asserting the rendered string both ways means adding a
    // cheaper add-on fails HERE rather than on the live site.
    const amounts = Object.values(RECURRING_ADDONS).map((a) => a.amount);
    const uniform = Math.min(...amounts) === Math.max(...amounts);
    if (uniform) {
      expect(
        body,
        "every add-on is the same price, so the copy may say they ARE that price each",
      ).toMatch(/add-ons are \$/i);
    } else {
      expect(
        body,
        `add-ons range ${money(Math.min(...amounts))}-${money(Math.max(...amounts))}, so the copy must say FROM, not "are ... each"`,
      ).toMatch(/add-ons from \$/i);
    }
  });
});
