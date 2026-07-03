/**
 * R9 / R12 / AC8 (RA-6929/6930/6931) — GST + auth preserved on every surviving
 * checkout path.
 *
 * The billing-correctness collapse DELETED the only GST-less checkout (the bare
 * tier /api/billing/checkout route). This guard asserts:
 *  - that route is gone; and
 *  - every remaining checkout entry point still enforces auth (getServerSession)
 *    and AU GST handling: automatic_tax enabled + ABN tax_id_collection, plus
 *    GST-inclusive tax_behavior on the routes that build the price inline.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..", "..");
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

// Every checkout route that can create a Stripe session after the collapse.
const SURVIVING_CHECKOUT_ROUTES = [
  "app/api/create-checkout-session/route.ts",
  "app/api/checkout-lifetime/route.ts",
  "app/api/addons/checkout/route.ts",
];

// Routes that build the price inline via price_data must mark it GST-inclusive.
const INLINE_PRICE_ROUTES = [
  "app/api/checkout-lifetime/route.ts",
  "app/api/addons/checkout/route.ts",
];

describe("checkout GST + auth guard (R9, R12, AC8)", () => {
  it("the bare tier /api/billing/checkout route is deleted", () => {
    expect(existsSync(join(repoRoot, "app/api/billing/checkout/route.ts"))).toBe(
      false,
    );
  });

  it.each(SURVIVING_CHECKOUT_ROUTES)(
    "%s enforces auth via getServerSession",
    (route) => {
      expect(readSrc(route)).toContain("getServerSession");
    },
  );

  it.each(SURVIVING_CHECKOUT_ROUTES)(
    "%s enables Stripe automatic_tax",
    (route) => {
      expect(readSrc(route)).toContain("automatic_tax: { enabled: true }");
    },
  );

  it.each(SURVIVING_CHECKOUT_ROUTES)(
    "%s collects the ABN via tax_id_collection",
    (route) => {
      expect(readSrc(route)).toContain("tax_id_collection: { enabled: true }");
    },
  );

  it.each(INLINE_PRICE_ROUTES)(
    "%s marks its inline price GST-inclusive",
    (route) => {
      expect(readSrc(route)).toContain('tax_behavior: "inclusive"');
    },
  );

  it("create-checkout-session no longer creates dynamic prices", () => {
    expect(readSrc("app/api/create-checkout-session/route.ts")).not.toContain(
      "stripe.prices.create",
    );
  });
});
