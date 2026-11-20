import { describe, expect, it } from "vitest";
import { computeJobMargin } from "../job-margin";

describe("computeJobMargin", () => {
  it("sums labour/equipment and computes margin against invoice", () => {
    const snap = computeJobMargin({
      costEstimates: [
        { category: "Labor", subtotal: 1000 },
        { category: "Equipment", subtotal: 400 },
        { category: "Materials", subtotal: 200 },
      ],
      invoicedSubtotalExGst: 2000,
    });

    expect(snap.labourExGst).toBe(1000);
    expect(snap.equipmentExGst).toBe(400);
    expect(snap.estimateTotalExGst).toBe(1600);
    expect(snap.marginExGst).toBe(400);
    expect(snap.marginPercent).toBeCloseTo(20);
  });

  it("returns null margin when no invoice", () => {
    const snap = computeJobMargin({
      costEstimates: [{ category: "Labor", subtotal: 100 }],
      invoicedSubtotalExGst: null,
    });
    expect(snap.marginExGst).toBeNull();
  });
});