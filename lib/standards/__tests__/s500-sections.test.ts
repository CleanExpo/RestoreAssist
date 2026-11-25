import { describe, expect, it } from "vitest";
import { S500_SECTIONS, getS500Section } from "../s500-sections";

describe("getS500Section — verified S500-2021 recall", () => {
  it("recalls water category at §10.4.1 (verified from the licensed chapter PDF)", () => {
    expect(getS500Section("10.4.1")).toEqual({
      citationKey: "S500:2021 §10.4.1",
      title: "Category of Water",
    });
  });

  it("recalls water class at §10.4.3", () => {
    expect(getS500Section("10.4.3")?.title).toBe("Class of Water Intrusion");
  });

  it("tolerates a leading § and whitespace", () => {
    expect(getS500Section(" §12.5 ")?.title).toBe("Drying (Post-Cleaning)");
  });

  it("returns null for an unknown section (never fabricates a citation)", () => {
    expect(getS500Section("99.9")).toBeNull();
  });

  it("does NOT resolve the fabricated sections the code used to cite", () => {
    // §7.1 was wrongly used for water category; it must NOT be category.
    expect(getS500Section("7.1")?.title).not.toMatch(/category/i);
    expect(getS500Section("14")?.title).toBe(
      "Contents Evaluation, Restoration, and Remediation",
    ); // not "equipment"
  });

  it("holds exactly the 62 verified entries (16 chapters, 46 subsections)", () => {
    // Pinned, not a floor: a floor of 35 let 27 verified sections disappear
    // unnoticed. Adding or removing a verified section must change this number
    // on purpose. The marketing copy states this count, so it must stay true.
    const keys = Object.keys(S500_SECTIONS);
    expect(keys).toHaveLength(62);
    expect(keys.filter((k) => !k.includes("."))).toHaveLength(16);
  });

  it("every subsection sits under a chapter that is itself in the index", () => {
    // The index is a partial table of contents (e.g. §12.3.2 without §12.3),
    // so only the top-level chapter is required. The citation gate derives its
    // set of real chapters from these keys, so an orphan here would widen it.
    for (const key of Object.keys(S500_SECTIONS)) {
      expect(S500_SECTIONS[key.split(".")[0]], key).toBeDefined();
    }
  });

  it("recalls the §10 inspection subsections verified from the licensed chapter PDF", () => {
    // Source: "016 - Inspections, Preliminary Determinations, and Pre-Restoration
    // Evaluations.pdf" (licensed S500-2021 chapter), read 2026-06-30.
    expect(getS500Section("10.1")?.title).toBe("Introduction");
    expect(getS500Section("10.3")?.title).toBe("Documentation");
    expect(getS500Section("10.6.6")?.title).toBe(
      "Dry Standards and Drying Goals",
    );
    expect(getS500Section("10.7")?.title).toBe(
      "Pre-Remediation and Pre-Restoration Evaluation",
    );
  });

  it("uses the verified full §10.6 title (not the earlier truncated 'Initial Response')", () => {
    expect(getS500Section("10.6")?.title).toBe(
      "Initial Response, Inspection, and Preliminary Determination",
    );
  });
});
