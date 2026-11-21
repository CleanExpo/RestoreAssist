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

  it("returns null for unmapped Prisma ClaimType values", () => {
    expect(normalizeClaimType("CONTENTS")).toBeNull();
    expect(normalizeClaimType("BIOHAZARD")).toBeNull();
    expect(normalizeClaimType("ODOUR")).toBeNull();
    expect(normalizeClaimType("CARPET")).toBeNull();
    expect(normalizeClaimType("HVAC")).toBeNull();
    expect(normalizeClaimType("ASBESTOS")).toBeNull();
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
