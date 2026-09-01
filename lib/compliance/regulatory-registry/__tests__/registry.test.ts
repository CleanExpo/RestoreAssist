import { describe, expect, it } from "vitest";
import {
  REGULATORY_ENTRIES,
  REGULATORY_DOMAINS,
  regulation,
  regulationFor,
  regulatoryIds,
} from "../index";
import { asbestosEraBasis, presumeAsbestosFromEra } from "../../asbestos-era";

/**
 * The registry's job is to make a regulation impossible to state without its
 * source. `scripts/check-regulatory-registry.ts` enforces that at build time --
 * all four of its rules were watched failing before it was trusted. These cover
 * the runtime half: the lookups, and the asbestos consumer that used to own the
 * dates itself.
 */
describe("regulatory registry", () => {
  it("throws on an unknown id rather than rendering a blank where the law goes", () => {
    expect(() => regulation("asbestos.presumption-year.invented")).toThrow(
      /Unknown regulatory entry/i,
    );
  });

  it("carries an instrument, a source and a verification date on every entry", () => {
    for (const entry of REGULATORY_ENTRIES) {
      expect(entry.instrument).toBeTruthy();
      expect(entry.sourceUrl).toMatch(/^https:\/\//);
      expect(entry.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  /**
   * The environment that seeded these could not reach the regulators' own pages
   * (egress policy). That is recorded per entry rather than hidden, so the gap
   * is auditable before the registry supports a commercial claim.
   */
  it("records how each entry was verified, so a weaker check stays visible", () => {
    for (const e of REGULATORY_ENTRIES) {
      expect([
        "primary-source",
        "secondary-quoting-primary",
        "owner-confirmed",
      ]).toContain(e.verification);
    }
  });

  it("has unique ids and only spec-covered domains", () => {
    const ids = regulatoryIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of REGULATORY_ENTRIES) {
      expect(REGULATORY_DOMAINS).toContain(entry.domain);
    }
  });
});

describe("regulationFor", () => {
  it("prefers a state rule over the national one", () => {
    expect(regulationFor("asbestos", "NSW", "register")?.jurisdiction).toBe("NSW");
    expect(regulationFor("asbestos", "QLD", "register")?.jurisdiction).toBe("QLD");
  });

  // Serving an Australian rule on a NZ job is how a product tells a technician
  // the wrong law with total confidence.
  it("returns undefined rather than the Australian answer for an uncovered domain", () => {
    expect(regulationFor("silica", "NZ")).toBeUndefined();
    expect(regulationFor("electrical", "AU")).toBeUndefined();
  });
});

describe("asbestos-era reads the registry rather than its own copy", () => {
  it("presumes ACM through to the end of the Australian ban year", () => {
    expect(presumeAsbestosFromEra(2003, "AU")).toBe(true);
    expect(presumeAsbestosFromEra(2004, "AU")).toBe(false);
  });

  it("uses New Zealand's earlier threshold on a NZ job", () => {
    expect(presumeAsbestosFromEra(1999, "NZ")).toBe(true);
    expect(presumeAsbestosFromEra(2001, "NZ")).toBe(false);
    // The case the old flat pre-1990 rule got wrong in both countries.
    expect(presumeAsbestosFromEra(1995, "AU")).toBe(true);
  });

  it("carries the instrument and source into the guidance a document shows", () => {
    const au = asbestosEraBasis("AU");
    expect(au.year).toBe(2004);
    expect(au.authority).toMatch(/Work Health and Safety Regulations/i);
    expect(au.authority).toContain("https://");
    expect(au.guidance).toMatch(/before 2004/i);
  });

  // An unknown build year is not evidence of asbestos, and flagging every blank
  // field trains technicians to dismiss the hazard.
  it("does not presume asbestos from a missing build year", () => {
    expect(presumeAsbestosFromEra(null, "AU")).toBe(false);
    expect(presumeAsbestosFromEra(undefined, "AU")).toBe(false);
  });
});
