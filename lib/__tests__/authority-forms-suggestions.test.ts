import { describe, expect, it } from "vitest";
import {
  suggestAuthorityForms,
  extractReportAnalysis,
  type ReportAnalysis,
} from "../authority-forms-suggestions";
import { AUTHORITY_TEMPLATES } from "../documents/authority-catalogue";
import { ASBESTOS_PRESUMPTION_YEAR } from "../compliance/asbestos-era";
import { LEAD_PRESUMPTION_YEAR } from "../compliance/lead-era";

/**
 * The four spec 9.3 documents, wired into the suggestion engine.
 *
 * The property this suite is really about: an UNRECORDED input must not read as
 * a negative one. `presumeAsbestosFromEra` returns false both for a modern
 * building and for a year nobody wrote down, and collapsing those two is how a
 * hazard document silently stops being offered.
 */

// Derived from the registry rather than typed, so a threshold change moves
// these fixtures with it instead of leaving them asserting a stale year.
const PRE_ASBESTOS_AU = ASBESTOS_PRESUMPTION_YEAR.AU - 10;
const POST_ASBESTOS_AU = ASBESTOS_PRESUMPTION_YEAR.AU + 10;
const PRE_LEAD_AU = LEAD_PRESUMPTION_YEAR.AU - 10;

const base: ReportAnalysis = {};
const codes = (a: ReportAnalysis) =>
  suggestAuthorityForms(a).map((s) => s.templateCode);
const priorityOf = (a: ReportAnalysis, code: string) =>
  suggestAuthorityForms(a).find((s) => s.templateCode === code)?.priority;

describe("every suggestion points at a template that exists", () => {
  it("matches the catalogue, so a rename cannot orphan a suggestion", () => {
    // The suggestion engine holds codes as strings; nothing else checks they
    // resolve. A renamed template would surface as a form the user can be
    // offered and never open.
    const known = new Set(AUTHORITY_TEMPLATES.map((t) => t.code));
    const everySignal: ReportAnalysis = {
      waterCategory: "Category 3",
      waterClass: "4",
      equipmentDeployed: true,
      hasDemolition: true,
      hasDisposal: true,
      hasContamination: true,
      biologicalMouldDetected: true,
      methamphetamineScreen: "POSITIVE",
      hasDustGeneratingWork: true,
      propertyYearBuilt: PRE_ASBESTOS_AU,
      jurisdiction: "AU",
    };
    const suggested = codes(everySignal);
    expect(suggested.length).toBeGreaterThan(0);
    for (const code of suggested) expect(known).toContain(code);
  });

  it("suggests all four of the new documents when every signal is present", () => {
    const everySignal: ReportAnalysis = {
      equipmentDeployed: true,
      hasDemolition: true,
      hasDustGeneratingWork: true,
      propertyYearBuilt: PRE_ASBESTOS_AU,
      jurisdiction: "AU",
    };
    const suggested = codes(everySignal);
    for (const code of [
      "AUTH_ASBESTOS_ASSESSMENT",
      "SILICA_CONTROL_PLAN",
      "WHS_SITE_INDUCTION",
      "CERT_COMPLETION",
    ]) {
      expect(suggested).toContain(code);
    }
  });
});

describe("an unrecorded building year is not a modern building", () => {
  it("still offers the asbestos authority when the year is unknown", () => {
    // THE CENTRAL CASE. presumeAsbestosFromEra(null) is false, and using that
    // alone would withhold the document from every job whose year nobody typed.
    const unknownYear: ReportAnalysis = {
      hasDemolition: true,
      propertyYearBuilt: null,
      jurisdiction: "AU",
    };
    expect(codes(unknownYear)).toContain("AUTH_ASBESTOS_ASSESSMENT");
    expect(priorityOf(unknownYear, "AUTH_ASBESTOS_ASSESSMENT")).toBe("recommended");
  });

  it("still offers it when the country is unknown", () => {
    // The presumption year differs by country, so without the country there is
    // no threshold to test against.
    const unknownCountry: ReportAnalysis = {
      hasDemolition: true,
      propertyYearBuilt: PRE_ASBESTOS_AU,
      jurisdiction: null,
    };
    expect(codes(unknownCountry)).toContain("AUTH_ASBESTOS_ASSESSMENT");
  });

  it("says in the reason that the input was missing", () => {
    // A lower priority with no explanation is indistinguishable from a weak
    // guess. The reason has to name what was not recorded.
    const unknownYear: ReportAnalysis = { hasDemolition: true, jurisdiction: "AU" };
    const reason = suggestAuthorityForms(unknownYear).find(
      (s) => s.templateCode === "AUTH_ASBESTOS_ASSESSMENT",
    )?.reason;
    expect(reason).toMatch(/was not recorded/i);
  });

  it("requires it when the era IS established and material is being removed", () => {
    const established: ReportAnalysis = {
      hasDemolition: true,
      propertyYearBuilt: PRE_ASBESTOS_AU,
      jurisdiction: "AU",
    };
    expect(priorityOf(established, "AUTH_ASBESTOS_ASSESSMENT")).toBe("required");
  });

  it("does not offer it for a building outside the presumption era", () => {
    // The one case where silence is right: the year IS known and it is later
    // than the threshold. Offering the document on every job would make it
    // noise, and a caution printed on everything is a caution nobody reads.
    const modern: ReportAnalysis = {
      hasDemolition: true,
      propertyYearBuilt: POST_ASBESTOS_AU,
      jurisdiction: "AU",
    };
    expect(codes(modern)).not.toContain("AUTH_ASBESTOS_ASSESSMENT");
  });

  it("reads the threshold from the registry, not from this file", () => {
    // Sanity: the fixtures straddle the registry's own value, so if the entry
    // moves these tests move with it rather than asserting a stale year.
    expect(PRE_ASBESTOS_AU).toBeLessThan(ASBESTOS_PRESUMPTION_YEAR.AU);
    expect(POST_ASBESTOS_AU).toBeGreaterThan(ASBESTOS_PRESUMPTION_YEAR.AU);
  });
});

describe("the silica plan follows the dust, not the demolition", () => {
  it("requires it for named cutting or grinding of silica-bearing material", () => {
    const dust: ReportAnalysis = { hasDustGeneratingWork: true };
    expect(priorityOf(dust, "SILICA_CONTROL_PLAN")).toBe("required");
  });

  it("only recommends it for demolition alone", () => {
    // Demolition may be soft-strip with no dust at all.
    const demo: ReportAnalysis = { hasDemolition: true };
    expect(priorityOf(demo, "SILICA_CONTROL_PLAN")).toBe("recommended");
  });

  it("does not offer it for a job with neither", () => {
    expect(codes({ equipmentDeployed: true })).not.toContain("SILICA_CONTROL_PLAN");
  });
});

describe("the induction record follows the hazard", () => {
  it("is required when a lead-era building is being worked on", () => {
    // Lead is surfaced through the induction rather than its own document,
    // because the induction is where a presumed coating reaches the people who
    // might disturb it.
    const leadEra: ReportAnalysis = {
      propertyYearBuilt: PRE_LEAD_AU,
      jurisdiction: "AU",
    };
    expect(priorityOf(leadEra, "WHS_SITE_INDUCTION")).toBe("required");
  });

  it("is required when mould or contamination is present", () => {
    expect(priorityOf({ biologicalMouldDetected: true }, "WHS_SITE_INDUCTION")).toBe(
      "required",
    );
  });

  it("is only recommended when people simply attend to place equipment", () => {
    expect(priorityOf({ equipmentDeployed: true }, "WHS_SITE_INDUCTION")).toBe(
      "recommended",
    );
  });

  it("is not offered for a job with no hazard and nobody on site", () => {
    expect(codes(base)).not.toContain("WHS_SITE_INDUCTION");
  });
});

describe("the completion certificate stays optional", () => {
  it("is offered at the lowest priority, never required", () => {
    // The analysis carries no signal for whether works have finished, and
    // inventing one would be a guess wearing the shape of a fact.
    expect(priorityOf({ equipmentDeployed: true }, "CERT_COMPLETION")).toBe("optional");
  });

  it("is not offered when no drying equipment was ever deployed", () => {
    expect(codes({ hasDemolition: true })).not.toContain("CERT_COMPLETION");
  });
});

describe("extractReportAnalysis reads the inspection, and tolerates its absence", () => {
  it("pulls the year and country from the linked inspection", () => {
    const a = extractReportAnalysis({
      inspection: { propertyYearBuilt: PRE_ASBESTOS_AU, propertyCountry: "NZ" },
    });
    expect(a.propertyYearBuilt).toBe(PRE_ASBESTOS_AU);
    expect(a.jurisdiction).toBe("NZ");
  });

  it("returns null, not a default, for a report with no inspection", () => {
    const a = extractReportAnalysis({});
    expect(a.propertyYearBuilt).toBeNull();
    expect(a.jurisdiction).toBeNull();
  });

  it("rejects a year that is not a year", () => {
    for (const bad of [0, "", "unknown", null, undefined, 12, 9999]) {
      expect(
        extractReportAnalysis({ inspection: { propertyYearBuilt: bad } })
          .propertyYearBuilt,
      ).toBeNull();
    }
  });

  it("does not fall back to Australia for an unrecognised country", () => {
    // Falling back here would look right on almost every job and be wrong on
    // exactly the ones that matter.
    expect(
      extractReportAnalysis({ inspection: { propertyCountry: "Ireland" } })
        .jurisdiction,
    ).toBeNull();
  });

  it("detects dust-generating work only when an action meets a material", () => {
    const dust = (items: string[]) =>
      extractReportAnalysis({ scopeOfWorksData: JSON.stringify(items.map((id) => ({ id }))) })
        .hasDustGeneratingWork;

    expect(dust(["cut-concrete-slab"])).toBe(true);
    expect(dust(["grinding-render-walls"])).toBe(true);
    expect(dust(["drill-masonry-fixings"])).toBe(true);
    // An action with no silica-bearing material, and a material with no action.
    expect(dust(["cut-carpet-underlay"])).toBe(false);
    expect(dust(["replace-tile-splashback"])).toBe(false);
    expect(dust([])).toBe(false);
  });
});
