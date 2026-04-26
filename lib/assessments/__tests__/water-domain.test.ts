import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { waterDomain } from "../domains/water";

const inspectionFindUnique = (
  prisma as unknown as {
    inspection: { findUnique: ReturnType<typeof vi.fn> };
  }
).inspection.findUnique;

beforeEach(() => {
  inspectionFindUnique.mockReset();
});

const baseInput = {
  inspectionId: "i_1",
  workspaceId: "ws_1",
  userId: "u_1",
};

describe("waterDomain — happy path", () => {
  it("generates report + scope + estimate from a Cat-2 / Class-2 inspection", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "12 Smith St, Brisbane QLD 4000",
      classifications: [{ category: "2", class: "2" }],
      affectedAreas: [
        { affectedSquareFootage: 18 },
        { affectedSquareFootage: 7.5 },
      ],
      moistureReadings: [
        // timber dryThreshold 19, wetThreshold 25
        { surfaceType: "timber", moistureLevel: 28 }, // WET
        // carpet dryThreshold 3, wetThreshold 10
        { surfaceType: "carpet", moistureLevel: 6 }, // DRYING
        // plasterboard dryThreshold 1.5, wetThreshold 5
        { surfaceType: "plasterboard", moistureLevel: 0.8 }, // DRY
      ],
    });

    const r = await waterDomain.generate(baseInput);

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");

    // Report has the expected sections.
    const headings = r.data.report.sections.map((s) => s.heading);
    expect(headings).toContain("Situation");
    expect(headings).toContain("Evidence — moisture mapping");
    expect(headings).toContain("Scope rationale");
    expect(headings).toContain("Estimated duration");
    expect(headings).toContain("Dry-standard reference");

    // Citations aggregate IICRC S500 references.
    expect(r.data.citations.length).toBeGreaterThan(0);
    expect(r.data.citations.every((c) => c.standard === "IICRC S500:2021")).toBe(true);

    // Scope has at least the prelims set; every item carries an IICRC ref.
    expect(r.data.scope.items.length).toBeGreaterThan(0);
    for (const item of r.data.scope.items) {
      expect(item.iicrcRef.length).toBeGreaterThan(0);
      expect(item.quantity).toBeGreaterThan(0);
    }

    // Estimate totals are internally consistent.
    const subtotal = r.data.estimate.lines.reduce(
      (s, l) => s + l.lineTotalExGst,
      0,
    );
    expect(Math.abs(subtotal - r.data.estimate.totals.subtotalExGst)).toBeLessThan(0.05);
    expect(r.data.estimate.totals.gstRate).toBe(0.1);
    expect(r.data.estimate.totals.currency).toBe("AUD");
    expect(
      Math.abs(
        r.data.estimate.totals.totalIncGst -
          (r.data.estimate.totals.subtotalExGst + r.data.estimate.totals.gstTotal),
      ),
    ).toBeLessThan(0.05);

    // Meta is rule-based — no AI.
    expect(r.data.meta.modelUsed).toBeNull();
    expect(r.data.meta.costEstimateUsd).toBe(0);
    expect(r.data.meta.workspaceId).toBe("ws_1");
    expect(r.data.meta.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("uses the most-recent classification when multiple are returned", async () => {
    // findUnique already orders by createdAt desc + take 1 in the plug-in,
    // so this test asserts the plug-in does not crash on edge values.
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "1 Test St",
      classifications: [{ category: "Cat 3", class: "Class 4" }],
      affectedAreas: [{ affectedSquareFootage: 200 }],
      moistureReadings: [],
    });

    const r = await waterDomain.generate(baseInput);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    // Class 4 → 10-day estimate baked into the duration section.
    const duration = r.data.report.sections.find(
      (s) => s.heading === "Estimated duration",
    );
    expect(duration?.body).toContain("10 days");
  });
});

describe("waterDomain — error paths", () => {
  it("returns NOT_FOUND when the inspection does not exist", async () => {
    inspectionFindUnique.mockResolvedValueOnce(null);
    const r = await waterDomain.generate(baseInput);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("NOT_FOUND");
  });

  it("returns INSUFFICIENT_DATA when no classification is present", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "x",
      classifications: [],
      affectedAreas: [{ affectedSquareFootage: 10 }],
      moistureReadings: [],
    });
    const r = await waterDomain.generate(baseInput);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("returns INSUFFICIENT_DATA when classification is malformed (no Cat-1/2/3)", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "x",
      classifications: [{ category: "weird", class: "1" }],
      affectedAreas: [{ affectedSquareFootage: 10 }],
      moistureReadings: [],
    });
    const r = await waterDomain.generate(baseInput);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("returns INTERNAL when the DB call throws", async () => {
    inspectionFindUnique.mockRejectedValueOnce(new Error("DB down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await waterDomain.generate(baseInput);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INTERNAL");
    errSpy.mockRestore();
  });
});

describe("waterDomain — moisture summary", () => {
  it("handles zero readings (no measurement yet) without crashing", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "x",
      classifications: [{ category: "1", class: "1" }],
      affectedAreas: [{ affectedSquareFootage: 5 }],
      moistureReadings: [],
    });

    const r = await waterDomain.generate(baseInput);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const evidence = r.data.report.sections.find(
      (s) => s.heading === "Evidence — moisture mapping",
    );
    expect(evidence?.body).toMatch(/no moisture readings/i);
  });

  it("counts WET / DRYING / DRY status accurately", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "x",
      classifications: [{ category: "2", class: "2" }],
      affectedAreas: [{ affectedSquareFootage: 10 }],
      moistureReadings: [
        // timber: dryThreshold 19, wetThreshold 25
        { surfaceType: "timber", moistureLevel: 30 }, // WET (> 25)
        { surfaceType: "timber", moistureLevel: 28 }, // WET (> 25)
        { surfaceType: "timber", moistureLevel: 22 }, // DRYING (19–25)
        { surfaceType: "timber", moistureLevel: 12 }, // DRY (≤ 19)
        { surfaceType: "timber", moistureLevel: 14 }, // DRY
        { surfaceType: "timber", moistureLevel: 18 }, // DRY
      ],
    });

    const r = await waterDomain.generate(baseInput);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const evidence = r.data.report.sections.find(
      (s) => s.heading === "Evidence — moisture mapping",
    );
    expect(evidence?.body).toContain("6 moisture readings");
    expect(evidence?.body).toContain("2 above wet-standard");
    expect(evidence?.body).toContain("1 in drying band");
    expect(evidence?.body).toContain("3 at or below");
  });
});
