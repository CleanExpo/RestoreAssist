/**
 * RA-7361 — New Zealand must resolve from getStateInfo, and callers must
 * not invent Australian or Queensland law when a field is missing.
 *
 * The SWMS table used to carry an NZ literal because getStateInfo("NZ")
 * returned null. That pin is now inverted on purpose: NZ is read from this
 * module, and only the Act + regulator that were already recorded are filled.
 */
import { describe, expect, it } from "vitest";
import {
  getStateInfo,
  recordedStateCitations,
  resolveStateInfo,
} from "@/lib/state-detection";
import {
  AU_QLD_LINK_PATTERNS,
  AU_QLD_STATUTE_PATTERNS,
  auQldLinkHits,
  auQldStatuteHits,
} from "./au-qld-law-scan";

const AU_CODES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "ACT", "NT"] as const;

describe("getStateInfo — New Zealand (RA-7361)", () => {
  it("returns the Health and Safety at Work Act 2015 and WorkSafe New Zealand", () => {
    expect(getStateInfo("nz")?.code).toBe("NZ");
    const nz = getStateInfo("NZ");
    expect(nz, 'getStateInfo("NZ") returned null').toBeTruthy();
    expect(nz!.code).toBe("NZ");
    expect(nz!.name).toBe("New Zealand");
    expect(nz!.whsAct).toBe("Health and Safety at Work Act 2015 (NZ)");
    expect(nz!.workSafetyAuthority).toBe("WorkSafe New Zealand");
  });

  it("does not invent a New Zealand building code or EPA instrument", () => {
    const nz = getStateInfo("NZ")!;
    expect(nz.buildingCode).toBeNull();
    expect(nz.epaAct).toBeNull();
    expect(nz.buildingAuthority).toBeNull();
    expect(nz.epaAuthority).toBeNull();
    expect(nz.workSafetyContact).toBeNull();
    expect(nz.epaContact).toBeNull();
  });

  it("returns no Australian or Queensland law on any NZ field — AU control can go red", () => {
    // Control: the scanner must be capable of finding AU/QLD law. An empty
    // pattern list, or a QLD row that no longer carries those statutes, would
    // make the NZ assertion pass for a reason unrelated to New Zealand.
    expect(AU_QLD_STATUTE_PATTERNS.length).toBeGreaterThan(0);
    expect(AU_QLD_LINK_PATTERNS.length).toBeGreaterThan(0);

    const qld = getStateInfo("QLD");
    const qldStatuteHits = auQldStatuteHits(qld);
    expect(
      qldStatuteHits,
      "AU control: QLD getStateInfo must still carry Australian/Queensland statutes so the NZ scan can fail",
    ).not.toEqual([]);

    // getStateInfo rows carry no URLs. The link scanner is proven against a
    // known Australian host so a pattern list that never matches cannot hide
    // a leak on the NZ path.
    expect(
      auQldLinkHits("https://www.safeworkaustralia.gov.au/safety-topic/hazards/asbestos"),
    ).not.toEqual([]);
    expect(auQldLinkHits("https://www.worksafe.govt.nz/topic-and-industry/asbestos/")).toEqual(
      [],
    );

    const nz = getStateInfo("NZ");
    expect(auQldStatuteHits(nz)).toEqual([]);
    expect(auQldLinkHits(nz)).toEqual([]);
  });

  it("leaves the eight Australian rows complete", () => {
    for (const code of AU_CODES) {
      const info = getStateInfo(code);
      expect(info, `getStateInfo("${code}") returned null`).toBeTruthy();
      expect(info!.whsAct.length).toBeGreaterThan(0);
      expect(info!.buildingCode).toBeTruthy();
      expect(info!.epaAct).toBeTruthy();
    }
  });
});

describe("resolveStateInfo", () => {
  it("a positive NZ country wins over an overlapping Australian postcode", () => {
    // 4000 is Queensland and also Gisborne. Country, not postcode, decides.
    const nz = resolveStateInfo({ postcode: "4000", country: "NZ" });
    expect(nz?.code).toBe("NZ");
    expect(nz?.whsAct).toBe("Health and Safety at Work Act 2015 (NZ)");
  });

  it("accepts 'New Zealand' as a country hint", () => {
    expect(resolveStateInfo({ country: "New Zealand" })?.code).toBe("NZ");
  });

  it("without an NZ country, 4000 still resolves to Queensland", () => {
    expect(resolveStateInfo({ postcode: "4000" })?.code).toBe("QLD");
    expect(resolveStateInfo({ postcode: "4000", country: "AU" })?.code).toBe(
      "QLD",
    );
  });

  it("returns null when neither country nor postcode identifies a jurisdiction", () => {
    expect(resolveStateInfo({ postcode: "", country: null })).toBeNull();
    expect(resolveStateInfo({})).toBeNull();
  });
});

describe("recordedStateCitations", () => {
  it("returns only the fields that are actually set", () => {
    expect(recordedStateCitations(getStateInfo("NZ"))).toEqual([
      "Health and Safety at Work Act 2015 (NZ)",
    ]);
  });

  it("is empty when jurisdiction is unknown — callers must not invent AU/QLD law", () => {
    expect(recordedStateCitations(null)).toEqual([]);
    expect(recordedStateCitations(undefined)).toEqual([]);
  });

  it("includes the Queensland instruments for a QLD row", () => {
    const qld = recordedStateCitations(getStateInfo("QLD"));
    expect(qld).toContain("Work Health and Safety Act 2011 (Qld)");
    expect(qld).toContain("Environmental Protection Act 1994 (Qld)");
    expect(qld).toContain("QDC 4.5 (Queensland Development Code)");
  });
});
