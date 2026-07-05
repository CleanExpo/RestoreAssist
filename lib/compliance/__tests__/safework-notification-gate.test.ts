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
    // Deadline is 24h after inspectionDate
    expect(result.notifications[0].deadline.getTime()).toBe(
      BASE_DATE.getTime() + 24 * 60 * 60 * 1000,
    );
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
