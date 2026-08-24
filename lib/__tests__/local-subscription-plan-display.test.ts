import { describe, expect, it } from "vitest";
import {
  MONTHLY_PLAN_NAME,
  PRICING_CONFIG,
  resolveLocalSubscriptionPlanDisplay,
} from "@/lib/pricing";

describe("resolveLocalSubscriptionPlanDisplay", () => {
  it("maps Monthly Plan to $99 AUD cents for the Subscription page", () => {
    const display = resolveLocalSubscriptionPlanDisplay(MONTHLY_PLAN_NAME);
    expect(display).toEqual({
      name: "Monthly Plan",
      amountCents: 9900,
      currency: "aud",
      interval: "month",
    });
    expect(display.amountCents / 100).toBe(
      PRICING_CONFIG.pricing.monthly.amount,
    );
  });

  it("defaults empty plan names to the catalog Monthly Plan", () => {
    expect(resolveLocalSubscriptionPlanDisplay(null).amountCents).toBe(9900);
    expect(resolveLocalSubscriptionPlanDisplay("").name).toBe("Monthly Plan");
  });

  it("keeps Lifetime as a zero-amount display label", () => {
    expect(resolveLocalSubscriptionPlanDisplay("Lifetime")).toMatchObject({
      name: "Lifetime",
      amountCents: 0,
    });
  });
});
