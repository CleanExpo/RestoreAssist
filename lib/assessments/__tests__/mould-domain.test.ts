import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { mouldDomain } from "../domains/mould";

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

describe("mouldDomain — happy path (Condition 3, ≥9 m²)", () => {
  it("auto-selects FULL containment, sizes equipment from S520 ratios, and emits a defensible report", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "12 Smith St, Brisbane QLD 4000",
      affectedAreas: [
        { affectedSquareFootage: 18 },
        { affectedSquareFootage: 7 },
      ],
    });

    const r = await mouldDomain.generate({
      ...baseInput,
      options: { condition: "CONDITION_3", ambientRelativeHumidity: 70 },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");

    // Report sections present and citations all S520:2024.
    const headings = r.data.report.sections.map((s) => s.heading);
    expect(headings).toContain("Situation");
    expect(headings).toContain("Containment classification");
    expect(headings).toContain("Equipment rationale");
    expect(headings).toContain("Estimated duration");
    expect(headings).toContain("Clearance criteria");

    // Citations include S520 + AIHA.
    expect(r.data.citations.some((c) => c.standard === "IICRC S520:2024")).toBe(
      true,
    );
    expect(r.data.citations.some((c) => c.standard === "AIHA Z9.11")).toBe(
      true,
    );

    // FULL containment chosen (Cond3 + 25 m²).
    const containment = r.data.report.sections.find(
      (s) => s.heading === "Containment classification",
    );
    expect(containment?.body).toContain("FULL");

    // Scope items all carry an IICRC ref + positive quantity.
    expect(r.data.scope.items.length).toBeGreaterThan(0);
    for (const item of r.data.scope.items) {
      expect(item.iicrcRef.length).toBeGreaterThan(0);
      expect(item.quantity).toBeGreaterThan(0);
      expect(item.unit).toBe("unit·day");
      expect(item.category).toBe("EQUIPMENT");
    }

    // Estimate self-consistency.
    const subtotal = r.data.estimate.lines.reduce(
      (s, l) => s + l.lineTotalExGst,
      0,
    );
    expect(
      Math.abs(subtotal - r.data.estimate.totals.subtotalExGst),
    ).toBeLessThan(0.05);
    expect(
      Math.abs(
        r.data.estimate.totals.totalIncGst -
          (r.data.estimate.totals.subtotalExGst +
            r.data.estimate.totals.gstTotal),
      ),
    ).toBeLessThan(0.05);
    expect(r.data.estimate.totals.gstRate).toBe(0.1);
    expect(r.data.estimate.totals.currency).toBe("AUD");

    // Rule-based meta.
    expect(r.data.meta.modelUsed).toBeNull();
    expect(r.data.meta.costEstimateUsd).toBe(0);
    expect(r.data.meta.workspaceId).toBe("ws_1");
  });

  it("includes LGR dehumidifier line when ambient RH > 60%", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "x",
      affectedAreas: [{ affectedSquareFootage: 12 }],
    });
    const r = await mouldDomain.generate({
      ...baseInput,
      options: { condition: "CONDITION_3", ambientRelativeHumidity: 75 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const lgr = r.data.scope.items.find((i) =>
      i.description.toLowerCase().includes("dehumidifier"),
    );
    expect(lgr).toBeDefined();
  });

  it("omits LGR dehu line when ambient RH ≤ 60%", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "x",
      affectedAreas: [{ affectedSquareFootage: 12 }],
    });
    const r = await mouldDomain.generate({
      ...baseInput,
      options: { condition: "CONDITION_3", ambientRelativeHumidity: 55 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const lgr = r.data.scope.items.find((i) =>
      i.description.toLowerCase().includes("dehumidifier"),
    );
    expect(lgr).toBeUndefined();
  });
});

describe("mouldDomain — Condition 2 / small area", () => {
  it("auto-selects LIMITED containment for small Condition-2 area", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "x",
      affectedAreas: [{ affectedSquareFootage: 5 }],
    });
    const r = await mouldDomain.generate({
      ...baseInput,
      options: { condition: "CONDITION_2", ambientRelativeHumidity: 50 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const containment = r.data.report.sections.find(
      (s) => s.heading === "Containment classification",
    );
    expect(containment?.body).toContain("LIMITED");
  });

  it("uses 4-day default duration for small Condition 2", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "x",
      affectedAreas: [{ affectedSquareFootage: 4 }],
    });
    const r = await mouldDomain.generate({
      ...baseInput,
      options: { condition: "CONDITION_2", ambientRelativeHumidity: 50 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const duration = r.data.report.sections.find(
      (s) => s.heading === "Estimated duration",
    );
    expect(duration?.body).toContain("4 days");
  });
});

describe("mouldDomain — overrides", () => {
  it("honours an explicit `days` override", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "x",
      affectedAreas: [{ affectedSquareFootage: 10 }],
    });
    const r = await mouldDomain.generate({
      ...baseInput,
      options: {
        condition: "CONDITION_3",
        ambientRelativeHumidity: 50,
        days: 21,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const duration = r.data.report.sections.find(
      (s) => s.heading === "Estimated duration",
    );
    expect(duration?.body).toContain("21 days");
  });

  it("honours an explicit `containment` override", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "x",
      affectedAreas: [{ affectedSquareFootage: 50 }],
    });
    const r = await mouldDomain.generate({
      ...baseInput,
      options: {
        condition: "CONDITION_2",
        ambientRelativeHumidity: 50,
        containment: "SOURCE_CONTROL",
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const containment = r.data.report.sections.find(
      (s) => s.heading === "Containment classification",
    );
    expect(containment?.body).toContain("SOURCE_CONTROL");
  });
});

describe("mouldDomain — error paths", () => {
  it("INSUFFICIENT_DATA when options is missing", async () => {
    const r = await mouldDomain.generate({ ...baseInput, options: null });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
    expect(r.message).toMatch(/condition/i);
  });

  it("INSUFFICIENT_DATA when condition is invalid", async () => {
    const r = await mouldDomain.generate({
      ...baseInput,
      options: { condition: "CONDITION_1", ambientRelativeHumidity: 50 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("NOT_FOUND when the inspection does not exist", async () => {
    inspectionFindUnique.mockResolvedValueOnce(null);
    const r = await mouldDomain.generate({
      ...baseInput,
      options: { condition: "CONDITION_2", ambientRelativeHumidity: 50 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("NOT_FOUND");
  });

  it("INSUFFICIENT_DATA when the inspection has no affected-area data", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      id: "i_1",
      propertyAddress: "x",
      affectedAreas: [],
    });
    const r = await mouldDomain.generate({
      ...baseInput,
      options: { condition: "CONDITION_3", ambientRelativeHumidity: 60 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
    expect(r.message).toMatch(/affected.*area/i);
  });

  it("INTERNAL when the DB call throws", async () => {
    inspectionFindUnique.mockRejectedValueOnce(new Error("DB down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await mouldDomain.generate({
      ...baseInput,
      options: { condition: "CONDITION_3", ambientRelativeHumidity: 60 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INTERNAL");
    errSpy.mockRestore();
  });
});

describe("mouldDomain — registry", () => {
  it("declares the MOULD domain key with a non-empty label", () => {
    expect(mouldDomain.domain).toBe("MOULD");
    expect(mouldDomain.label).toMatch(/S520/);
    expect(typeof mouldDomain.generate).toBe("function");
  });
});
