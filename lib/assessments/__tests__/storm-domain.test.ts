import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { stormDomain } from "../domains/storm";

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
  affectedAreas: [{ affectedSquareFootage: 30 }],
};

describe("stormDomain — happy paths per entry type", () => {
  it("roof_penetration with declared Cat-2 stays Cat-2 effective", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "roof_penetration", waterCategory: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const wcat = r.data.report.sections.find(
      (s) => s.heading === "Water classification",
    );
    expect(wcat?.body).toContain("Declared water category: 2");
    expect(wcat?.body).toContain("Effective category for treatment: 2");
  });

  it("flash_flood elevates to Cat-3 effective regardless of declared", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "flash_flood", waterCategory: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const wcat = r.data.report.sections.find(
      (s) => s.heading === "Water classification",
    );
    expect(wcat?.body).toContain("Declared water category: 1");
    expect(wcat?.body).toContain("Effective category for treatment: 3");
    expect(wcat?.body.toLowerCase()).toContain("flash-flood");
  });

  it("stormwater_ingress elevates to Cat-3 + emits drainage source-tracing language", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "stormwater_ingress", waterCategory: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const ms = r.data.report.sections.find(
      (s) => s.heading === "Make-safe + entry-pathway",
    );
    expect(ms?.body.toLowerCase()).toContain("council");
  });

  it("wind_driven_rain emits seal/weep-hole language", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "wind_driven_rain", waterCategory: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const ms = r.data.report.sections.find(
      (s) => s.heading === "Make-safe + entry-pathway",
    );
    expect(ms?.body.toLowerCase()).toContain("seal");
  });
});

describe("stormDomain — duration heuristics", () => {
  it("flash_flood with ≥50 m² → 14 days", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      ...baseInspection,
      affectedAreas: [{ affectedSquareFootage: 75 }],
    });
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "flash_flood", waterCategory: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const dur = r.data.report.sections.find(
      (s) => s.heading === "Estimated duration",
    );
    expect(dur?.body).toContain("14 days");
  });

  it("days override is honoured", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "roof_penetration", waterCategory: 1, days: 21 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(
      r.data.report.sections.find((s) => s.heading === "Estimated duration")
        ?.body,
    ).toContain("21 days");
  });
});

describe("stormDomain — citations + scope", () => {
  it("aggregates S500:2021 + NCC citations", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "roof_penetration", waterCategory: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.citations.some((c) => c.standard === "IICRC S500:2021")).toBe(
      true,
    );
    expect(r.data.citations.some((c) => c.standard === "NCC Volume 2")).toBe(
      true,
    );
  });

  it("every scope item carries an IICRC ref + positive quantity", async () => {
    inspectionFindUnique.mockResolvedValueOnce(baseInspection);
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "flash_flood", waterCategory: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.scope.items.length).toBeGreaterThan(0);
    for (const item of r.data.scope.items) {
      expect(item.iicrcRef.length).toBeGreaterThan(0);
      expect(item.quantity).toBeGreaterThan(0);
    }
  });
});

describe("stormDomain — error paths", () => {
  it("INSUFFICIENT_DATA when options missing", async () => {
    const r = await stormDomain.generate({ ...baseInput, options: null });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("INSUFFICIENT_DATA when entryType invalid", async () => {
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "tornado", waterCategory: 1 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("INSUFFICIENT_DATA when waterCategory invalid", async () => {
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "roof_penetration", waterCategory: 4 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("NOT_FOUND when inspection missing", async () => {
    inspectionFindUnique.mockResolvedValueOnce(null);
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "roof_penetration", waterCategory: 1 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("NOT_FOUND");
  });

  it("INSUFFICIENT_DATA when no affected-area data", async () => {
    inspectionFindUnique.mockResolvedValueOnce({
      ...baseInspection,
      affectedAreas: [],
    });
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "roof_penetration", waterCategory: 1 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INSUFFICIENT_DATA");
  });

  it("INTERNAL on DB throw", async () => {
    inspectionFindUnique.mockRejectedValueOnce(new Error("DB down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await stormDomain.generate({
      ...baseInput,
      options: { entryType: "roof_penetration", waterCategory: 1 },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INTERNAL");
    errSpy.mockRestore();
  });
});

describe("stormDomain — registry contract", () => {
  it("registers under STORM with S500 + NCC label", () => {
    expect(stormDomain.domain).toBe("STORM");
    expect(stormDomain.label).toMatch(/S500|NCC/);
  });
});
