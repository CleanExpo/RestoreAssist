import { describe, it, expect, vi } from "vitest";

// deriveTeacherContext is pure, but the module also exports buildTeacherContext
// which imports @/lib/prisma — stub it so the (DB-free) unit tests load.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  deriveTeacherContext,
  type InspectionSnapshot,
} from "../build-teacher-context";

function snap(overrides: Partial<InspectionSnapshot> = {}): InspectionSnapshot {
  return {
    status: "DRAFT",
    claimType: null,
    lossDescription: null,
    signedAt: null,
    completedAt: null,
    submittedAt: null,
    affectedAreas: [],
    latestMoistureRoom: null,
    latestAffectedRoom: null,
    hasMoistureReadings: false,
    hasBaselineReading: false,
    hasScopeItems: false,
    hasPhotos: false,
    ...overrides,
  };
}

describe("deriveTeacherContext", () => {
  it("returns safe defaults for a missing inspection", () => {
    const ctx = deriveTeacherContext("insp-1", "user-1", "AU", null);
    expect(ctx).toEqual({
      inspectionId: "insp-1",
      userId: "user-1",
      jurisdiction: "AU",
      currentRoom: null,
      stage: "walkthrough",
      missingFields: [],
    });
  });

  it("a fresh DRAFT inspection is at 'arrival' with the full capture checklist", () => {
    const ctx = deriveTeacherContext("i", "u", "AU", snap());
    expect(ctx.stage).toBe("arrival");
    expect(ctx.missingFields).toEqual([
      "affected areas (rooms + water source)",
      "moisture readings (incl. a dry-standard reference)",
      "photo evidence",
      "loss description / cause of loss",
    ]);
  });

  it("rooms logged but no moisture → 'walkthrough', flags missing Cat/Class", () => {
    const ctx = deriveTeacherContext(
      "i",
      "u",
      "AU",
      snap({
        affectedAreas: [
          { roomZoneId: "Bathroom", category: null, class: null },
        ],
        latestAffectedRoom: "Bathroom",
      }),
    );
    expect(ctx.stage).toBe("walkthrough");
    expect(ctx.currentRoom).toBe("Bathroom");
    expect(ctx.missingFields).toContain(
      "water category — Cat 1/2/3 (S500 §10.5)",
    );
    expect(ctx.missingFields).toContain(
      "drying class — Class 1-4 (S500 §10.6)",
    );
  });

  it("moisture logged but not classified → 'moisture'", () => {
    const ctx = deriveTeacherContext(
      "i",
      "u",
      "AU",
      snap({
        affectedAreas: [{ roomZoneId: "Kitchen", category: null, class: null }],
        hasMoistureReadings: true,
        latestMoistureRoom: "Kitchen",
      }),
    );
    expect(ctx.stage).toBe("moisture");
  });

  it("Cat+Class set + moisture, no scope → 'classification' and flags scope next", () => {
    const ctx = deriveTeacherContext(
      "i",
      "u",
      "NZ",
      snap({
        affectedAreas: [{ roomZoneId: "Lounge", category: "2", class: "2" }],
        hasMoistureReadings: true,
      }),
    );
    expect(ctx.stage).toBe("classification");
    expect(ctx.missingFields).toContain("scope of works");
    expect(ctx.jurisdiction).toBe("NZ");
  });

  it("scope items present → 'scope'", () => {
    const ctx = deriveTeacherContext(
      "i",
      "u",
      "AU",
      snap({
        affectedAreas: [{ roomZoneId: "Lounge", category: "2", class: "2" }],
        hasMoistureReadings: true,
        hasBaselineReading: true,
        hasScopeItems: true,
        hasPhotos: true,
        lossDescription: "burst pipe",
      }),
    );
    expect(ctx.stage).toBe("scope");
    expect(ctx.missingFields).toEqual([]);
  });

  it("flags a missing dry-standard reference when readings exist but no baseline", () => {
    const ctx = deriveTeacherContext(
      "i",
      "u",
      "AU",
      snap({
        affectedAreas: [{ roomZoneId: "Lounge", category: "2", class: "2" }],
        hasMoistureReadings: true,
        hasBaselineReading: false,
      }),
    );
    expect(ctx.missingFields).toContain(
      "dry-standard reference reading (unaffected area, S500 §12.2)",
    );
  });

  it("does not flag the dry-standard reference once a baseline reading exists", () => {
    const ctx = deriveTeacherContext(
      "i",
      "u",
      "AU",
      snap({
        affectedAreas: [{ roomZoneId: "Lounge", category: "2", class: "2" }],
        hasMoistureReadings: true,
        hasBaselineReading: true,
      }),
    );
    expect(ctx.missingFields).not.toContain(
      "dry-standard reference reading (unaffected area, S500 §12.2)",
    );
  });

  it("signed/submitted → 'submission'", () => {
    const ctx = deriveTeacherContext(
      "i",
      "u",
      "AU",
      snap({ status: "CLOSED", signedAt: new Date("2026-06-17T00:00:00Z") }),
    );
    expect(ctx.stage).toBe("submission");
  });

  it("prefers the latest moisture room over the latest affected room", () => {
    const ctx = deriveTeacherContext(
      "i",
      "u",
      "AU",
      snap({
        affectedAreas: [{ roomZoneId: "Hallway", category: "1", class: "1" }],
        latestAffectedRoom: "Hallway",
        latestMoistureRoom: "Ensuite",
        hasMoistureReadings: true,
      }),
    );
    expect(ctx.currentRoom).toBe("Ensuite");
  });
});
