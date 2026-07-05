import { describe, it, expect } from "vitest";
import { buildDryingTimeline } from "../drying-timeline";

const NOW = new Date("2026-07-05T00:00:00Z");
const FIVE_DAYS_AGO = new Date("2026-06-30T00:00:00Z");

describe("buildDryingTimeline", () => {
  it("marks an area on-track when the latest reading tracks the expected target curve", () => {
    const states = buildDryingTimeline({
      areas: [{ id: "area_1", roomZoneId: "Master Bedroom" }],
      readings: [
        {
          location: "Master Bedroom",
          surfaceType: "plasterboard",
          moistureLevel: 40,
          recordedAt: FIVE_DAYS_AGO,
        },
        {
          location: "Master Bedroom",
          surfaceType: "plasterboard",
          moistureLevel: 8, // close to the modelled 5-day target for plasterboard
          recordedAt: NOW,
        },
      ],
      now: NOW,
    });

    expect(states).toHaveLength(1);
    expect(states[0].areaId).toBe("area_1");
    expect(states[0].areaLabel).toBe("Master Bedroom");
    expect(states[0].status).toBe("on-track");
    expect(states[0].estimateLabel).toMatch(/^Estimate: on track/);
  });

  it("flags an area needs-attention when it sits well above the expected target curve", () => {
    const states = buildDryingTimeline({
      areas: [{ id: "area_1", roomZoneId: "Master Bedroom" }],
      readings: [
        {
          location: "Master Bedroom",
          surfaceType: "plasterboard",
          moistureLevel: 40,
          recordedAt: FIVE_DAYS_AGO,
        },
        {
          location: "Master Bedroom",
          surfaceType: "plasterboard",
          moistureLevel: 35, // barely moved after 5 days — well behind schedule
          recordedAt: NOW,
        },
      ],
      now: NOW,
    });

    expect(states[0].status).toBe("needs-attention");
    expect(states[0].estimateLabel).toMatch(/^Estimate: needs attention/);
  });

  it("marks an area on-track and complete once the latest reading is at or below the dry standard", () => {
    const states = buildDryingTimeline({
      areas: [{ id: "area_1", roomZoneId: "Master Bedroom" }],
      readings: [
        {
          location: "Master Bedroom",
          surfaceType: "plasterboard",
          moistureLevel: 40,
          recordedAt: FIVE_DAYS_AGO,
        },
        {
          location: "Master Bedroom",
          surfaceType: "plasterboard",
          moistureLevel: 1.0, // at/below the 1.5% plasterboard dry threshold
          recordedAt: NOW,
        },
      ],
      now: NOW,
    });

    expect(states[0].status).toBe("on-track");
    expect(states[0].estimateLabel).toBe(
      "Estimate: drying complete for this area.",
    );
  });

  it("omits areas with no moisture readings yet", () => {
    const states = buildDryingTimeline({
      areas: [
        { id: "area_1", roomZoneId: "Master Bedroom" },
        { id: "area_2", roomZoneId: "Hallway" },
      ],
      readings: [
        {
          location: "Master Bedroom",
          surfaceType: "timber",
          moistureLevel: 20,
          recordedAt: FIVE_DAYS_AGO,
        },
      ],
      now: NOW,
    });

    expect(states).toHaveLength(1);
    expect(states[0].areaLabel).toBe("Master Bedroom");
  });

  it("picks the most frequent surface type per area for the material model", () => {
    const states = buildDryingTimeline({
      areas: [{ id: "area_1", roomZoneId: "Kitchen" }],
      readings: [
        {
          location: "Kitchen",
          surfaceType: "concrete",
          moistureLevel: 30,
          recordedAt: FIVE_DAYS_AGO,
        },
        {
          location: "Kitchen",
          surfaceType: "carpet",
          moistureLevel: 30,
          recordedAt: FIVE_DAYS_AGO,
        },
        {
          location: "Kitchen",
          surfaceType: "carpet",
          moistureLevel: 4,
          recordedAt: NOW,
        },
      ],
      now: NOW,
    });

    // Carpet dries fast (baseK 0.45) — the majority surfaceType — so 4% after
    // 5 days reads as on-track under the carpet model, not the slower concrete one.
    expect(states[0].status).toBe("on-track");
  });

  it("defaults to Category 2 / Class 2 when no drying goal target has been set", () => {
    expect(() =>
      buildDryingTimeline({
        areas: [{ id: "area_1", roomZoneId: "Master Bedroom" }],
        readings: [
          {
            location: "Master Bedroom",
            surfaceType: "timber",
            moistureLevel: 30,
            recordedAt: FIVE_DAYS_AGO,
          },
        ],
        targetCategory: null,
        targetClass: null,
        now: NOW,
      }),
    ).not.toThrow();
  });

  it("never exposes raw moisture readings, thresholds, or percentages in the curated output", () => {
    const rawMoistureValues = [37.42, 68.91];
    const states = buildDryingTimeline({
      areas: [
        { id: "area_1", roomZoneId: "Master Bedroom" },
        { id: "area_2", roomZoneId: "Lounge" },
      ],
      readings: [
        {
          location: "Master Bedroom",
          surfaceType: "timber",
          moistureLevel: rawMoistureValues[0],
          recordedAt: FIVE_DAYS_AGO,
        },
        {
          location: "Master Bedroom",
          surfaceType: "timber",
          moistureLevel: 22,
          recordedAt: NOW,
        },
        {
          location: "Lounge",
          surfaceType: "carpet",
          moistureLevel: rawMoistureValues[1],
          recordedAt: FIVE_DAYS_AGO,
        },
        {
          location: "Lounge",
          surfaceType: "carpet",
          moistureLevel: 60,
          recordedAt: NOW,
        },
      ],
      now: NOW,
    });

    for (const state of states) {
      expect(Object.keys(state).sort()).toEqual(
        ["areaId", "areaLabel", "estimateLabel", "status"].sort(),
      );
      expect(["on-track", "needs-attention"]).toContain(state.status);
      expect(state.estimateLabel).not.toMatch(/%/);
    }

    const serialized = JSON.stringify(states);
    for (const raw of rawMoistureValues) {
      expect(serialized).not.toContain(String(raw));
    }
    // Dry-standard threshold constants must not leak either.
    expect(serialized).not.toContain("19"); // timber dryThreshold
    expect(serialized).not.toContain("1.5"); // plasterboard dryThreshold
  });
});
