import { describe, expect, it } from "vitest";
import { resolveJobJurisdiction } from "../job-jurisdiction";
import { authorityTemplate } from "../authority-catalogue";
import { buildProvenanceBlock } from "../provenance";

/**
 * The job's country decides whether a cited rule governs it. Getting this wrong
 * is the failure the provenance block exists to prevent, so the resolver is
 * built to say "not recorded" rather than guess.
 */
describe("resolveJobJurisdiction", () => {
  it("trusts a positive New Zealand answer", () => {
    const r = resolveJobJurisdiction({ inspectionPropertyCountry: "NZ" });
    expect(r.jurisdiction).toBe("NZ");
    expect(r.basis).toBe("inspection.propertyCountry");
    // Nobody sets NZ by accident, so this one is unambiguous.
    expect(r.mayBeSchemaDefault).toBe(false);
  });

  /**
   * Inspection.propertyCountry is `@default("AU")`, so a stored "AU" is
   * indistinguishable from "nobody recorded one". The value is used, but the
   * ambiguity is carried forward rather than dropped.
   */
  it("flags an Australian answer as possibly the schema default", () => {
    const r = resolveJobJurisdiction({ inspectionPropertyCountry: "AU" });
    expect(r.jurisdiction).toBe("AU");
    expect(r.mayBeSchemaDefault).toBe(true);
  });

  it("falls back to the organisation when the job has no inspection", () => {
    const r = resolveJobJurisdiction({ organisationCountry: "NZ" });
    expect(r.jurisdiction).toBe("NZ");
    expect(r.basis).toBe("organisation.country");
  });

  it("prefers the inspection over the organisation", () => {
    const r = resolveJobJurisdiction({
      inspectionPropertyCountry: "NZ",
      organisationCountry: "AU",
    });
    expect(r.jurisdiction).toBe("NZ");
    expect(r.basis).toBe("inspection.propertyCountry");
  });

  /**
   * The case that must NOT silently become "AU". Report has no country field,
   * and defaulting here is how a New Zealand job receives Australian law.
   */
  it("returns null when nothing recorded a country", () => {
    for (const input of [
      {},
      { inspectionPropertyCountry: null, organisationCountry: null },
      { inspectionPropertyCountry: "" },
      { inspectionPropertyCountry: "Mars" },
    ]) {
      const r = resolveJobJurisdiction(input);
      expect(r.jurisdiction).toBeNull();
      expect(r.basis).toBe("not-recorded");
    }
  });

  it("accepts the spelled-out country names", () => {
    expect(
      resolveJobJurisdiction({ inspectionPropertyCountry: "New Zealand" })
        .jurisdiction,
    ).toBe("NZ");
    expect(
      resolveJobJurisdiction({ organisationCountry: "australia" }).jurisdiction,
    ).toBe("AU");
  });
});

describe("provenance under an uncertain jurisdiction", () => {
  const chemical = authorityTemplate("AUTH_CHEMICAL");

  it("says the country was not recorded rather than assuming Australia", () => {
    const block = buildProvenanceBlock(chemical, null);
    expect(block.empty).toBe(false);
    expect(block.notices[0]).toMatch(/was not recorded/i);
    expect(block.notices[0]).toMatch(/cannot confirm/i);
    // It must NOT claim the rule is foreign either — we do not know.
    expect(block.entries[0].foreignToJob).toBe(false);
    expect(block.notices.some((n) => /does not govern this job/i.test(n))).toBe(
      false,
    );
  });

  it("discloses when an Australian answer may be the schema default", () => {
    const block = buildProvenanceBlock(chemical, "AU", {
      mayBeSchemaDefault: true,
    });
    expect(
      block.notices.some((n) => /defaults to Australia/i.test(n)),
    ).toBe(true);
    expect(block.notices.some((n) => /If this is a New Zealand job/i.test(n))).toBe(
      true,
    );
  });

  it("does not add that caveat when the country was confirmed", () => {
    const block = buildProvenanceBlock(chemical, "AU", {
      mayBeSchemaDefault: false,
    });
    expect(block.notices.some((n) => /defaults to Australia/i.test(n))).toBe(
      false,
    );
  });

  // A New Zealand job already gets the stronger "does not govern" notice; the
  // default caveat would be noise on top of it.
  it("does not stack the default caveat onto the foreign-law warning", () => {
    const block = buildProvenanceBlock(chemical, "NZ", {
      mayBeSchemaDefault: true,
    });
    expect(block.notices[0]).toMatch(/does not govern this job/i);
    expect(block.notices.some((n) => /defaults to Australia/i.test(n))).toBe(
      false,
    );
  });
});
