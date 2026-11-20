import { describe, expect, it } from "vitest";
import {
  CARSI_TRAINING_BY_CLAIM_TYPE,
  carsiTrainingForClaimType,
} from "../training-links";

const CLAIM_TYPES = ["WATER", "FIRE", "MOULD", "STORM", "CONTENTS", "BIOHAZARD", "ODOUR", "CARPET", "HVAC", "ASBESTOS"];

describe("carsiTrainingForClaimType", () => {
  it("covers every ClaimType in the Prisma enum", () => {
    expect(Object.keys(CARSI_TRAINING_BY_CLAIM_TYPE).sort()).toEqual([...CLAIM_TYPES].sort());
  });

  it("links water jobs to drying courses on carsi.com.au with tracking", () => {
    const t = carsiTrainingForClaimType("WATER");
    expect(t.courses.length).toBeGreaterThan(0);
    for (const c of t.courses) {
      const u = new URL(c.url);
      expect(u.origin).toBe("https://carsi.com.au");
      expect(u.pathname).toBe(`/courses/${c.slug}`);
      expect(u.searchParams.get("utm_source")).toBe("restoreassist");
      expect(u.searchParams.get("utm_campaign")).toBe("water");
    }
  });

  it("is case-insensitive", () => {
    expect(carsiTrainingForClaimType("mould").courses.map((c) => c.slug)).toEqual(
      carsiTrainingForClaimType("MOULD").courses.map((c) => c.slug),
    );
  });

  it("falls back to the catalogue for missing or unknown claim types", () => {
    for (const v of [null, undefined, "", "NOT_A_TYPE"]) {
      const t = carsiTrainingForClaimType(v);
      expect(t.courses).toEqual([]);
      expect(new URL(t.catalogueUrl).pathname).toBe("/courses");
      expect(new URL(t.catalogueUrl).searchParams.get("utm_campaign")).toBe("general");
    }
  });

  it("offers no course as training for licensed asbestos removal", () => {
    expect(carsiTrainingForClaimType("ASBESTOS").courses).toEqual([]);
  });

  it("never makes a CEC or IICRC claim in a course title", () => {
    for (const list of Object.values(CARSI_TRAINING_BY_CLAIM_TYPE)) {
      for (const c of list) expect(c.title).not.toMatch(/CEC|IICRC|certif/i);
    }
  });
});
