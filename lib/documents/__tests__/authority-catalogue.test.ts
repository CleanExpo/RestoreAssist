import { describe, expect, it } from "vitest";
import {
  AUTHORITY_TEMPLATES,
  authorityTemplate,
  citedRegulations,
  formContentFor,
} from "../authority-catalogue";
import { regulatoryIds } from "../../compliance/regulatory-registry";

/**
 * The catalogue is the registry's first consumer. These cover the runtime half;
 * `scripts/check-regulatory-registry.ts` rule 5 covers the build half, and all
 * three of its branches were watched failing before being trusted.
 */
describe("authority catalogue", () => {
  it("keeps template codes unique and stable", () => {
    const codes = AUTHORITY_TEMPLATES.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    // These five are already seeded in live databases and referenced by
    // lib/authority-forms-suggestions.ts; renaming one orphans existing rows.
    for (const code of [
      "AUTH_COMMENCE",
      "AUTH_DISPOSE",
      "AUTH_NO_REMOVE",
      "AUTH_CHEMICAL",
      "AUTH_EXTENDED_DRYING",
    ]) {
      expect(codes).toContain(code);
    }
  });

  it("cites only registry entries that exist", () => {
    const known = new Set(regulatoryIds());
    for (const spec of AUTHORITY_TEMPLATES) {
      for (const id of spec.citesRegulations) {
        expect(known.has(id)).toBe(true);
      }
    }
  });

  /**
   * The defect this catalogue was built for. A client consenting to an
   * antimicrobial being applied to their home had no regulatory grounding at
   * all: one free-text box, and whatever the technician typed became the
   * authority.
   */
  it("grounds the chemical treatment authority in the registration duty", () => {
    const chemical = authorityTemplate("AUTH_CHEMICAL");
    expect(chemical.citesRegulations).toContain(
      "chemicals.antimicrobial-registration.au",
    );

    const cited = citedRegulations(chemical);
    expect(cited).toHaveLength(1);
    expect(cited[0].instrument).toMatch(/APVMA/);
    // The provenance block the document renders carries the source and the
    // date it was checked, per spec 10.
    expect(cited[0].sourceUrl).toMatch(/^https:\/\//);
    expect(cited[0].verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cited[0].verification).toBe("secondary-quoting-primary");
  });

  it("records the product and its registration number, not just free text", () => {
    const fields = authorityTemplate("AUTH_CHEMICAL").fields.map((f) => f.id);
    expect(fields).toContain("productName");
    expect(fields).toContain("productRegistrationNumber");
  });

  /**
   * A template must not restate a rule in prose. It cites an id and the
   * requirement is resolved from the registry, so the two cannot drift.
   */
  it("stores citations as ids, never as the rule's wording", () => {
    for (const spec of AUTHORITY_TEMPLATES) {
      const prose = [
        spec.name,
        spec.description,
        ...spec.fields.flatMap((f) => [f.label, f.help ?? ""]),
      ].join(" ");
      // No year thresholds: the "pre-1990" shape in a customer-facing surface.
      expect(prose).not.toMatch(/\b(19[5-9]\d|20[0-4]\d)\b/);
      for (const id of spec.citesRegulations) {
        expect(prose).not.toContain(id);
      }
    }
  });

  it("throws on an unknown template rather than rendering an empty document", () => {
    expect(() => authorityTemplate("AUTH_INVENTED")).toThrow(
      /Unknown authority template/i,
    );
  });

  /**
   * The seed writes this string into AuthorityFormTemplate.formContent. If the
   * citations were dropped here the database would hold a template that renders
   * without its provenance block while the catalogue looked correct.
   */
  it("carries citations through into the seeded formContent", () => {
    const parsed = JSON.parse(formContentFor(authorityTemplate("AUTH_CHEMICAL")));
    expect(parsed.citesRegulations).toEqual([
      "chemicals.antimicrobial-registration.au",
    ]);
    expect(parsed.fields.map((f: { id: string }) => f.id)).toContain(
      "productRegistrationNumber",
    );
    expect(parsed.defaultSignatories).toEqual(["CLIENT"]);
  });
});
