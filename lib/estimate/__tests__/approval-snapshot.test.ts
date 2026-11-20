import { describe, it, expect } from "vitest";
import { parseFrozenEstimateLines } from "../approval-snapshot";

describe("parseFrozenEstimateLines", () => {
  it("returns line items from a frozen snapshot", () => {
    const lines = parseFrozenEstimateLines(
      JSON.stringify({
        lineItems: [
          {
            description: "Drywall strip",
            category: "Demolition",
            qty: 10,
            unit: "m2",
            rate: 45,
            subtotal: 450,
          },
        ],
      }),
    );
    expect(lines).toHaveLength(1);
    expect(lines![0].rate).toBe(45);
  });
});
