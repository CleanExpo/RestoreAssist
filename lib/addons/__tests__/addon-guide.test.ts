import { describe, it, expect } from "vitest";
import {
  ADDON_GUIDE,
  CORE_CRM_STEPS,
  CRM_WORKS_ALONE,
  planFacts,
} from "../addon-guide";
import { RECURRING_ADDONS } from "@/lib/billing/addon-registry";
import { PRICING_CONFIG } from "@/lib/pricing";

describe("ADDON_GUIDE", () => {
  it("explains exactly the packs the registry sells, no more and no fewer", () => {
    expect(Object.keys(ADDON_GUIDE).sort()).toEqual(
      Object.keys(RECURRING_ADDONS).sort(),
    );
  });

  it("gives every pack a purpose, example, limit and provider line", () => {
    for (const [sku, entry] of Object.entries(ADDON_GUIDE)) {
      for (const field of ["purpose", "example", "doesNotDo", "needs"] as const) {
        expect(entry[field].trim().length, `${sku}.${field}`).toBeGreaterThan(0);
      }
    }
  });

  it("never states a price; prices come from the registry", () => {
    for (const entry of Object.values(ADDON_GUIDE)) {
      const text = [entry.purpose, entry.example, entry.doesNotDo, entry.needs].join(" ");
      expect(text).not.toMatch(/\$\s?\d/);
    }
  });

  it("makes no promise that RestoreAssist runs only on the customer's own keys (RA-8414)", () => {
    const all = JSON.stringify(ADDON_GUIDE).toLowerCase();
    expect(all).not.toMatch(/byok|bring your own key|only your own key/);
  });

  it("does not offer listing-site import while its switch is off", () => {
    // NEXT_PUBLIC_UNDERLAY_URL_IMPORT is unset in the test environment.
    expect(ADDON_GUIDE.FLOORPLAN_UNDERLAY.comingSoon).toMatch(/not switched on yet/);
  });
});

describe("core CRM steps", () => {
  it("follow one job: job, evidence, report, invoice or approval", () => {
    expect(CORE_CRM_STEPS.map((s) => s.key)).toEqual([
      "job",
      "evidence",
      "report",
      "invoice",
    ]);
    for (const step of CORE_CRM_STEPS) {
      expect(step.href.startsWith("/dashboard/")).toBe(true);
    }
  });

  it("says plainly that the CRM works without an add-on", () => {
    expect(CRM_WORKS_ALONE).toMatch(/works without any add-on/);
  });

  it("reads plan facts from the pricing owner", () => {
    expect(planFacts()).toEqual({
      trialDays: PRICING_CONFIG.free.trialDays,
      planAmount: PRICING_CONFIG.pricing.monthly.amount,
      planCurrency: PRICING_CONFIG.pricing.monthly.currency,
    });
  });
});
