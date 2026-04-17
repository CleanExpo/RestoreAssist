// RA-1136c: Unit tests for checkNzMoistureGate
// Verifies: warn-only shape, material limit matching, prefix matching, empty state

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindMany } = vi.hoisted(() => ({ mockFindMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    moistureReading: {
      findMany: mockFindMany,
    },
  },
}));

import { checkNzMoistureGate } from "../nz-moisture-gate";

describe("checkNzMoistureGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns canSubmit: true with no warnings when all readings are within limits", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "r1",
        surfaceType: "timber wall",
        moistureLevel: 15,
        unit: "%MC",
        location: "Kitchen",
      },
      {
        id: "r2",
        surfaceType: "plasterboard ceiling",
        moistureLevel: 0.5,
        unit: "WME",
        location: "Lounge",
      },
    ]);

    const result = await checkNzMoistureGate("insp-001");

    expect(result.canSubmit).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns a warning for each reading that exceeds the material limit", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "r1",
        surfaceType: "timber wall",
        moistureLevel: 25,
        unit: "%MC",
        location: "Kitchen",
      },
      {
        id: "r2",
        surfaceType: "concrete floor",
        moistureLevel: 6,
        unit: "%MC",
        location: "Garage",
      },
    ]);

    const result = await checkNzMoistureGate("insp-002");

    expect(result.canSubmit).toBe(true);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toMatch(/timber/i);
    expect(result.warnings[0]).toMatch(/Kitchen/);
    expect(result.warnings[1]).toMatch(/concrete/i);
  });

  it("uses the default limit when no material key matches the surface prefix", async () => {
    // "vinyl" is not in MOISTURE_LIMITS → default 18
    mockFindMany.mockResolvedValueOnce([
      {
        id: "r1",
        surfaceType: "vinyl flooring",
        moistureLevel: 20,
        unit: "%MC",
        location: "Hallway",
      },
    ]);

    const result = await checkNzMoistureGate("insp-003");

    expect(result.canSubmit).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/vinyl flooring/);
    expect(result.warnings[0]).toMatch(/default/i);
  });

  it("returns no warnings when inspection has no moisture readings", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await checkNzMoistureGate("insp-004");

    expect(result.canSubmit).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
