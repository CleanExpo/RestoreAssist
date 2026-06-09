import { describe, expect, it } from "vitest";
import {
  ANZ_MATERIALS,
  findMaterialByName,
  getMaterial,
  materialsForRegion,
} from "../materials";

describe("ANZ materials library", () => {
  it("uses Australian/NZ vocabulary, not US names", () => {
    const names = ANZ_MATERIALS.map((m) => m.name.toLowerCase());
    expect(names.some((n) => n.includes("gyprock"))).toBe(true);
    expect(names.some((n) => n.includes("fibro"))).toBe(true);
    expect(names.some((n) => n.includes("colorbond"))).toBe(true);
    expect(names.some((n) => n.includes("weatherboard"))).toBe(true);
    // No US drywall terminology
    expect(names.some((n) => n.includes("drywall"))).toBe(false);
    expect(names.some((n) => n.includes("sheetrock"))).toBe(false);
  });

  it("every material has a region, a dry-standard MC, and an ACM flag", () => {
    for (const m of ANZ_MATERIALS) {
      expect(m.region.length).toBeGreaterThan(0);
      expect(typeof m.dryStandardMc).toBe("number");
      expect(Number.isFinite(m.dryStandardMc)).toBe(true);
      expect(typeof m.isPotentialAcm).toBe("boolean");
    }
  });

  it("flags pre-2000 fibro and vinyl tiles as potential ACM", () => {
    expect(getMaterial("fibro")?.isPotentialAcm).toBe(true);
    expect(getMaterial("vinyl-tiles")?.isPotentialAcm).toBe(true);
  });

  it("does not flag modern materials as ACM", () => {
    expect(getMaterial("gyprock")?.isPotentialAcm).toBe(false);
    expect(getMaterial("colorbond")?.isPotentialAcm).toBe(false);
  });

  it("resolves materials by alias (plasterboard -> gyprock)", () => {
    expect(findMaterialByName("plasterboard")?.id).toBe("gyprock");
    expect(findMaterialByName("GYPROCK")?.id).toBe("gyprock");
  });

  it("timber holds more moisture at dry-standard than plasterboard", () => {
    const timber = getMaterial("timber-framing")!;
    const gyprock = getMaterial("gyprock")!;
    expect(timber.dryStandardMc).toBeGreaterThan(gyprock.dryStandardMc);
  });

  it("filters by region", () => {
    const au = materialsForRegion("AU");
    expect(au.length).toBeGreaterThan(0);
    expect(au.every((m) => m.region.includes("AU"))).toBe(true);
  });
});
