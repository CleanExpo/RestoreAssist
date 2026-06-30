import { describe, it, expect } from "vitest";
import { CLAUSE_DESCRIPTIONS, describeClause } from "../clause-descriptions";

describe("describeClause", () => {
  it("returns the description for a known clause", () => {
    expect(describeClause("S500:2021 §8")).toBe(
      "General health and safety obligations for restorers",
    );
  });

  it("returns 'Standards reference' fallback for an unknown clause", () => {
    expect(describeClause("UNKNOWN §99.9")).toBe("Standards reference");
  });

  it("normalises leading and trailing whitespace before lookup", () => {
    expect(describeClause("  S500:2021 §10.4.1  ")).toBe(
      "Category of water — Category 1/2/3 (clean/grey/black) characteristics and classification",
    );
  });

  it("treats lookup as case-sensitive (lowercase variant does not match)", () => {
    // "as/nzs 4360:2004 §4.3" differs in case from the registered key
    expect(describeClause("as/nzs 4360:2004 §4.3")).toBe("Standards reference");
  });

  it("falls back to the verified S500 index title for an S500 ref not in the table", () => {
    // §7.1 is a core ref emitted by the forensic report but is NOT a key in
    // CLAUSE_DESCRIPTIONS; it must recall its verified title, not the placeholder.
    expect(describeClause("S500:2021 §7.1")).toBe(
      "Antimicrobial (biocide) Use in Water Damage Projects",
    );
  });

  it("prefers the explicit table over the verified index for S500 refs in both", () => {
    // §10.4.1 is in both; the richer hand-authored description must win.
    expect(describeClause("S500:2021 §10.4.1")).toBe(
      "Category of water — Category 1/2/3 (clean/grey/black) characteristics and classification",
    );
  });

  it("resolves the report's other hardcoded core ref §10.1 via the verified index", () => {
    // generate-forensic-report-pdf.ts also emits §10.1; it is not in the table
    // but is a verified S500 section ("Introduction" to the Inspections chapter).
    expect(describeClause("S500:2021 §10.1")).toBe("Introduction");
  });

  it("returns the fallback for an S500 ref absent from both table and index", () => {
    // §11.5 is neither in CLAUSE_DESCRIPTIONS nor the verified index.
    expect(describeClause("S500:2021 §11.5")).toBe("Standards reference");
  });
});

describe("CLAUSE_DESCRIPTIONS", () => {
  it("contains at least 20 entries", () => {
    expect(Object.keys(CLAUSE_DESCRIPTIONS).length).toBeGreaterThanOrEqual(20);
  });
});
