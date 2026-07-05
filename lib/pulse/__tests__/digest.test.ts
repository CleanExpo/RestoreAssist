import { describe, it, expect } from "vitest";
import { buildDailyDigest } from "../digest";

const NOW = new Date("2026-07-05T00:00:00Z");
const FIVE_DAYS_AGO = new Date("2026-06-30T00:00:00Z");

describe("buildDailyDigest", () => {
  it("derives X of Y areas at drying goal from the curated timeline, never raw values", () => {
    const rawMoistureValues = [37.42, 68.91];
    const digest = buildDailyDigest({
      areas: [
        { id: "a1", roomZoneId: "Master Bedroom" },
        { id: "a2", roomZoneId: "Lounge" },
      ],
      readings: [
        // Master Bedroom dries all the way to below threshold -> at goal.
        {
          location: "Master Bedroom",
          surfaceType: "plasterboard",
          moistureLevel: rawMoistureValues[0],
          recordedAt: FIVE_DAYS_AGO,
        },
        {
          location: "Master Bedroom",
          surfaceType: "plasterboard",
          moistureLevel: 1.0, // at/below the plasterboard dry threshold
          recordedAt: NOW,
        },
        // Lounge is still well above the target curve -> not at goal.
        {
          location: "Lounge",
          surfaceType: "carpet",
          moistureLevel: rawMoistureValues[1],
          recordedAt: FIVE_DAYS_AGO,
        },
        {
          location: "Lounge",
          surfaceType: "carpet",
          moistureLevel: rawMoistureValues[1],
          recordedAt: NOW,
        },
      ],
      now: NOW,
    });

    expect(digest).not.toBeNull();
    expect(digest).toMatchObject({ areasAtGoal: 1, totalAreas: 2 });
    expect(digest?.nextVisitLabel).toBeNull();

    const serialized = JSON.stringify(digest);
    for (const raw of rawMoistureValues) {
      expect(serialized).not.toContain(String(raw));
    }
  });

  it("returns null when no area has a moisture reading yet (nothing to report)", () => {
    const digest = buildDailyDigest({
      areas: [{ id: "a1", roomZoneId: "Master Bedroom" }],
      readings: [],
      now: NOW,
    });

    expect(digest).toBeNull();
  });
});
