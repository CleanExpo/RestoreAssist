import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { biohazardDomain } from "../domains/biohazard";

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

const baseInspection = {
  id: "i_1",
  propertyAddress: "12 Smith St, Brisbane",
  propertyPostcode: "4000", // QLD
  affectedAreas: [{ affectedSquareFootage: 12 }],
};

describe("biohazardDomain — happy paths per type", () => {
  it("sewage_overflow generates Cat-3 (S500 §6.3) report + waste-manifest scope", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);

    const r = await biohazardDomain.generate({
      ...baseInput,
      options: { biohazardType: "sewage_overflow" },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");

    // Sections present.
    const headings = r.data.report.sections.map((s) => s.heading);
    expect(headings).toEqual([
      "Situation",
      "PPE rationale",
      "Cleaning + decontamination protocol",
      "Controlled waste pathway",
      "Clearance criteria",
    ]);

    // Citations include S500:2021 + state EPA.
    expect(r.data.citations.some((c) => c.standard === "IICRC S500:2021")).toBe(
      true,
    );
    expect(r.data.citations.some((c) => c.standard.includes("EPA"))).toBe(true);

    // Scope items all carry refs and quantities.
    expect(r.data.scope.items.length).toBeGreaterThanOrEqual(5);
    for (const item of r.data.scope.items) {
      expect(item.iicrcRef.length).toBeGreaterThan(0);
      expect(item.quantity).toBeGreaterThan(0);
    }
  });

  it("blood_trauma uses S540:2023 §5 as the primary reference + premium PPE", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);

    const r = await biohazardDomain.generate({
      ...baseInput,
      options: { biohazardType: "blood_trauma" },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");

    expect(r.data.citations.some((c) => c.standard === "IICRC S540:2023")).toBe(
      true,
    );

    const ppeSection = r.data.report.sections.find(
      (s) => s.heading === "PPE rationale",
    );
    expect(ppeSection?.body.toLowerCase()).toContain("level-c");
    expect(ppeSection?.body.toLowerCase()).toContain("premium");
  });

  it("decomposition uses S540 + premium PPE pathway", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);

    const r = await biohazardDomain.generate({
      ...baseInput,
      options: { biohazardType: "decomposition" },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");

    const ppe = r.data.scope.items.find((i) =>
      i.description.toLowerCase().includes("premium ppe"),
    );
    expect(ppe).toBeDefined();
  });

  it("chemical_spill uses AS/NZS 4360:2004 §3.2 as the primary reference", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);

    const r = await biohazardDomain.generate({
      ...baseInput,
      options: { biohazardType: "chemical_spill" },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(
      r.data.citations.some((c) => c.standard === "AS/NZS 4360:2004"),
    ).toBe(true);
  });
});

describe("biohazardDomain — state resolution", () => {
  it("uses postcode-derived state when no override given", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      ...baseInspection,
      propertyPostcode: "2000", // NSW (Sydney)
    });

    const r = await biohazardDomain.generate({
      ...baseInput,
      options: { biohazardType: "sewage_overflow" },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const wastePathway = r.data.report.sections.find(
      (s) => s.heading === "Controlled waste pathway",
    );
    expect(wastePathway?.body).toContain("NSW EPA");
  });

  it("honours explicit state override", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      ...baseInspection,
      propertyPostcode: "2000", // NSW from postcode
    });

    const r = await biohazardDomain.generate({
      ...baseInput,
      options: { biohazardType: "sewage_overflow", state: "VIC" },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const wastePathway = r.data.report.sections.find(
      (s) => s.heading === "Controlled waste pathway",
    );
    expect(wastePathway?.body).toContain("VIC EPA");
  });

  it("falls back to NSW when postcode is missing and no override", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      ...baseInspection,
      propertyPostcode: null,
    });

    const r = await biohazardDomain.generate({
      ...baseInput,
      options: { biohazardType: "sewage_overflow" },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(
      r.data.report.sections.find(
        (s) => s.heading === "Controlled waste pathway",
      )?.body,
    ).toContain("NSW EPA");
  });
});

describe("biohazardDomain — error paths", () => {
  it("INSUFFICIENT_DATA when options is missing", async () => {
    const r = await biohazardDomain.generate({ ...baseInput, options: null });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("INSUFFICIENT_DATA when biohazardType is invalid", async () => {
    const r = await biohazardDomain.generate({
      ...baseInput,
      options: { biohazardType: "asbestos" }, // not in the enum
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("NOT_FOUND when inspection doesn't exist", async () => {
    inspectionFindUnique.mockResolvedValueOnce(null);
    const r = await biohazardDomain.generate({
      ...baseInput,
      options: { biohazardType: "sewage_overflow" },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("NOT_FOUND");
  });

  it("INSUFFICIENT_DATA when there are no affected areas", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      ...baseInspection,
      affectedAreas: [],
    });
    const r = await biohazardDomain.generate({
      ...baseInput,
      options: { biohazardType: "sewage_overflow" },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("INTERNAL when DB throws", async () => {
    inspectionFindUnique.mockRejectedValueOnce(new Error("DB down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await biohazardDomain.generate({
      ...baseInput,
      options: { biohazardType: "sewage_overflow" },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INTERNAL");
    errSpy.mockRestore();
  });
});

describe("biohazardDomain — estimate self-consistency", () => {
  it("subtotal = sum of line totals; total = subtotal + GST; rate=10%; AUD", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await biohazardDomain.generate({
      ...baseInput,
      options: { biohazardType: "sewage_overflow" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");

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
  });
});

describe("biohazardDomain — registry contract", () => {
  it("registers under the BIOHAZARD key with a S540/S500 label", () => {
    expect(biohazardDomain.domain).toBe("BIOHAZARD");
    expect(biohazardDomain.label).toMatch(/S540|S500/);
    expect(typeof biohazardDomain.generate).toBe("function");
  });
});
