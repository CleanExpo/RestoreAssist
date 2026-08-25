/**
 * The SWMS reference table must not drift from the application's own record of
 * jurisdictional law.
 *
 * UNI-2619 was this exact failure in the report generator: a citation built by
 * string manipulation rather than read from `getStateInfo`, which rendered
 * Victoria under a Work Health and Safety Act it has never had. These tests
 * assert the SWMS table against `getStateInfo` itself, so a correction in one
 * place is a correction in both.
 */
import { describe, expect, it } from "vitest";
import {
  getSwmsJurisdiction,
  getSwmsJurisdictions,
  SWMS_AUS_NZ_STANDARDS,
} from "../jurisdiction-reference";
import { getStateInfo } from "@/lib/state-detection";

const AU_CODES = ["NSW", "ACT", "QLD", "NT", "SA", "TAS", "VIC", "WA"] as const;

describe("SWMS jurisdiction reference table", () => {
  it("covers the eight Australian jurisdictions plus Commonwealth and NZ", () => {
    const codes = getSwmsJurisdictions().map((j) => j.code);
    expect(codes).toEqual([...AU_CODES, "CTH", "NZ"]);
  });

  it.each(AU_CODES)(
    "%s: Act and regulator are read from state-detection, not duplicated",
    (code) => {
      const info = getStateInfo(code);
      expect(info, `getStateInfo("${code}") returned null`).toBeTruthy();

      const row = getSwmsJurisdiction(code);
      expect(row, `no SWMS row for ${code}`).toBeTruthy();
      expect(row!.act).toBe(info!.whsAct);
      expect(row!.regulator).toBe(info!.workSafetyAuthority);
      expect(row!.name).toBe(info!.name);
    },
  );

  it.each(AU_CODES)("%s: cites a regulation and codes of practice", (code) => {
    const row = getSwmsJurisdiction(code)!;
    expect(row.regulation, `${code} has no regulation`).toBeTruthy();
    expect(row.codesOfPractice.trim()).not.toBe("");
  });

  it.each([...AU_CODES, "CTH"] as const)(
    "%s: the Act citation carries its year",
    (code) => {
      // The precise failure mode of UNI-2619: the year silently dropped.
      expect(getSwmsJurisdiction(code)!.act).toMatch(/\b(?:19|20)\d{2}\b/);
    },
  );

  it("Victoria is never rendered under a Work Health and Safety Act", () => {
    const vic = getSwmsJurisdiction("VIC")!;
    expect(vic.act).toBe("Occupational Health and Safety Act 2004 (Vic)");
    expect(vic.act).not.toMatch(/Work Health and Safety/);
    expect(vic.harmonised).toBe(false);

    // Positive control: prove `harmonised` can be true, so the assertion above
    // is distinguishing Victoria rather than reporting a field that is always
    // false.
    expect(getSwmsJurisdiction("NSW")!.harmonised).toBe(true);
  });

  it("Western Australia cites the 2020 Act, not the 2022 regulations", () => {
    // The source SWMS documents cite a "Work Health and Safety Act 2022 (WA)".
    // WA's Act is the Work Health and Safety Act 2020 (WA); 2022 is the year
    // its general regulations were made and the Act commenced. The source is
    // deliberately not followed here.
    const wa = getSwmsJurisdiction("WA")!;
    expect(wa.act).toBe("Work Health and Safety Act 2020 (WA)");
    expect(wa.regulation).toMatch(/2022/);
  });

  it("New Zealand runs its own Act and has no named regulation", () => {
    const nz = getSwmsJurisdiction("NZ")!;
    expect(nz.act).toBe("Health and Safety at Work Act 2015 (NZ)");
    expect(nz.regulator).toBe("WorkSafe New Zealand");
    expect(nz.regulation).toBeNull();
    expect(nz.harmonised).toBe(false);

    // NZ has no getStateInfo entry, which is why this module carries it as a
    // literal. Asserted so that adding one later fails here and prompts the
    // same de-duplication the AU rows already have.
    expect(getStateInfo("NZ")).toBeNull();
  });

  it("lookup is case-insensitive and rejects unknown codes", () => {
    expect(getSwmsJurisdiction("vic")!.code).toBe("VIC");
    expect(getSwmsJurisdiction("XX")).toBeNull();
    expect(getSwmsJurisdiction("")).toBeNull();
  });

  it("the AS/NZS standards list is populated and correctly prefixed", () => {
    expect(SWMS_AUS_NZ_STANDARDS.length).toBeGreaterThan(0);
    for (const std of SWMS_AUS_NZ_STANDARDS) {
      expect(std, std).toMatch(/^AS(?:\/NZS)? \d/);
    }
  });
});
