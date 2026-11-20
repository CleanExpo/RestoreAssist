import { describe, it, expect } from "vitest";
import { normalizeClaimType } from "../claim-type";
import { JOB_TYPES } from "../workflow-definitions";

describe("normalizeClaimType", () => {
  it("uppercases lowercase JobType keys (the historical route default)", () => {
    expect(normalizeClaimType("water_damage")).toBe("WATER_DAMAGE");
  });

  it("accepts every JobType key already in canonical uppercase form", () => {
    for (const jobType of JOB_TYPES) {
      expect(normalizeClaimType(jobType)).toBe(jobType);
    }
  });

  it("accepts every JobType key in lowercase form", () => {
    for (const jobType of JOB_TYPES) {
      expect(normalizeClaimType(jobType.toLowerCase())).toBe(jobType);
    }
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeClaimType("  Water_Damage  ")).toBe("WATER_DAMAGE");
  });

  it("maps the unambiguous Prisma ClaimType short forms", () => {
    expect(normalizeClaimType("WATER")).toBe("WATER_DAMAGE");
    expect(normalizeClaimType("water")).toBe("WATER_DAMAGE");
    expect(normalizeClaimType("FIRE")).toBe("FIRE_SMOKE");
    expect(normalizeClaimType("MOULD")).toBe("MOULD");
    expect(normalizeClaimType("STORM")).toBe("STORM");
  });

  it("maps every Prisma ClaimType enum value to a JobType", () => {
    expect(normalizeClaimType("CONTENTS")).toBe("CONTENTS_ONLY");
    expect(normalizeClaimType("BIOHAZARD")).toBe("CLANDESTINE_HAZARDOUS");
    expect(normalizeClaimType("ODOUR")).toBe("FIRE_SMOKE");
    expect(normalizeClaimType("CARPET")).toBe("CARPET");
    expect(normalizeClaimType("HVAC")).toBe("HVAC");
    expect(normalizeClaimType("ASBESTOS")).toBe("CLANDESTINE_HAZARDOUS");
  });

  it("returns null for unknown strings", () => {
    expect(normalizeClaimType("not-a-real-claim-type")).toBeNull();
  });

  it("returns null for empty, null, or undefined input", () => {
    expect(normalizeClaimType("")).toBeNull();
    expect(normalizeClaimType(null)).toBeNull();
    expect(normalizeClaimType(undefined)).toBeNull();
  });
});
