import { describe, expect, it } from "vitest";
import {
  classifyCover,
  buildingClaim,
  NHC_BUILDING_CAP_NZD,
  NHC_FLAT_EXCESS_NZD,
  NHC_MAX_EXCESS_NZD,
} from "../nhcover";

describe("NHCover cover classification (NHI Act 2023)", () => {
  it("routes natural-hazard building damage to NHCover", () => {
    for (const cause of [
      "earthquake",
      "landslip",
      "volcanic",
      "hydrothermal",
      "tsunami",
      "fire_natural",
    ] as const) {
      const r = classifyCover(cause, "building");
      expect(r.pathway).toBe("nz_nhcover");
      expect(r.covered).toBe(true);
    }
  });

  it("routes building storm/flood damage to the PRIVATE insurer (not NHCover)", () => {
    expect(classifyCover("flood", "building").pathway).toBe("nz_private");
    expect(classifyCover("flood", "building").covered).toBe(false);
    expect(classifyCover("storm", "building").pathway).toBe("nz_private");
  });

  it("routes LAND damage from storm/flood to NHCover (land-only cover)", () => {
    expect(classifyCover("flood", "land").pathway).toBe("nz_nhcover");
    expect(classifyCover("storm", "land").covered).toBe(true);
  });

  it("routes non-natural causes to the private insurer", () => {
    expect(classifyCover("other", "building").pathway).toBe("nz_private");
    expect(classifyCover("other", "land").covered).toBe(false);
  });
});

describe("NHCover building claim calc", () => {
  it("covers up to the cap with the flat excess, no private top-up below cap", () => {
    const c = buildingClaim("earthquake", 250_000);
    expect(c.pathway).toBe("nz_nhcover");
    expect(c.nhcCoveredAmount).toBe(250_000);
    expect(c.excess).toBe(NHC_FLAT_EXCESS_NZD);
    expect(c.privateTopUp).toBe(0);
    expect(c.cappedAtNhcLimit).toBe(false);
  });

  it("caps at the building cap and routes the excess-of-cap to the private insurer", () => {
    const c = buildingClaim("earthquake", 450_000);
    expect(c.nhcCoveredAmount).toBe(NHC_BUILDING_CAP_NZD);
    expect(c.privateTopUp).toBe(450_000 - NHC_BUILDING_CAP_NZD);
    expect(c.cappedAtNhcLimit).toBe(true);
  });

  it("applies the higher excess for buildings with more than 10 insured homes", () => {
    expect(
      buildingClaim("earthquake", 250_000, { insuredHomes: 12 }).excess,
    ).toBe(NHC_MAX_EXCESS_NZD);
  });

  it("sends building storm/flood entirely to the private insurer", () => {
    const c = buildingClaim("flood", 100_000);
    expect(c.pathway).toBe("nz_private");
    expect(c.nhcCoveredAmount).toBe(0);
    expect(c.privateTopUp).toBe(100_000);
  });
});
