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

  it("triggers mould notification for Cat 3 area exceeding 107.6 sq ft (10 m²)", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeInspection({
        affectedAreas: [{ category: "3", affectedSquareFootage: 120 }],
      }),
    );

    const result = await checkSafeworkGate("insp-003");

    expect(result.canSubmit).toBe(true);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].type).toBe("mould");
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
        affectedAreas: [{ category: "3", affectedSquareFootage: 200 }],
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
