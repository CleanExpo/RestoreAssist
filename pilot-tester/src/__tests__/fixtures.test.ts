import { describe, expect, it } from "vitest";
import { SYNTHETIC_COMPANIES, findCompany } from "../companies/fixtures.js";
import { JOBS, findJob } from "../jobs/index.js";

describe("synthetic company fixtures", () => {
  it("has at least 5 companies", () => {
    expect(SYNTHETIC_COMPANIES.length).toBeGreaterThanOrEqual(5);
  });

  it("has unique keys", () => {
    const keys = SYNTHETIC_COMPANIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("each company has a 4-digit AU postcode", () => {
    for (const c of SYNTHETIC_COMPANIES) {
      expect(c.defaultPostcode).toMatch(/^\d{4}$/);
    }
  });

  it("findCompany throws on unknown key", () => {
    expect(() => findCompany("nope")).toThrow();
  });
});

describe("job templates", () => {
  it("covers all 7 assessment domains", () => {
    const domains = new Set(JOBS.map((j) => j.domain));
    expect(domains).toEqual(
      new Set([
        "WATER",
        "MOULD",
        "BIOHAZARD",
        "FIRE_SMOKE",
        "STORM",
        "HVAC",
        "AUSTRALIAN_COMPLIANCE",
      ]),
    );
  });

  it("has unique keys", () => {
    const keys = JOBS.map((j) => j.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("WATER job seeds at least 3 moisture readings", () => {
    const water = findJob("water-cat2");
    expect(water.moistureReadings.length).toBeGreaterThanOrEqual(3);
  });

  it("MOULD job carries condition + RH options", () => {
    const m = findJob("mould-cond3");
    expect(m.generateOptions?.condition).toBe("CONDITION_3");
    expect(m.generateOptions?.ambientRelativeHumidity).toBe(72);
  });

  it("STORM job declares a numeric water category", () => {
    const s = findJob("storm-stormwater");
    expect(typeof s.generateOptions?.waterCategory).toBe("number");
  });
});
