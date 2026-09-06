// RA-1136d: Unit tests for checkSafeworkGate
// Verifies: asbestos trigger, mould trigger, biohazard trigger, empty state

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindUnique } = vi.hoisted(() => ({ mockFindUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: mockFindUnique,
    },
  },
}));

import { checkSafeworkGate } from "../safework-notification-gate";

const BASE_DATE = new Date("2025-06-15T08:00:00Z");

function makeInspection(overrides: object = {}) {
  return {
    inspectionDate: BASE_DATE,
    propertyPostcode: "2000", // NSW
    propertyYearBuilt: null,
    propertyCountry: "AU",
    affectedAreas: [],
    whsIncidents: [],
    ...overrides,
  };
}

describe("checkSafeworkGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns canSubmit: true with no notifications when no triggers are met", async () => {
    mockFindUnique.mockResolvedValueOnce(makeInspection());

    const result = await checkSafeworkGate("insp-001");

    expect(result.canSubmit).toBe(true);
    expect(result.notifications).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("triggers asbestos notification for pre-2004 building with asbestos incident", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeInspection({
        propertyYearBuilt: 1980,
        whsIncidents: [{ incidentType: "asbestos_ceiling_tiles" }],
      }),
    );

    const result = await checkSafeworkGate("insp-002");

    expect(result.canSubmit).toBe(true);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].type).toBe("asbestos");
    expect(result.notifications[0].regulator).toContain("NSW");
    expect(result.notifications[0].regulatorUrl).toBe(
      "https://www.safework.nsw.gov.au",
    );
    // WAS: `expect(deadline).toBe(BASE_DATE + 24h)`.
    //
    // That assertion encoded the defect rather than catching it. There is no
    // 24-hour deadline in either country's Act -- Australia requires
    // notification IMMEDIATELY (WHS Act s38) and New Zealand AS SOON AS
    // POSSIBLE (HSWA s56) -- and the clock ran from the inspection date rather
    // than from when the business became aware, so an incident discovered later
    // got a deadline already past. The test passed because it was written from
    // the code instead of from the source.
    const au = result.notifications[0];
    expect(au.notifyBy).toMatch(/immediately/i);
    expect(au.registryEntryId).toBe("whs.notifiable-incident-duty.au");
    expect(au.sourceUrl).toMatch(/^https:/);
    expect(au.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // No hour figure anywhere in what the user is shown.
    expect(au.notifyBy).not.toMatch(/\b\d+\s*(hour|hr)/i);
  });

  describe("the asbestos era threshold follows the job's country", () => {
    /**
     * The two thresholds are not the same and must not be collapsed. Australia's
     * ban took effect 31 December 2003, so anything built before 2004 is in
     * scope; WorkSafe New Zealand states 1 January 2000. Both live in
     * lib/compliance/regulatory-registry/asbestos.ts and are reached through
     * presumeAsbestosFromEra.
     *
     * This gate carried a literal 2004 with a comment reading "NZ check skipped
     * until RA-1120". That was harmless only because the jurisdiction could
     * never BE New Zealand -- it came from an Australian postcode map. Reading
     * propertyCountry made NZ reachable and turned a dormant note into a live
     * defect: a New Zealand building from 2000-2003 was told it pre-dates the
     * threshold when its own rule says it does not.
     */
    it("does not presume asbestos on a 2002 New Zealand building", async () => {
      mockFindUnique.mockResolvedValueOnce(
        makeInspection({
          propertyCountry: "NZ",
          propertyYearBuilt: 2002,
          whsIncidents: [{ incidentType: "asbestos_soffit" }],
        }),
      );

      const result = await checkSafeworkGate("insp-nz-2002");

      expect(result.notifications.map((n) => n.type)).not.toContain("asbestos");
    });

    it("does presume asbestos on a 1999 New Zealand building", async () => {
      // The other side of the same boundary: without this, a gate that simply
      // never fires in New Zealand would satisfy the assertion above.
      mockFindUnique.mockResolvedValueOnce(
        makeInspection({
          propertyCountry: "NZ",
          propertyYearBuilt: 1999,
          whsIncidents: [{ incidentType: "asbestos_soffit" }],
        }),
      );

      const result = await checkSafeworkGate("insp-nz-1999");

      const asbestos = result.notifications.find((n) => n.type === "asbestos");
      expect(asbestos).toBeDefined();
      expect(asbestos!.regulator).toContain("WorkSafe");
    });

    it("still presumes asbestos on a 2002 Australian building", async () => {
      // Guards the opposite collapse: adopting New Zealand's year everywhere
      // would drop 2000-2003 Australian buildings out of the trigger.
      mockFindUnique.mockResolvedValueOnce(
        makeInspection({
          propertyYearBuilt: 2002,
          whsIncidents: [{ incidentType: "asbestos_soffit" }],
        }),
      );

      const result = await checkSafeworkGate("insp-au-2002");

      expect(result.notifications.map((n) => n.type)).toContain("asbestos");
    });

    it("states the year it actually applied, rather than a fixed one", async () => {
      // The warning read "pre-2004 building" unconditionally. A New Zealand
      // technician reading that would take away the wrong rule even on a job
      // the gate handled correctly.
      mockFindUnique.mockResolvedValueOnce(
        makeInspection({
          propertyCountry: "NZ",
          propertyYearBuilt: 1990,
          whsIncidents: [{ incidentType: "asbestos_soffit" }],
        }),
      );

      const result = await checkSafeworkGate("insp-nz-warning");

      const warning = result.warnings.find((w) => w.includes("Asbestos"));
      expect(warning).toBeDefined();
      expect(warning).toContain("2000");
      expect(warning).not.toContain("2004");
    });
  });

  it("triggers mould notification for Cat 3 area at/above 10 m² (RA-7001, canonical m²)", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeInspection({
        affectedAreas: [
          { category: "3", affectedAreaSqm: 12, affectedSquareFootage: 129.2 },
        ],
      }),
    );

    const result = await checkSafeworkGate("insp-003");

    expect(result.canSubmit).toBe(true);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].type).toBe("mould");
  });

  it("triggers at exactly 10 m² (inclusive threshold)", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeInspection({
        affectedAreas: [
          { category: "3", affectedAreaSqm: 10, affectedSquareFootage: 107.64 },
        ],
      }),
    );

    const result = await checkSafeworkGate("insp-003b");

    expect(result.notifications.map((n) => n.type)).toContain("mould");
  });

  it("does NOT trigger mould below 10 m²", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeInspection({
        affectedAreas: [
          { category: "3", affectedAreaSqm: 8, affectedSquareFootage: 86.1 },
        ],
      }),
    );

    const result = await checkSafeworkGate("insp-003c");

    expect(result.notifications).toHaveLength(0);
  });

  it("falls back to converting a legacy sq-ft-only row (no affectedAreaSqm)", async () => {
    // 120 sq ft × 0.09290304 = 11.15 m² → above the 10 m² threshold.
    mockFindUnique.mockResolvedValueOnce(
      makeInspection({
        affectedAreas: [
          { category: "3", affectedAreaSqm: null, affectedSquareFootage: 120 },
        ],
      }),
    );

    const result = await checkSafeworkGate("insp-003d");

    expect(result.notifications.map((n) => n.type)).toContain("mould");
  });

  it("triggers biohazard notification when incident type contains 'sewage'", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeInspection({
        whsIncidents: [{ incidentType: "sewage_backup" }],
      }),
    );

    const result = await checkSafeworkGate("insp-004");

    expect(result.canSubmit).toBe(true);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].type).toBe("biohazard");
  });

  it("can trigger multiple notifications at once", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeInspection({
        propertyYearBuilt: 1970,
        affectedAreas: [
          { category: "3", affectedAreaSqm: 18.6, affectedSquareFootage: 200 },
        ],
        whsIncidents: [
          { incidentType: "asbestos_roof" },
          { incidentType: "blood_contamination" },
        ],
      }),
    );

    const result = await checkSafeworkGate("insp-005");

    expect(result.canSubmit).toBe(true);
    const types = result.notifications.map((n) => n.type);
    expect(types).toContain("asbestos");
    expect(types).toContain("mould");
    expect(types).toContain("biohazard");
  });
});

/**
 * A New Zealand job must be notified to WorkSafe New Zealand.
 *
 * This was broken in a way that could not be seen from the map: REGULATOR_MAP
 * has always had an NZ entry, but the jurisdiction came from
 * detectJurisdiction(postcode), which parses Australian postcode ranges and
 * falls back to "NSW". The NZ entry was unreachable, so a New Zealand
 * technician was told to notify SafeWork NSW within 24 hours of a notifiable
 * incident. Australian and New Zealand postcodes are both four digits and
 * overlap, so the postcode could never have distinguished them.
 */
describe("jurisdiction follows the country, not the postcode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies WorkSafe New Zealand on a New Zealand job", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeInspection({
        propertyCountry: "NZ",
        // 2000 is a Sydney postcode. Country must win.
        propertyPostcode: "2000",
        propertyYearBuilt: 1980,
        whsIncidents: [{ incidentType: "asbestos_ceiling_tiles" }],
      }),
    );

    const result = await checkSafeworkGate("insp-nz");

    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].regulator).toBe("WorkSafe New Zealand");
    expect(result.notifications[0].regulatorUrl).toBe(
      "https://www.worksafe.govt.nz",
    );
    // The bug: an Australian state regulator on a New Zealand job.
    expect(result.notifications[0].regulator).not.toMatch(/NSW|SafeWork SA/);
  });

  /**
   * propertyCountry is `@default("AU")`, so an "AU" value may simply be the
   * default. It therefore falls through to postcode-based state detection
   * exactly as before — every existing Australian result is unchanged.
   */
  it("still detects the Australian state from the postcode", async () => {
    for (const [postcode, expected] of [
      ["2000", "SafeWork NSW"],
      ["3000", "WorkSafe Victoria"],
      ["6000", "WorkSafe Western Australia"],
    ] as const) {
      vi.clearAllMocks();
      mockFindUnique.mockResolvedValueOnce(
        makeInspection({
          propertyCountry: "AU",
          propertyPostcode: postcode,
          propertyYearBuilt: 1980,
          whsIncidents: [{ incidentType: "asbestos_ceiling_tiles" }],
        }),
      );
      const result = await checkSafeworkGate(`insp-${postcode}`);
      expect(result.notifications[0].regulator).toBe(expected);
    }
  });

  it("treats a missing country as Australian rather than throwing", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeInspection({
        propertyCountry: null,
        propertyPostcode: "4000",
        propertyYearBuilt: 1980,
        whsIncidents: [{ incidentType: "asbestos_ceiling_tiles" }],
      }),
    );
    const result = await checkSafeworkGate("insp-null-country");
    expect(result.notifications[0].regulator).toMatch(/Queensland/);
  });
});
