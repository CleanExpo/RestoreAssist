import { describe, expect, it } from "vitest";
import {
  AUTHORITY_TEMPLATES,
  authorityTemplate,
  citesAnything,
  familyCandidates,
  resolveFamily,
  templateProse,
  formContentFor,
  TEMPLATE_HAZARD_KEYWORD,
  type RegulationFamily,
} from "../authority-catalogue";
import { buildProvenanceBlock } from "../provenance";

/**
 * Citation by FAMILY: the rule is named, the country is chosen per job.
 *
 * The defect this exists to prevent is subtle and would have read as correct.
 * Citing both `asbestos.presumption-year.au` and `.nz` renders both entries,
 * and the foreign-entry notice then tells an Australian reader that
 * "RestoreAssist holds no verified Australian equivalent" while the Australian
 * entry sits immediately above it. Nothing throws; the document is simply
 * wrong in a way only a reader who already knew the answer would catch.
 */

const PRESUMPTION: RegulationFamily = {
  domain: "asbestos",
  rule: "presumption-year",
};

describe("family resolution picks the job's country, and never another's", () => {
  it("gives each country its own asbestos entry", () => {
    expect(resolveFamily(PRESUMPTION, "AU")?.id).toBe(
      "asbestos.presumption-year.au",
    );
    expect(resolveFamily(PRESUMPTION, "NZ")?.id).toBe(
      "asbestos.presumption-year.nz",
    );
  });

  it("falls back from an Australian state to the national entry", () => {
    // A state with no entry of its own is still Australian, so the national
    // rule is the right answer rather than silence.
    for (const state of ["NSW", "QLD", "VIC", "WA", "SA", "TAS", "ACT", "NT"] as const) {
      expect(resolveFamily(PRESUMPTION, state)?.id).toBe(
        "asbestos.presumption-year.au",
      );
    }
  });

  it("prefers a state's own entry over the national one", () => {
    // Victoria's silica exposure standard is stricter than the national one.
    // Falling back here would under-state the duty on a Victorian job.
    const exposure: RegulationFamily = {
      domain: "silica",
      rule: "exposure-standard",
    };
    expect(resolveFamily(exposure, "VIC")?.id).toBe("silica.exposure-standard.vic");
    expect(resolveFamily(exposure, "NSW")?.id).toBe("silica.exposure-standard.au");
  });

  it("NEVER hands a New Zealand job an Australian rule", () => {
    // The single most important property here. An AU-only family must resolve
    // to nothing on a NZ job, not to the Australian entry.
    const auOnly: RegulationFamily = {
      domain: "silica",
      rule: "crystalline-silica-substance-regime",
    };
    expect(resolveFamily(auOnly, "AU")?.id).toBe(
      "silica.crystalline-silica-substance-regime.au",
    );
    expect(resolveFamily(auOnly, "NZ")).toBeUndefined();
  });

  it("resolves nothing when the job's country was never recorded", () => {
    // Guessing here would always guess Australia, and would therefore always
    // look right. See lib/documents/job-jurisdiction.ts.
    expect(resolveFamily(PRESUMPTION, null)).toBeUndefined();
  });

  it("matches the id's rule segment exactly, not by substring", () => {
    // The over-match runs from SHORT rule to long id, not the other way. The
    // first version of this test asserted that "engineered-stone-ban" excluded
    // `engineered-stone-import-ban.au` -- which substring matching excludes too,
    // because the id reads "...-import-ban". It passed under sabotage and
    // guarded nothing.
    //
    // A rule that is a PREFIX of several real rules is the discriminator: under
    // substring matching "engineered-stone" pulls in the workplace ban, the
    // customs ban and New Zealand's no-ban status all at once, and the document
    // renders whichever was declared first.
    const prefix = familyCandidates({ domain: "silica", rule: "engineered-stone" });
    expect(prefix).toEqual([]);

    // Same shape in the domain that matters most.
    expect(familyCandidates({ domain: "asbestos", rule: "presumption" })).toEqual([]);

    // And the exact rule still resolves, so this is not just rejecting everything.
    expect(
      familyCandidates({ domain: "silica", rule: "engineered-stone-ban" }).map(
        (e) => e.id,
      ),
    ).toEqual(["silica.engineered-stone-ban.au", "silica.engineered-stone-ban.vic"]);
  });

  it("covers every alternative a multi-rule family names", () => {
    const ids = familyCandidates({
      domain: "asbestos",
      rule: ["register-requirement", "register-exemption"],
    }).map((e) => e.id);
    // Set membership, not order: candidates come back in registry declaration
    // order, which is incidental. Asserting the order would couple this test to
    // where someone happened to put an entry in asbestos.ts.
    expect(new Set(ids)).toEqual(
      new Set([
        "asbestos.register-requirement.nsw",
        "asbestos.register-exemption.qld",
      ]),
    );
    // Still exact-segment: a prefix of both matches neither.
    expect(familyCandidates({ domain: "asbestos", rule: "register" })).toEqual([]);
  });

  it("reports no candidates for a rule the registry does not hold", () => {
    expect(familyCandidates({ domain: "asbestos", rule: "no-such-rule" })).toEqual(
      [],
    );
  });
});

describe("the two new documents cite what they are about", () => {
  it("cites asbestos by family so each country gets its own presumption", () => {
    const spec = authorityTemplate("AUTH_ASBESTOS_ASSESSMENT");
    expect(spec.citesRegulationFamilies).toContainEqual(PRESUMPTION);
    expect(citesAnything(spec)).toBe(true);
  });

  it("keeps the silica plan's Australia-only duty as an exact id", () => {
    // Cited by id ON PURPOSE: no verified New Zealand counterpart exists, so
    // the provenance block should mark it foreign rather than silently drop it.
    const spec = authorityTemplate("SILICA_CONTROL_PLAN");
    expect(spec.citesRegulations).toContain(
      "silica.crystalline-silica-substance-regime.au",
    );
    expect(spec.citesRegulationFamilies).toContainEqual({
      domain: "silica",
      rule: "exposure-standard",
    });
  });

  it("states no year anywhere in either document's prose", () => {
    // The presumption year differs by country and already caused a 1995
    // building to be reported asbestos-free when it lived in four files. It
    // reaches the page through the resolved registry entry, never through a
    // string typed here. Asserting on ANY four-digit year rather than on the
    // gate's threshold pattern: these two documents have no legitimate reason
    // to carry a year at all, so the stricter assertion is still the property.
    for (const code of ["AUTH_ASBESTOS_ASSESSMENT", "SILICA_CONTROL_PLAN"]) {
      expect(templateProse(authorityTemplate(code))).not.toMatch(/\b(19|20)\d{2}\b/);
    }
  });

  it("would be caught by the gate if either stopped citing", () => {
    // The #2158 invariant, extended to the family form: a template whose prose
    // names a hazard must be one the hazard-keyword rule can see.
    for (const code of ["AUTH_ASBESTOS_ASSESSMENT", "SILICA_CONTROL_PLAN"]) {
      expect(TEMPLATE_HAZARD_KEYWORD.test(templateProse(authorityTemplate(code)))).toBe(
        true,
      );
    }
  });

  it("carries the families into the stored formContent", () => {
    const stored = JSON.parse(formContentFor(authorityTemplate("AUTH_ASBESTOS_ASSESSMENT")));
    expect(stored.citesRegulationFamilies).toContainEqual(PRESUMPTION);
  });

  it("leaves the five original templates' stored JSON untouched", () => {
    // They are already seeded in live databases; an added key churns every row.
    for (const code of [
      "AUTH_COMMENCE",
      "AUTH_DISPOSE",
      "AUTH_NO_REMOVE",
      "AUTH_CHEMICAL",
      "AUTH_EXTENDED_DRYING",
    ]) {
      expect(
        Object.keys(JSON.parse(formContentFor(authorityTemplate(code)))),
      ).toEqual(["fields", "defaultSignatories", "citesRegulations"]);
    }
  });
});

describe("the provenance block a job actually renders", () => {
  const asbestos = () => authorityTemplate("AUTH_ASBESTOS_ASSESSMENT");

  it("shows the Australian presumption on an Australian job, and no NZ entry", () => {
    const block = buildProvenanceBlock(asbestos(), "AU");
    const ids = block.entries.map((e) => e.id);
    expect(ids).toContain("asbestos.presumption-year.au");
    expect(ids).not.toContain("asbestos.presumption-year.nz");
    expect(block.entries.every((e) => !e.foreignToJob)).toBe(true);
  });

  it("shows the New Zealand presumption on a New Zealand job, and no AU entry", () => {
    const block = buildProvenanceBlock(asbestos(), "NZ");
    const ids = block.entries.map((e) => e.id);
    expect(ids).toContain("asbestos.presumption-year.nz");
    expect(ids).not.toContain("asbestos.presumption-year.au");
  });

  it("does not report the OTHER state's rule as missing", () => {
    // CodeRabbit's finding on #2167, reproduced before it was fixed. NSW
    // requires an asbestos register; Queensland exempts a class of premises
    // from one. Cited as two families, an NSW document read "no verified
    // Australian entry for asbestos.register-exemption" -- which says we have a
    // coverage gap, when Queensland's rule simply does not apply in NSW.
    //
    // One family, two answers to the same question. Whichever applies resolves,
    // and nothing is reported missing.
    const nsw = buildProvenanceBlock(asbestos(), "NSW");
    expect(nsw.unresolved).toEqual([]);
    expect(nsw.notices.join(" ")).not.toMatch(/no verified Australian entry for/);

    const qld = buildProvenanceBlock(asbestos(), "QLD");
    expect(qld.unresolved).toEqual([]);
    expect(qld.notices.join(" ")).not.toMatch(/no verified Australian entry for/);
  });

  it("resolves one family to whichever alternative that state actually has", () => {
    const nsw = buildProvenanceBlock(asbestos(), "NSW").entries.map((e) => e.id);
    expect(nsw).toContain("asbestos.register-requirement.nsw");
    expect(nsw).not.toContain("asbestos.register-exemption.qld");

    const qld = buildProvenanceBlock(asbestos(), "QLD").entries.map((e) => e.id);
    expect(qld).toContain("asbestos.register-exemption.qld");
    expect(qld).not.toContain("asbestos.register-requirement.nsw");
  });

  it("says an unheld rule was looked for, rather than going silent", () => {
    // Victoria has no seeded register entry. The document must not simply omit
    // the line: an absence of a checked entry is not a finding that no duty
    // applies, and a Victorian reader is entitled to know which it is.
    const block = buildProvenanceBlock(asbestos(), "VIC");
    expect(block.unresolved).toContain(
      "asbestos.register-requirement/register-exemption",
    );
    // `[^.]*` here would never match: the family labels themselves contain
    // dots. Anchor on the sentence and assert the label separately.
    const notice = block.notices.find((n) =>
      n.startsWith("RestoreAssist holds no verified Australian entry for:"),
    );
    expect(notice).toContain("asbestos.register-requirement/register-exemption");
    expect(block.notices.join(" ")).toMatch(/not a finding that no duty applies/i);
  });

  it("selects nothing, and says so, when the job's country is unrecorded", () => {
    const block = buildProvenanceBlock(asbestos(), null);
    expect(block.empty).toBe(false);
    expect(block.entries).toEqual([]);
    expect(block.notices.join(" ")).toMatch(/could not select the requirements/i);
    expect(block.notices.join(" ")).toMatch(/asbestos\.presumption-year/);
  });

  it("names the foreign instrument instead of disclaiming the whole block", () => {
    // The silica plan on a NZ job holds BOTH an Australian entry (foreign) and
    // the New Zealand exposure standard (local). The unnamed version of this
    // notice would read as though the local entry were foreign too.
    const block = buildProvenanceBlock(authorityTemplate("SILICA_CONTROL_PLAN"), "NZ");
    const ids = block.entries.map((e) => e.id);
    expect(ids).toContain("silica.crystalline-silica-substance-regime.au");
    expect(ids).toContain("silica.exposure-standard.nz");

    // Singular here -- one entry is foreign -- so match both inflections
    // rather than the plural the first draft of this test assumed.
    const foreignNotice = block.notices.find((n) => /does not govern|do not govern/.test(n));
    expect(foreignNotice).toBeDefined();
    const auEntry = block.entries.find(
      (e) => e.id === "silica.crystalline-silica-substance-regime.au",
    )!;
    expect(foreignNotice).toContain(auEntry.instrument);
  });

  it("renders no block at all for a template that cites nothing", () => {
    // A caution printed on everything is a caution nobody reads.
    const block = buildProvenanceBlock(authorityTemplate("AUTH_COMMENCE"), "AU");
    expect(block.empty).toBe(true);
    expect(block.unresolved).toEqual([]);
  });

  it("renders a rule cited both ways only once", () => {
    const spec = {
      ...authorityTemplate("SILICA_CONTROL_PLAN"),
      citesRegulations: ["silica.exposure-standard.au"],
    };
    const ids = buildProvenanceBlock(spec, "AU").entries.map((e) => e.id);
    expect(ids.filter((id) => id === "silica.exposure-standard.au")).toHaveLength(1);
  });
});

describe("citesAnything sees both citation forms", () => {
  it("is true for a family-only template", () => {
    expect(citesAnything(authorityTemplate("AUTH_ASBESTOS_ASSESSMENT"))).toBe(true);
  });

  it("is false only when a template cites nothing at all", () => {
    expect(citesAnything(authorityTemplate("AUTH_COMMENCE"))).toBe(false);
  });

  it("agrees with the catalogue: nothing cites a family the registry lacks", () => {
    for (const spec of AUTHORITY_TEMPLATES) {
      for (const family of spec.citesRegulationFamilies ?? []) {
        expect(familyCandidates(family).length).toBeGreaterThan(0);
      }
    }
  });
});
