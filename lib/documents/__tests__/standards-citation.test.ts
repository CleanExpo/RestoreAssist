import { describe, expect, it } from "vitest";
import {
  authorityTemplate,
  citedStandards,
  citesAnything,
  templateProse,
  formContentFor,
  STANDARD_DESIGNATION_IN_PROSE,
} from "../authority-catalogue";
import { buildProvenanceBlock, provenanceLines } from "../provenance";
import { STANDARDS_VERSIONS } from "../../nir-standards-mapping";

/**
 * The IICRC standards are a SECOND source of truth with the SAME jurisdiction
 * problem as the registry, and a sharper version of it.
 *
 * On an Australian job the governing document is the Standards Australia
 * adoption. It is a MODIFIED adoption whose Australian changes sit in Appendix
 * ZZ, so citing the ANSI original does not merely lose precision -- it omits
 * requirements. The two also carry different years: AS-IICRC S500:2025 adopts
 * ANSI/IICRC S500-2021. A certificate is exactly the document someone reads
 * later to decide whether the works met the standard in force, so naming the
 * wrong one is not a cosmetic error.
 */

const cert = () => authorityTemplate("CERT_COMPLETION");

describe("the certificate names the standard that governs THIS job", () => {
  it("uses the Standards Australia adoption on an Australian job", () => {
    const resolved = citedStandards(cert(), "AU");
    expect(resolved.map((r) => r.designation)).toEqual([
      "AS-IICRC S500:2025",
      "AS-IICRC S520:2025",
    ]);
    expect(resolved.every((r) => r.isAustralianAdoption)).toBe(true);
  });

  it("uses the ANSI publication on a New Zealand job", () => {
    // New Zealand has no adoption. Serving it the Australian designation would
    // name a document that does not govern the job.
    const resolved = citedStandards(cert(), "NZ");
    expect(resolved.map((r) => r.designation)).toEqual([
      STANDARDS_VERSIONS.S500.designation,
      STANDARDS_VERSIONS.S520.designation,
    ]);
    expect(resolved.some((r) => r.isAustralianAdoption)).toBe(false);
  });

  it("keeps the two countries' designations genuinely different", () => {
    // The property, not just the strings: if these ever coincide, the test
    // above would pass while proving nothing about jurisdiction-awareness.
    const au = citedStandards(cert(), "AU").map((r) => r.designation);
    const nz = citedStandards(cert(), "NZ").map((r) => r.designation);
    expect(au).not.toEqual(nz);
    for (let i = 0; i < au.length; i++) expect(au[i]).not.toBe(nz[i]);
  });

  it("names nothing when the job's country was never recorded", () => {
    // Defaulting would pick the Australian adoption for every unrecorded job.
    expect(citedStandards(cert(), null)).toEqual([]);
  });

  it("states no designation or edition year in its own prose", () => {
    const prose = templateProse(cert());
    expect(STANDARD_DESIGNATION_IN_PROSE.test(prose)).toBe(false);
    // And the guard is not vacuous: it catches both forms it exists for.
    expect(STANDARD_DESIGNATION_IN_PROSE.test("works under ANSI/IICRC S500-2021")).toBe(true);
    expect(STANDARD_DESIGNATION_IN_PROSE.test("completed per S520:2024")).toBe(true);
    expect(STANDARD_DESIGNATION_IN_PROSE.test("AS-IICRC adoption applies")).toBe(true);
    // ...and does not fire on ordinary prose that merely mentions a key.
    expect(STANDARD_DESIGNATION_IN_PROSE.test("the S500 drying goal")).toBe(false);
  });

  it("carries the standards into the rendered block and its plain-text lines", () => {
    const block = buildProvenanceBlock(cert(), "AU");
    expect(block.empty).toBe(false);
    expect(block.standards).toHaveLength(2);
    const lines = provenanceLines(block).join("\n");
    expect(lines).toContain("AS-IICRC S500:2025");
    expect(lines).toContain("Standards Australia adoption");
  });

  it("says the standard could not be named when the country is unknown", () => {
    // Silence here would read as "no standard applies".
    const block = buildProvenanceBlock(cert(), null);
    expect(block.standardsUnselected).toBe(true);
    expect(block.standards).toEqual([]);
    expect(block.notices.join(" ")).toMatch(/could not be named/i);
  });

  it("distinguishes 'cites none' from 'could not select'", () => {
    // Both give an empty standards array; only one is a problem.
    const none = buildProvenanceBlock(authorityTemplate("AUTH_COMMENCE"), "AU");
    expect(none.standards).toEqual([]);
    expect(none.standardsUnselected).toBe(false);
  });

  it("counts as a citation for the gate's hazard rule", () => {
    expect(citesAnything(cert())).toBe(true);
  });
});

describe("the WHS site induction record", () => {
  const induction = () => authorityTemplate("WHS_SITE_INDUCTION");

  it("resolves every hazard family on an Australian job", () => {
    const ids = buildProvenanceBlock(induction(), "AU").entries.map((e) => e.id);
    expect(ids).toEqual([
      "asbestos.presumption-year.au",
      "lead.presumption-year.au",
      "silica.exposure-standard.au",
      "electrical.rcd-protection.au",
      "chemicals.sds-and-register.au",
    ]);
    expect(buildProvenanceBlock(induction(), "AU").unresolved).toEqual([]);
  });

  it("gives a Victorian job Victoria's stricter silica standard", () => {
    const ids = buildProvenanceBlock(induction(), "VIC").entries.map((e) => e.id);
    expect(ids).toContain("silica.exposure-standard.vic");
    expect(ids).not.toContain("silica.exposure-standard.au");
  });

  it("never serves an Australian rule to a New Zealand induction", () => {
    // THE PROPERTY THAT MATTERS MOST HERE. This document is read by people who
    // are about to stand in the hazards it lists.
    const block = buildProvenanceBlock(induction(), "NZ");
    expect(block.entries.every((e) => e.jurisdiction === "NZ")).toBe(true);
    expect(block.entries.every((e) => !e.foreignToJob)).toBe(true);
  });

  it("reports the unheld New Zealand rules by name rather than going quiet", () => {
    // RCD protection and the SDS register are not Australian peculiarities --
    // New Zealand plainly has both duties; the registry has not seeded them. So
    // the document must say an ENTRY is missing, not imply the DUTY is.
    const block = buildProvenanceBlock(induction(), "NZ");
    expect(block.unresolved).toEqual([
      "electrical.rcd-protection",
      "chemicals.sds-and-register",
    ]);
    const notice = block.notices.find((n) =>
      n.startsWith("RestoreAssist holds no verified New Zealand entry for:"),
    );
    expect(notice).toContain("electrical.rcd-protection");
    expect(notice).toContain("not a finding that no duty applies");
  });

  it("cites every hazard by family, never by exact id", () => {
    // Citing RCD protection by exact id would print an Australian regulation on
    // a New Zealand induction under a notice reading "no verified New Zealand
    // equivalent" -- readable as "New Zealand has no RCD duty".
    const spec = induction();
    expect(spec.citesRegulations).toEqual([]);
    expect(spec.citesRegulationFamilies).toHaveLength(5);
  });

  it("selects nothing, and names all five, when the country is unrecorded", () => {
    const block = buildProvenanceBlock(induction(), null);
    expect(block.entries).toEqual([]);
    expect(block.unresolved).toHaveLength(5);
  });

  it("states no year in its prose", () => {
    expect(templateProse(induction())).not.toMatch(/\b(19|20)\d{2}\b/);
  });

  it("stores its families, and the certificate stores its standards", () => {
    expect(
      JSON.parse(formContentFor(induction())).citesRegulationFamilies,
    ).toHaveLength(5);
    expect(JSON.parse(formContentFor(cert())).citesStandards).toEqual([
      { standard: "S500" },
      { standard: "S520" },
    ]);
  });
});
