import { describe, it, expect } from "vitest";
import {
  buildDryingTimeline,
  DRY_COMPLETE_ESTIMATE_LABEL,
  isAreaAtDryingGoal,
} from "../drying-timeline";

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

  it("judges each material in an area on its own reading, not the most common material's model", () => {
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

    // Carpet at 4% after 5 days is on its own curve, but the concrete has not
    // moved from 30% — the area is behind and must not read as complete.
    expect(states[0].status).toBe("needs-attention");
    expect(isAreaAtDryingGoal(states[0])).toBe(false);
  });

  // RA-8536: Codex reproduction. Two earlier timber readings of 30% and a
  // latest plasterboard reading of 10%. Timber is the most common material, so
  // the old code compared the plasterboard 10% with the timber goal (19%) and
  // said "drying complete". Plasterboard's own goal is 1.5%; timber has not
  // been re-read below its goal either.
  it("does not show drying complete when the latest reading meets only another material's goal", () => {
    const states = buildDryingTimeline({
      areas: [{ id: "area_1", roomZoneId: "Lounge" }],
      readings: [
        {
          location: "Lounge",
          surfaceType: "timber",
          moistureLevel: 30,
          recordedAt: FIVE_DAYS_AGO,
        },
        {
          location: "Lounge",
          surfaceType: "timber",
          moistureLevel: 30,
          recordedAt: new Date("2026-07-01T00:00:00Z"),
        },
        {
          location: "Lounge",
          surfaceType: "plasterboard",
          moistureLevel: 10,
          recordedAt: NOW,
        },
      ],
      now: NOW,
    });

    expect(states).toHaveLength(1);
    expect(isAreaAtDryingGoal(states[0])).toBe(false);
    expect(states[0].estimateLabel).not.toBe(DRY_COMPLETE_ESTIMATE_LABEL);
  });

  it("shows drying complete only when every material is at its own goal", () => {
    const base = [
      {
        location: "Lounge",
        surfaceType: "timber",
        moistureLevel: 30,
        recordedAt: FIVE_DAYS_AGO,
      },
      {
        location: "Lounge",
        surfaceType: "plasterboard",
        moistureLevel: 20,
        recordedAt: FIVE_DAYS_AGO,
      },
      {
        location: "Lounge",
        surfaceType: "timber",
        moistureLevel: 18, // at/below timber's own 19% goal
        recordedAt: NOW,
      },
    ];

    const plasterboardStillWet = buildDryingTimeline({
      areas: [{ id: "area_1", roomZoneId: "Lounge" }],
      readings: [
        ...base,
        {
          location: "Lounge",
          surfaceType: "plasterboard",
          moistureLevel: 3, // above plasterboard's own 1.5% goal
          recordedAt: NOW,
        },
      ],
      now: NOW,
    });
    expect(isAreaAtDryingGoal(plasterboardStillWet[0])).toBe(false);

    const bothDry = buildDryingTimeline({
      areas: [{ id: "area_1", roomZoneId: "Lounge" }],
      readings: [
        ...base,
        {
          location: "Lounge",
          surfaceType: "plasterboard",
          moistureLevel: 1.2, // at/below plasterboard's own 1.5% goal
          recordedAt: NOW,
        },
      ],
      now: NOW,
    });
    expect(bothDry[0].status).toBe("on-track");
    expect(bothDry[0].estimateLabel).toBe(DRY_COMPLETE_ESTIMATE_LABEL);
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
