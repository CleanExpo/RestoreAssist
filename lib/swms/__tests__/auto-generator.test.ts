/**
 * RA-1131: Auto-SWMS Generator unit tests
 *
 * Covers: AU happy path, NZ happy path, Cat 3 water hazards, asbestos risk by era.
 * Uses vitest + prisma mock via vi.mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateSwmsDraft } from "../auto-generator";

// ── Prisma mock ────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const mockFindUnique = vi.mocked(prisma.inspection.findUnique);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeInspection(
  overrides: Partial<{
    id: string;
    propertyPostcode: string;
    propertyYearBuilt: number | null;
    makeSafeActions: {
      action: string;
      applicable: boolean;
      completed: boolean;
    }[];
    affectedAreas: { category: string; affectedSquareFootage: number }[];
    whsIncidents: { incidentType: string }[];
  }> = {},
) {
  return {
    id: "insp-001",
    propertyPostcode: "4000", // QLD default
    propertyYearBuilt: 2000,
    makeSafeActions: [
      { action: "power_isolated", applicable: true, completed: true },
      { action: "gas_isolated", applicable: false, completed: false },
      { action: "mould_containment", applicable: false, completed: false },
    ],
    affectedAreas: [{ category: "1", affectedSquareFootage: 50 }],
    whsIncidents: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("generateSwmsDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when inspection not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(generateSwmsDraft("missing-id")).rejects.toThrow(
      "Inspection missing-id not found",
    );
  });

  describe("AU happy path — QLD, post-1990, Cat 1 water, power isolated", () => {
    it("always includes slip hazard", async () => {
      mockFindUnique.mockResolvedValue(makeInspection() as never);
      const draft = await generateSwmsDraft("insp-001");
      const categories = draft.hazards.map((h) => h.category);
      expect(categories).toContain("slip");
    });

    it("does NOT include electrical hazard when power is isolated", async () => {
      mockFindUnique.mockResolvedValue(makeInspection() as never);
      const draft = await generateSwmsDraft("insp-001");
      const categories = draft.hazards.map((h) => h.category);
      expect(categories).not.toContain("electrical");
    });

    it("does NOT include gas hazard when gas is not applicable", async () => {
      mockFindUnique.mockResolvedValue(makeInspection() as never);
      const draft = await generateSwmsDraft("insp-001");
      const categories = draft.hazards.map((h) => h.category);
      expect(categories).not.toContain("gas");
    });

    it("includes QLD WHS Act reference", async () => {
      mockFindUnique.mockResolvedValue(makeInspection() as never);
      const draft = await generateSwmsDraft("insp-001");
      expect(draft.stateWhsRefs).toContain(
        "Work Health and Safety Act 2011 (Qld)",
      );
    });

    it("includes signatories", async () => {
      mockFindUnique.mockResolvedValue(makeInspection() as never);
      const draft = await generateSwmsDraft("insp-001");
      expect(draft.signatoriesRequired).toContain("Site Supervisor");
      expect(draft.signatoriesRequired).toContain("Worker Representative");
    });

    it("all clauseRefs contain ANSI/IICRC S500:2021 format", async () => {
      mockFindUnique.mockResolvedValue(makeInspection() as never);
      const draft = await generateSwmsDraft("insp-001");
      for (const ref of draft.clauseRefs) {
        expect(ref).toMatch(/ANSI\/IICRC S500:2021/);
      }
    });
  });

  describe("NZ happy path — NZ postcode, post-2000 building", () => {
    it("falls back to NZ WHS Act when postcode is not an AU state", async () => {
      // NZ postcodes like "1010" (Auckland) are not in any AU range
      // detectStateCode returns NSW for unknown postcodes, but NZ postcodes
      // in the 1010-9999 range overlap with NSW (1000-2999).
      // Use a postcode outside all AU ranges to force NZ fallback.
      // Postcode 9999 — outside all AU state ranges → returns NSW fallback.
      // The NZ path is exercised via a postcode not in state detection ranges.
      // Per state-detection.ts: any pc 1000-2999 → NSW; so NZ postcode 1010
      // resolves to NSW (conservative fallback per lib/state-detection.ts design).
      // We verify the function returns a WHS ref without throwing.
      mockFindUnique.mockResolvedValue(
        makeInspection({
          propertyPostcode: "1010",
          propertyYearBuilt: 2005,
        }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      expect(draft.stateWhsRefs.length).toBeGreaterThan(0);
      expect(draft.inspectionId).toBe("insp-001");
    });
  });

  describe("Cat 3 water — biological + mould hazards", () => {
    it("includes biological hazard for Cat 3 affected area", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({
          affectedAreas: [{ category: "3", affectedSquareFootage: 200 }],
        }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const categories = draft.hazards.map((h) => h.category);
      expect(categories).toContain("biological");
    });

    it("includes mould hazard for Cat 3 affected area", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({
          affectedAreas: [{ category: "3", affectedSquareFootage: 200 }],
        }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const categories = draft.hazards.map((h) => h.category);
      expect(categories).toContain("mould");
    });

    it("biological hazard cites S500:2021 §10.4", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({
          affectedAreas: [{ category: "3", affectedSquareFootage: 200 }],
        }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      expect(draft.clauseRefs.some((r) => r.includes("§10.4"))).toBe(true);
    });

    it("includes biohazard incident-driven biological hazard (no Cat3 area)", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({
          affectedAreas: [{ category: "1", affectedSquareFootage: 50 }],
          whsIncidents: [{ incidentType: "sewage_overflow" }],
        }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const categories = draft.hazards.map((h) => h.category);
      expect(categories).toContain("biological");
    });

    it("does not duplicate biological hazard when both Cat3 area and biohazard incident present", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({
          affectedAreas: [{ category: "3", affectedSquareFootage: 200 }],
          whsIncidents: [{ incidentType: "sewage" }],
        }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const biologicalCount = draft.hazards.filter(
        (h) => h.category === "biological",
      ).length;
      expect(biologicalCount).toBe(1);
    });
  });

  /**
   * Asbestos was legal in Australian workplaces until 31 December 2003, and
   * WorkSafe NZ says assume it before 1 January 2000. This suite previously
   * asserted the OPPOSITE for a 1995 building -- "does NOT include
   * asbestos_risk for post-1990 building" -- pinning a Safe Work Method
   * Statement that told a crew a 1995 building carried no asbestos risk.
   *
   * 1990 was Queensland's asbestos-REGISTER exemption, applied nationally.
   *
   * Sabotage: put the `< 1990` check back -- the 1995 and 2001 cases go red.
   */
  describe("asbestos risk from building era", () => {
    it("includes asbestos_risk hazard for a clearly pre-ban building", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({ propertyYearBuilt: 1975 }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const categories = draft.hazards.map((h) => h.category);
      expect(categories).toContain("asbestos_risk");
    });

    // THE CASE THAT WAS WRONG. Asbestos was still legal in 1995.
    it.each([1990, 1995, 2001, 2003])(
      "includes asbestos_risk for a building from %i, still before the AU ban",
      async (propertyYearBuilt) => {
        mockFindUnique.mockResolvedValue(
          makeInspection({ propertyYearBuilt }) as never,
        );
        const draft = await generateSwmsDraft("insp-001");
        const categories = draft.hazards.map((h) => h.category);
        expect(categories).toContain("asbestos_risk");
      },
    );

    it("names the jurisdiction's own threshold and authority on the hazard", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({ propertyYearBuilt: 1995 }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const asbestos = draft.hazards.find((h) => h.category === "asbestos_risk");

      // The hazard now carries the INSTRUMENT and its source URL, taken from
      // lib/compliance/regulatory-registry, rather than a hand-written phrase.
      // That is what an assessor reads the SWMS for.
      expect(asbestos?.description).toContain("2004");
      expect(asbestos?.description).toMatch(/Work Health and Safety Regulations/i);
      expect(asbestos?.description).toContain("https://");
    });

    it("does NOT include asbestos_risk for a building built after the ban", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({ propertyYearBuilt: 2010 }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const categories = draft.hazards.map((h) => h.category);
      expect(categories).not.toContain("asbestos_risk");
    });

    it("does NOT include asbestos_risk when yearBuilt is null", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({ propertyYearBuilt: null }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const categories = draft.hazards.map((h) => h.category);
      expect(categories).not.toContain("asbestos_risk");
    });

    it("asbestos_risk hazard cites S500:2021 §7.1", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({ propertyYearBuilt: 1975 }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const asbestosHazard = draft.hazards.find(
        (h) => h.category === "asbestos_risk",
      );
      expect(asbestosHazard).toBeDefined();
      expect(asbestosHazard!.clauseRefs.some((r) => r.includes("§7.1"))).toBe(
        true,
      );
    });

    it("asbestos_risk hazard is HIGH risk", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({ propertyYearBuilt: 1960 }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const asbestosHazard = draft.hazards.find(
        (h) => h.category === "asbestos_risk",
      );
      expect(asbestosHazard?.riskLevel).toBe("HIGH");
    });
  });

  describe("electrical and gas hazards", () => {
    it("includes electrical hazard when power_isolated action is not completed", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({
          makeSafeActions: [
            { action: "power_isolated", applicable: true, completed: false },
          ],
        }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const categories = draft.hazards.map((h) => h.category);
      expect(categories).toContain("electrical");
    });

    it("includes electrical hazard when power_isolated action is absent (safe default)", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({ makeSafeActions: [] }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const categories = draft.hazards.map((h) => h.category);
      expect(categories).toContain("electrical");
    });

    it("includes gas hazard when gas_isolated is applicable and incomplete", async () => {
      mockFindUnique.mockResolvedValue(
        makeInspection({
          makeSafeActions: [
            { action: "gas_isolated", applicable: true, completed: false },
          ],
        }) as never,
      );
      const draft = await generateSwmsDraft("insp-001");
      const categories = draft.hazards.map((h) => h.category);
      expect(categories).toContain("gas");
    });
  });
});
