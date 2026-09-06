import { describe, expect, it } from "vitest";
import {
  effectiveFromRange,
  REGULATORY_ENTRIES,
  REGULATORY_DOMAINS,
  regulation,
  regulationFor,
  regulatoryIds,
} from "../index";
import { asbestosEraBasis, presumeAsbestosFromEra } from "../../asbestos-era";
import { leadEraBasis, presumeLeadFromEra } from "../../lead-era";
import { resolveNccEdition } from "../../../anz/ncc-adoption";

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
    // Every domain in REGULATORY_DOMAINS is now seeded, so the uncovered case is
    // a jurisdiction with no rule and no national fallback: NZ never inherits AU.
    expect(regulationFor("asbestos", "NZ", "register")).toBeUndefined();
  });
});

/**
 * Electrical. The domain a water-damage job touches before any drying kit is
 * plugged in, and the one where the shared standard hides a split legal route.
 */
describe("electrical", () => {
  /**
   * The restoration-critical rule, and it is not in a wiring standard: a
   * flood-inundated installation is inspected and certified BEFORE supply comes
   * back. Energising a dehumidifier off a wet board skips a step the law does
   * not treat as optional.
   */
  it("requires inspection before an inundated installation is re-energised", () => {
    const au = regulation("electrical.flood-reconnection-inspection.au");
    expect(au.requirement).toMatch(/before supply is reconnected/i);
    expect(au.requirement).toMatch(/licensed electrical worker/i);
    // Submerged protective devices are replaced, not dried and re-used.
    expect(au.requirement).toMatch(/replaced rather than dried/i);
  });

  it("keeps convenience out of the energised-work exceptions", () => {
    const r = regulation("electrical.energised-work-prohibition.au").requirement;
    expect(r).toMatch(/prohibited/i);
    expect(r).toMatch(/convenience is expressly not an exception/i);
  });

  it("carries the RCD trip threshold as a number, not prose", () => {
    expect(regulationFor("electrical", "AU", "rcd")?.value).toBe(30);
  });

  /**
   * AS/NZS 3000 is a joint standard, so the figure and the document are shared
   * -- but New Zealand reaches it through the Electricity (Safety) Regulations
   * 2010 and the EWRB, not through work health and safety regulations. Same
   * trap as Victoria in the silica domain: right document, wrong legal hook.
   */
  it("cites New Zealand's own legal route to the shared Wiring Rules", () => {
    const nz = regulationFor("electrical", "NZ", "wiring-rules");
    expect(nz?.jurisdiction).toBe("NZ");
    expect(nz?.instrument).toMatch(/Electricity \(Safety\) Regulations 2010/i);

    const au = regulationFor("electrical", "AU", "wiring-rules");
    expect(au?.jurisdiction).toBe("AU");
    expect(au?.instrument).not.toMatch(/Electricity \(Safety\) Regulations/i);
  });

  it("does not serve the Australian WHS prohibition on a New Zealand job", () => {
    expect(
      regulationFor("electrical", "NZ", "energised-work-prohibition"),
    ).toBeUndefined();
    expect(
      regulationFor("electrical", "NZ", "prescribed-work-certification")
        ?.jurisdiction,
    ).toBe("NZ");
  });

  /**
   * A deliberate ABSENCE, pinned so it cannot be quietly filled in.
   *
   * Three files in this repo apply an "80% continuous-load rule" and disagree
   * about whether its authority is AS/NZS 3000 or AS/NZS 3012. The 80%/125%
   * continuous-load construct belongs to the US National Electrical Code;
   * AS/NZS 3000 sizes circuits by maximum demand and diversity instead. The
   * derate may be sound engineering, but the citation is unproven, and settling
   * it needs the licensed standard text. Until then it must not enter the
   * registry wearing a source it may not have.
   */
  it("does not assert an 80% derate it cannot source", () => {
    const electrical = REGULATORY_ENTRIES.filter((e) => e.domain === "electrical");
    expect(electrical.length).toBeGreaterThan(0);
    for (const e of electrical) {
      expect(e.requirement).not.toMatch(/80\s*%/);
      expect(e.requirement).not.toMatch(/continuous[- ]load/i);
    }
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

/**
 * Commencement precision.
 *
 * CodeRabbit caught this on #2154: New Zealand's silica reduction was written
 * `2023-11-01` when only "November 2023" had been established. The contract
 * called effectiveFrom an exact date, so the unknown day got padded to the
 * first of the month -- which asserts a commencement nobody verified and reads
 * as exact to any date comparison. A rule could be reported in force three
 * weeks before it was.
 *
 * The fix is to let the field say less when less is known, and to make the
 * partial forms mean an interval rather than a point.
 */
/**
 * Chemicals and VOCs. Three claims here are easy to state confidently and
 * wrongly, and a restoration report makes all three in passing.
 */
describe("chemicals", () => {
  /**
   * Western Australia moved to GHS 7 three months after everyone else. A
   * compliance line citing 1 January 2023 is wrong for a WA workplace in that
   * window -- the state-over-national fallback has to land on the state.
   */
  it("gives Western Australia its own later GHS date", () => {
    const wa = regulationFor("chemicals", "WA", "ghs");
    const au = regulationFor("chemicals", "AU", "ghs");
    expect(wa?.jurisdiction).toBe("WA");
    expect(wa?.effectiveFrom).toBe("2023-03-31");
    expect(au?.effectiveFrom).toBe("2023-01-01");
    expect(wa?.effectiveFrom).not.toBe(au?.effectiveFrom);
  });

  it("falls back to the national GHS date in a state with no rule of its own", () => {
    expect(regulationFor("chemicals", "NSW", "ghs")?.jurisdiction).toBe("AU");
  });

  // Same revision, different statute and different dates.
  it("reaches GHS 7 in New Zealand by New Zealand's own route", () => {
    const nz = regulationFor("chemicals", "NZ", "ghs");
    expect(nz?.value).toBe(7);
    expect(nz?.jurisdiction).toBe("NZ");
    expect(nz?.instrument).toMatch(/Hazardous Substances and New Organisms Act 1996/i);
    expect(nz?.instrument).not.toMatch(/Work Health and Safety Regulations/i);
  });

  /**
   * The number that is three times different across the Tasman, on a figure
   * that decides whether a house is habitable.
   */
  it("keeps the two methamphetamine thresholds apart", () => {
    const au = regulation("chemicals.meth-remediation-guideline.au");
    const nz = regulation("chemicals.meth-remediation-standard.nz");
    expect(au.value).toBe(0.5);
    expect(nz.value).toBe(1.5);
    expect(au.value).not.toBe(nz.value);
  });

  /**
   * And neither is law. A product selling compliance must not present
   * guidance as a legal requirement -- that misstates its own foundation.
   */
  it("records that neither methamphetamine figure is legally binding", () => {
    expect(
      regulation("chemicals.meth-remediation-guideline.au").requirement,
    ).toMatch(/not cited in legislation|GUIDANCE, NOT LAW/i);
    expect(
      regulation("chemicals.meth-remediation-standard.nz").requirement,
    ).toMatch(/VOLUNTARY standard and is not cited in legislation/i);
  });

  /**
   * An absence recorded on purpose. A hand-held TVOC meter produces a number,
   * and a number invites a comparison to a limit that does not exist. An
   * invented limit is easier to write than a missing one is to notice.
   */
  it("denies that a total-VOC exposure standard exists", () => {
    const voc = regulation("chemicals.total-voc-exposure-standard.au");
    expect(voc.requirement).toMatch(/NO workplace exposure standard for total volatile organic compounds/i);
    expect(voc.requirement).toMatch(/substance by substance/i);
    // An absence must not carry a scalar: a number here would be read as the limit.
    expect(voc.value).toBeUndefined();
  });

  /**
   * Which regulator applies turns on the claim the product makes, not on what
   * the technician means to do with it.
   */
  it("keeps the APVMA and TGA split visible on antimicrobials", () => {
    const r = regulation("chemicals.antimicrobial-registration.au").requirement;
    expect(r).toMatch(/APVMA/);
    expect(r).toMatch(/TGA/);
    expect(r).toMatch(/DEPENDS ON THE CLAIM/i);
  });
});

/**
 * Building codes.
 *
 * These entries deliberately do NOT restate the adoption dates: lib/anz/ncc-adoption.ts
 * owns them, and a second copy here would be the very defect the registry exists
 * to stop. What the entries carry is provenance -- the instrument behind each
 * unusual jurisdiction -- and these tests bind the two together so they cannot
 * drift apart silently.
 */
describe("building codes bind to the adoption table rather than copying it", () => {
  /**
   * Tasmania commenced NCC 2025 on 1 May 2026 and reverted five weeks later by
   * primary legislation. Adoption is not monotonic, and a model that assumes it
   * is gets Tasmania wrong for eleven months.
   */
  it("agrees with the table across Tasmania's reversion", () => {
    const entry = regulation("building-code.ncc-reversion.tas");
    expect(entry.effectiveFrom).toBe("2026-06-05");
    expect(entry.value).toBe("NCC 2022 Amendment 2");

    // Before the reversion: the newer code. After it: the older one.
    expect(resolveNccEdition("TAS", "2026-06-04")).toBe("NCC 2025");
    expect(resolveNccEdition("TAS", entry.effectiveFrom)).toBe(entry.value);
    expect(resolveNccEdition("TAS", "2027-04-30")).toBe(entry.value);
    // And forward again, with no further instrument.
    expect(resolveNccEdition("TAS", "2027-05-01")).toBe("NCC 2025");
  });

  it("agrees with the table that the Northern Territory never adopted", () => {
    const entry = regulation("building-code.ncc-non-adoption.nt");
    expect(entry.value).toBe("NCC 2022 Amendment 2");
    for (const day of ["2026-05-01", "2026-09-01", "2027-05-01"]) {
      expect(resolveNccEdition("NT", day)).toBe(entry.value);
    }
  });

  /**
   * South Australia took the plumbing volume in 2026 and deferred the building
   * volumes to 2027. RestoreAssist scopes building reinstatement, so the
   * building date is the one that governs a scope here.
   */
  it("agrees with the table on South Australia's split adoption", () => {
    const entry = regulation("building-code.ncc-split-adoption.sa");
    expect(entry.value).toBe("NCC 2022 Amendment 2");
    // Plumbing moved in 2026; the building code did not.
    expect(resolveNccEdition("SA", "2026-05-01")).toBe(entry.value);
    expect(resolveNccEdition("SA", "2027-05-01")).toBe("NCC 2025");
  });

  /**
   * The jurisdictions that did move, as a control: without these the tests above
   * would still pass if the table returned the old edition for everyone.
   */
  it("still shows the jurisdictions that did adopt on time", () => {
    for (const state of ["ACT", "VIC", "WA"] as const) {
      expect(resolveNccEdition(state, "2026-09-01")).toBe("NCC 2025");
    }
  });

  /**
   * New Zealand has no NCC. Citing one is not an imprecision; it names a
   * document that does not govern the job.
   */
  /**
   * Two errors lived in this one entry. CodeRabbit caught the first: the
   * commencement was recorded as 2004-08-25, which is the later Act's date, not
   * the Code's. Checking that surfaced the second, which the review did not
   * flag -- the entry described the Building Regulations 1992 as "made under
   * the Building Act 2004", and a 1992 instrument cannot be made under a
   * statute passed twelve years later.
   */
  it("dates the New Zealand Building Code from its own commencement, not the later Act", () => {
    const nz = regulation("building-code.building-code.nz");
    expect(nz.effectiveFrom).toBe("1992-07-01");
    expect(effectiveFromRange(nz).precision).toBe("day");
    // The anachronism, pinned so an edit cannot quietly restore it.
    expect(nz.requirement).not.toMatch(/Regulations 1992 made under the Building Act 2004/i);
    expect(nz.requirement).toMatch(/came into force on 1 July 1992 under the Building Act 1991/i);
    // Provenance points at the regulations that carry the Code, not the Act.
    expect(nz.sourceUrl).toMatch(/regulation\/public\/1992\/0150/);
  });

  it("gives New Zealand its own code and no NCC at all", () => {
    const nz = regulationFor("building-code", "NZ");
    expect(nz?.jurisdiction).toBe("NZ");
    expect(nz?.instrument).toMatch(/Building Act 2004/i);
    expect(nz?.requirement).toMatch(/NO National Construction Code in New Zealand/i);
    expect(nz?.instrument).not.toMatch(/National Construction Code/i);
  });

  // The registry must not become a second adoption table.
  it("does not restate adoption dates the table owns", () => {
    const building = REGULATORY_ENTRIES.filter((e) => e.domain === "building-code");
    expect(building.length).toBeGreaterThan(0);
    const au = regulation("building-code.ncc-adoption.au");
    expect(au.requirement).toMatch(/lib\/anz\/ncc-adoption\.ts/);
    expect(au.requirement).toMatch(/never a literal/i);
  });
});

describe("effectiveFrom states only the precision that was established", () => {
  it("treats a full date as a single day", () => {
    const r = effectiveFromRange(regulation("silica.engineered-stone-ban.au"));
    expect(r).toEqual({
      precision: "day",
      earliest: "2024-07-01",
      latest: "2024-07-01",
    });
  });

  // The entry the review was about.
  it("carries New Zealand's silica reduction as a month, not a padded day", () => {
    const entry = regulation("silica.exposure-standard.nz");
    expect(entry.effectiveFrom).toBe("2023-11");
    expect(effectiveFromRange(entry)).toEqual({
      precision: "month",
      earliest: "2023-11-01",
      latest: "2023-11-30",
    });
  });

  it("carries a standard known only by publication year as a year", () => {
    const entry = regulation("electrical.wiring-rules.au");
    expect(entry.effectiveFrom).toBe("2018");
    expect(effectiveFromRange(entry)).toEqual({
      precision: "year",
      earliest: "2018-01-01",
      latest: "2018-12-31",
    });
  });

  // Month ends are computed, not assumed to be the 30th.
  it("gets February right, leap year included", () => {
    const feb = (y: number) =>
      effectiveFromRange({ ...regulation("silica.exposure-standard.nz"), effectiveFrom: `${y}-02` });
    expect(feb(2024).latest).toBe("2024-02-29");
    expect(feb(2023).latest).toBe("2023-02-28");
  });

  it("refuses a value it cannot parse rather than guessing", () => {
    expect(() =>
      effectiveFromRange({
        ...regulation("silica.exposure-standard.nz"),
        effectiveFrom: "November 2023",
      }),
    ).toThrow(/unparseable effectiveFrom/i);
  });

  /**
   * The padding this whole change exists to stop. An entry whose requirement
   * admits the day is unknown must not also state one.
   */
  it("does not pad a day onto an entry that admits the day is unknown", () => {
    for (const e of REGULATORY_ENTRIES) {
      const admitsUnknown = /day was not established|not the commencement day/i.test(
        e.requirement,
      );
      if (admitsUnknown) {
        expect(effectiveFromRange(e).precision).not.toBe("day");
      }
    }
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

describe("lead is its own hazard, not a copy of asbestos", () => {
  const au = REGULATORY_ENTRIES.find((e) => e.id === "lead.presumption-year.au");
  const nz = REGULATORY_ENTRIES.find((e) => e.id === "lead.presumption-year.nz");

  it("seeds both jurisdictions, with the years their own instruments state", () => {
    // The whole reason this domain exists. leadRisk rode on the ASBESTOS year
    // because the registry had no lead domain at all.
    expect(au).toBeDefined();
    expect(nz).toBeDefined();
    expect(au!.value).toBe(1970);
    expect(nz!.value).toBe(1980);
  });

  it("keeps every lead year clear of its asbestos counterpart", () => {
    // Lead is earlier than asbestos in BOTH countries -- 1970 against 2004 in
    // Australia, 1980 against 2000 in New Zealand -- so no jurisdiction can
    // quietly share one number with the other domain.
    //
    // An earlier draft of this test asserted NZ lead was LATER than NZ asbestos
    // and went red. The test was wrong, not the registry; the note is kept
    // because getting these four numbers muddled is exactly the mistake the
    // whole domain exists to prevent.
    expect(asbestosEraBasis("AU").year).toBe(2004);
    expect(asbestosEraBasis("NZ").year).toBe(2000);
    expect(leadEraBasis("AU").year).toBeLessThan(asbestosEraBasis("AU").year);
    expect(leadEraBasis("NZ").year).toBeLessThan(asbestosEraBasis("NZ").year);
  });

  it("reverses the jurisdiction ordering between the two domains", () => {
    // The trap for anyone reasoning about lead by analogy with asbestos.
    // Australia's ASBESTOS year is LATER than New Zealand's (2004 > 2000), but
    // its LEAD year is EARLIER (1970 < 1980). "AU is always the later one" is a
    // false generalisation, and this is what catches code built on it.
    expect(asbestosEraBasis("AU").year).toBeGreaterThan(
      asbestosEraBasis("NZ").year,
    );
    expect(leadEraBasis("AU").year).toBeLessThan(leadEraBasis("NZ").year);
  });

  it("describes a presumption, never a prohibition", () => {
    // Australia banned asbestos on a date; nothing equivalent happened for lead
    // paint. An entry that said "banned" would invite a document to state a
    // prohibition that does not exist.
    // Asserted positively rather than by banning a word. The first version of
    // this test forbade /prohibit/ outright and failed on the entry's own
    // disclaimer, "not a prohibition" -- the assertion was blunter than the
    // property it was checking.
    for (const entry of [au!, nz!]) {
      expect(entry.requirement).toMatch(/assume paintwork|assume paint in/i);
      expect(entry.requirement).toMatch(/not a prohibition/i);
      expect(entry.requirement).toMatch(
        /no single date on which lead paint became unlawful|set no single date on which lead paint became unlawful/i,
      );
    }
  });

  it("says a later build year is not a clearance, in both entries", () => {
    // The failure mode this guards: a reader treating "built 1975" as lead-free
    // in Australia, where the cited guidance itself says otherwise and other
    // Australian bodies put the line as late as 1980.
    expect(au!.requirement).toMatch(/not a clearance/i);
    expect(au!.requirement).toMatch(/may still carry paint above 1 per cent/i);
    expect(nz!.requirement).toMatch(/may still carry lead paint/i);
  });

  it("records where the sources disagree rather than averaging them", () => {
    // Both countries have regulators stating different years. The entry cites
    // one instrument and carries the divergence in its text, so a reader is not
    // misled into thinking the threshold is crisper than it is.
    expect(au!.requirement).toMatch(/SA Health/i);
    expect(au!.requirement).toMatch(/NHMRC/i);
    expect(nz!.requirement).toMatch(/1980s or earlier/i);
  });

  it("states only the precision established, from the primary source", () => {
    // 2016 is the Commonwealth-hosted fifth edition's own copyright and
    // attribution year. The 2014 seen elsewhere is an earlier PRINTING of the
    // same edition under a CC-BY 3.0 licence, which is why this entry was held
    // back until the two could be told apart rather than averaged or guessed.
    expect(au!.effectiveFrom).toBe("2016");
    expect(nz!.effectiveFrom).toBe("2013");
    expect(au!.verification).toBe("primary-source");
    expect(nz!.verification).toBe("primary-source");
  });

  it("cites the New Zealand guideline's own sections, not just the landing page", () => {
    expect(nz!.provision).toMatch(/4\.3/);
    expect(nz!.sourceUrl).toContain("dmsdocument");
  });

  it("presumes lead below the year and not at or above it", () => {
    expect(presumeLeadFromEra(1969, "AU")).toBe(true);
    expect(presumeLeadFromEra(1970, "AU")).toBe(false);
    expect(presumeLeadFromEra(1979, "NZ")).toBe(true);
    expect(presumeLeadFromEra(1980, "NZ")).toBe(false);
  });

  it("does not treat a 1975 Australian building the way asbestos would", () => {
    // The concrete case the shared flag got wrong: a 1975 build is inside the
    // asbestos presumption (pre-2004) but outside the lead one (pre-1970).
    // Under the old code it was flagged for lead on an asbestos ban's authority.
    expect(presumeAsbestosFromEra(1975, "AU")).toBe(true);
    expect(presumeLeadFromEra(1975, "AU")).toBe(false);
  });

  it("returns false for an unknown year rather than warning on every job", () => {
    expect(presumeLeadFromEra(null, "AU")).toBe(false);
    expect(presumeLeadFromEra(undefined, "NZ")).toBe(false);
    expect(presumeLeadFromEra(Number.NaN, "AU")).toBe(false);
  });
});
