import { describe, expect, it } from "vitest";
import {
  buildTeacherContext,
  type RawInspectionState,
} from "../context-engine";

const baseState: RawInspectionState = {
  inspectionId: "insp_1",
  userId: "user_1",
  propertyCountry: "AU",
  currentRoom: null,
  stage: "arrival",
  classification: null,
  photoCount: 0,
  moistureReadings: [],
  sketchHasLidar: false,
};

describe("buildTeacherContext", () => {
  it("returns no missingFields for an empty arrival-stage state", () => {
    const ctx = buildTeacherContext(baseState);

    expect(ctx.missingFields).toEqual([]);
    expect(ctx.waterCategory).toBeNull();
    expect(ctx.waterClass).toBeNull();
    expect(ctx.currentRoom).toBeNull();
    expect(ctx.lastMoistureReadingAt).toBeNull();
    expect(ctx.hasLidarScan).toBe(false);
    expect(ctx.jurisdiction).toBe("AU");
  });

  it("flags applicable incomplete make-safe actions with the make_safe.* prefix", () => {
    const ctx = buildTeacherContext({
      ...baseState,
      stage: "moisture",
      currentRoom: "kitchen",
      moistureReadings: [
        { capturedAt: new Date("2026-04-17T10:00:00Z"), location: "kitchen" },
      ],
      makeSafeActions: [
        { action: "water_stopped", applicable: true, completed: false },
        { action: "power_isolated", applicable: true, completed: true },
        { action: "asbestos_check", applicable: false, completed: false },
      ],
    });

    expect(ctx.missingFields).toContain("make_safe.water_stopped");
    expect(ctx.missingFields).not.toContain("make_safe.power_isolated");
    expect(ctx.missingFields).not.toContain("make_safe.asbestos_check");
  });

  it("flags a moisture gap when the current room has no reading and stage is past arrival", () => {
    const ctx = buildTeacherContext({
      ...baseState,
      stage: "walkthrough",
      currentRoom: "bathroom",
      moistureReadings: [
        { capturedAt: new Date("2026-04-17T09:30:00Z"), location: "kitchen" },
      ],
    });

    expect(ctx.missingFields).toContain("moisture.bathroom");
    expect(ctx.lastMoistureReadingAt).toEqual(new Date("2026-04-17T09:30:00Z"));
  });

  it("populates waterCategory and waterClass when classification is present", () => {
    const ctx = buildTeacherContext({
      ...baseState,
      stage: "classification",
      classification: { category: 2, class: 3 },
    });

    expect(ctx.waterCategory).toBe(2);
    expect(ctx.waterClass).toBe(3);
  });
});
