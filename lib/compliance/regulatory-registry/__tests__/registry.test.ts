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
    expect(regulationFor("electrical", "AU")).toBeUndefined();
  });
});

/**
 * Silica is the domain where the two countries disagree on the number itself,
 * so it is the domain that proves the jurisdiction split actually bites.
 *
 * Australia: 0.05 mg/m3 eight-hour TWA. New Zealand: 0.025 mg/m3, halved by
 * WorkSafe in November 2023. Quoting the Australian figure on a New Zealand job
 * permits twice the exposure the law there allows -- a wrong answer that reads
 * exactly like a right one.
 */
describe("silica exposure standards differ across the Tasman", () => {
  it("gives Australia 0.05 and New Zealand 0.025, not one shared number", () => {
    const au = regulationFor("silica", "AU", "exposure-standard");
    const nz = regulationFor("silica", "NZ", "exposure-standard");

    expect(au?.value).toBe(0.05);
    expect(nz?.value).toBe(0.025);
    expect(nz?.value).not.toBe(au?.value);
  });

  // The fallback that serves a national rule to a state must never reach across
  // to the other country.
  it("never serves the Australian figure on a New Zealand job", () => {
    const nz = regulationFor("silica", "NZ", "exposure-standard");
    expect(nz?.jurisdiction).toBe("NZ");
    expect(nz?.instrument).toMatch(/Health and Safety at Work Act 2015/i);
    expect(nz?.instrument).not.toMatch(/Work Health and Safety Regulations/i);
  });

  /**
   * Victoria is not a model WHS jurisdiction. The figure matches Australia's,
   * the instrument does not, and citing the model WHS Regulations to a
   * Victorian technician is a wrong citation regardless of the number beside it.
   */
  it("cites the Victorian instrument in Victoria even though the figure matches", () => {
    const vic = regulationFor("silica", "VIC", "exposure-standard");
    expect(vic?.jurisdiction).toBe("VIC");
    expect(vic?.value).toBe(0.05);
    expect(vic?.instrument).toMatch(/Occupational Health and Safety Regulations 2017/i);
  });

  it("falls back to the national rule in a state with no rule of its own", () => {
    const nsw = regulationFor("silica", "NSW", "exposure-standard");
    expect(nsw?.jurisdiction).toBe("AU");
    expect(nsw?.value).toBe(0.05);
  });

  /**
   * New Zealand has not banned engineered stone. The absence of a ban is a
   * claim the product can get wrong, so it is recorded rather than left to a
   * lookup that would quietly hand back Australia's prohibition.
   */
  it("does not assert Australia's engineered stone ban in New Zealand", () => {
    expect(regulationFor("silica", "AU", "engineered-stone-ban")?.jurisdiction).toBe(
      "AU",
    );
    expect(regulationFor("silica", "NZ", "engineered-stone-ban")).toBeUndefined();

    const nzStatus = regulation("silica.engineered-stone-status.nz");
    expect(nzStatus.requirement).toMatch(/has not prohibited engineered stone/i);
  });

  // Victoria's ban carries no transitional period; the model jurisdictions'
  // does. A single "banned from 1 July 2024" string loses that distinction.
  it("keeps Victoria's lack of a transitional period distinct from the model rule", () => {
    const au = regulation("silica.engineered-stone-ban.au");
    const vic = regulation("silica.engineered-stone-ban.vic");

    expect(au.requirement).toMatch(/31 December 2024/);
    expect(vic.requirement).toMatch(/NO transitional period/);
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
