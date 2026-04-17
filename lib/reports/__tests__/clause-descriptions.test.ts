import { describe, it, expect } from "vitest";
import { CLAUSE_DESCRIPTIONS, describeClause } from "../clause-descriptions";

describe("describeClause", () => {
  it("returns the description for a known clause", () => {
    expect(describeClause("S500:2025 §7.1")).toBe(
      "General health and safety obligations for restorers",
    );
  });

  it("returns 'Standards reference' fallback for an unknown clause", () => {
    expect(describeClause("UNKNOWN §99.9")).toBe("Standards reference");
  });

  it("normalises leading and trailing whitespace before lookup", () => {
    expect(describeClause("  S500:2025 §10.5  ")).toBe(
      "Category 2 water — greywater characteristics and response",
    );
  });

  it("treats lookup as case-sensitive (lowercase variant does not match)", () => {
    // "as/nzs 4360:2004 §4.3" differs in case from the registered key
    expect(describeClause("as/nzs 4360:2004 §4.3")).toBe("Standards reference");
  });
});

describe("CLAUSE_DESCRIPTIONS", () => {
  it("contains at least 20 entries", () => {
    expect(Object.keys(CLAUSE_DESCRIPTIONS).length).toBeGreaterThanOrEqual(20);
  });
});
