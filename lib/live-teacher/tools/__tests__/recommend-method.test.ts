import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { inspection: { findUnique: vi.fn() } },
}));

import { standardCite } from "@/lib/nir-standards-mapping";
import { prisma } from "@/lib/prisma";

import { recommendMethod } from "../recommend-method";

describe("recommend_method", () => {
  beforeEach(() => {
    vi.mocked(prisma.inspection.findUnique).mockReset();
  });

  it("recommends drying method + S500-ratio equipment for a classified inspection", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue({
      id: "insp_1",
      classifications: [{ category: "2", class: "2" }],
      affectedAreas: [
        { affectedAreaSqm: 30, affectedSquareFootage: 322.9 },
        { affectedAreaSqm: null, affectedSquareFootage: 107.6 }, // legacy row: 10 m²
      ],
    } as never);

    const result = await recommendMethod({ inspectionId: "insp_1" });

    expect(result.available).toBe(true);
    if (!result.available) throw new Error("unreachable");
    expect(result.classification).toEqual({ category: "2", class: "2" });
    // 30 + 10 legacy-converted m² = 40 m² total drives the S500 ratios.
    expect(result.equipment.totalAreaM2).toBeCloseTo(40, 1);
    expect(result.equipment.dehumidifier).toBeGreaterThan(0);
    expect(result.equipment.airMover).toBeGreaterThan(0);
    expect(result.equipment.citation).toBe(standardCite("S500", "6"));
    expect(result.method.citation).toBe(standardCite("S500", "10.4.3"));
    expect(result.method.summary).toBeTruthy();
    // Cat 2 water → antimicrobial consideration must be surfaced, cited.
    expect(
      result.cautions.some((c) => c.citation === standardCite("S500", "7.1")),
    ).toBe(true);
  });

  it("is explicit when classification is missing instead of guessing", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue({
      id: "insp_1",
      classifications: [],
      affectedAreas: [],
    } as never);

    const result = await recommendMethod({ inspectionId: "insp_1" });

    expect(result.available).toBe(false);
    if (result.available) throw new Error("unreachable");
    expect(result.reason).toMatch(/classification/iu);
  });

  it("is explicit when classified but no affected areas are recorded (never sizes 0 equipment)", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue({
      id: "insp_1",
      classifications: [{ category: "2", class: "2" }],
      affectedAreas: [],
    } as never);

    const result = await recommendMethod({ inspectionId: "insp_1" });

    expect(result.available).toBe(false);
    if (result.available) throw new Error("unreachable");
    expect(result.reason).toMatch(/affected areas/iu);
  });

  it("is explicit when the inspection does not exist", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue(null);

    const result = await recommendMethod({ inspectionId: "nope" });

    expect(result.available).toBe(false);
  });
});
