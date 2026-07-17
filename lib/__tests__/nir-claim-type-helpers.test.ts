import { describe, expect, it } from "vitest";
import {
  asIicrcClaimType,
  isWaterDamageClaim,
  moistureReadingsRequired,
} from "@/lib/nir-standards-mapping";

describe("NIR claim-type helpers (RA-1029)", () => {
  it("isWaterDamageClaim is true only for WATER", () => {
    expect(isWaterDamageClaim("WATER")).toBe(true);
    expect(isWaterDamageClaim("MOULD")).toBe(false);
    expect(isWaterDamageClaim("BIOHAZARD")).toBe(false);
    expect(isWaterDamageClaim("FIRE")).toBe(false);
    expect(isWaterDamageClaim(null)).toBe(false);
  });

  it("moistureReadingsRequired is true only for WATER", () => {
    expect(moistureReadingsRequired("WATER")).toBe(true);
    expect(moistureReadingsRequired("MOULD")).toBe(false);
    expect(moistureReadingsRequired(undefined)).toBe(false);
  });

  it("asIicrcClaimType narrows persisted claim types", () => {
    expect(asIicrcClaimType("MOULD")).toBe("MOULD");
    expect(asIicrcClaimType("FIRE")).toBe("FIRE");
    expect(asIicrcClaimType("CARPET")).toBeNull();
    expect(asIicrcClaimType(null)).toBeNull();
  });
});
