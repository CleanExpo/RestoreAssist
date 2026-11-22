/**
 * RA-8508: the drying goal for a material is the reference (dry standard)
 * reading taken from unaffected like material in the same building. The fixed
 * guide values are used only when no reference reading exists, and are then
 * marked as a guide.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateDryingGoal,
  getDryStandard,
  getMoistureStatus,
  pickReferenceReadings,
  resolveDryingGoal,
} from "@/lib/iicrc-dry-standards";
import { buildDryingTimeline, isAreaAtDryingGoal } from "@/lib/portal/drying-timeline";

const t = (iso: string) => new Date(iso);

describe("pickReferenceReadings", () => {
  it("takes the newest valid baseline per material and ignores everything else", () => {
    const refs = pickReferenceReadings([
      // older baseline, superseded by the newer one below
      { surfaceType: "Timber", moistureLevel: 11, isBaseline: true, recordedAt: t("2026-11-01T00:00:00Z") },
      { surfaceType: "timber ", moistureLevel: 12.5, isBaseline: true, recordedAt: t("2026-11-02T00:00:00Z") },
      // invalidated baseline must never be used
      { surfaceType: "timber", moistureLevel: 30, isBaseline: true, recordedAt: t("2026-11-03T00:00:00Z"), invalidatedAt: t("2026-11-03T01:00:00Z") },
      // a monitoring reading is not a reference
      { surfaceType: "plasterboard", moistureLevel: 0.4, isBaseline: false },
      // a relative-humidity baseline cannot be compared with moisture content
      { surfaceType: "carpet", moistureLevel: 55, isBaseline: true, unit: "RH" },
      { surfaceType: "concrete", moistureLevel: 2.2, isBaseline: true, unit: "PERCENT_MC" },
    ]);
    expect(refs).toEqual({ timber: 12.5, concrete: 2.2 });
  });
});

describe("resolveDryingGoal", () => {
  it("uses the reference reading when one exists, even when a guide value exists", () => {
    const goal = resolveDryingGoal("timber", { timber: 12.5 });
    expect(goal).toEqual({ target: 12.5, basis: "reference" });
    expect(goal.target).not.toBe(getDryStandard("timber").dryThreshold);
  });

  it("reference wins over a stored target snapshot", () => {
    expect(resolveDryingGoal("timber", { timber: 12.5 }, 19)).toEqual({
      target: 12.5,
      basis: "reference",
    });
  });

  it("falls back to the guide value, marked as a guide, when there is no reference", () => {
    expect(resolveDryingGoal("timber", {})).toEqual({
      target: getDryStandard("timber").dryThreshold,
      basis: "guide",
    });
    expect(resolveDryingGoal("timber", {}, 17)).toEqual({ target: 17, basis: "guide" });
  });

  it("matches the reference to the material case- and space-insensitively", () => {
    expect(resolveDryingGoal(" Timber", { timber: 12.5 }).basis).toBe("reference");
  });
});

describe("getMoistureStatus with a reference reading", () => {
  it("is dry at or below the reference and not dry above it", () => {
    // 15% is dry against the timber guide (19%) but not against a 12.5% reference.
    expect(getMoistureStatus(15, "timber")).toBe("dry");
    expect(getMoistureStatus(15, "timber", 12.5)).not.toBe("dry");
    expect(getMoistureStatus(12.5, "timber", 12.5)).toBe("dry");
  });
});

describe("client portal drying timeline", () => {
  const base = {
    areas: [{ id: "a1", roomZoneId: "Lounge" }],
    now: t("2026-11-05T00:00:00Z"),
  };
  const reading = { location: "Lounge", surfaceType: "timber", moistureLevel: 15, recordedAt: t("2026-11-04T00:00:00Z") };

  it("is not at its drying goal when the reference reading is lower than the guide", () => {
    const [state] = buildDryingTimeline({
      ...base,
      readings: [
        reading,
        { location: "Hallway", surfaceType: "timber", moistureLevel: 12.5, recordedAt: t("2026-11-01T00:00:00Z"), isBaseline: true },
      ],
    });
    expect(isAreaAtDryingGoal(state)).toBe(false);
  });

  it("is at its drying goal on the guide when no reference exists", () => {
    const [state] = buildDryingTimeline({ ...base, readings: [reading] });
    expect(isAreaAtDryingGoal(state)).toBe(true);
  });
});

describe("evaluateDryingGoal (drying-goal PUT)", () => {
  const monitoring = [
    { id: "r1", location: "Lounge", surfaceType: "timber", moistureLevel: 15 },
  ];

  it("fails a reading that meets the guide but not the job's reference reading", () => {
    const result = evaluateDryingGoal(monitoring, { timber: 19 }, { timber: 12.5 });
    expect(result.failing).toHaveLength(1);
    expect(result.failing[0]).toMatchObject({ target: 12.5, basis: "reference" });
    expect(result.bases).toEqual(["reference"]);
  });

  it("passes the same reading on the guide when no reference exists, and says so", () => {
    const result = evaluateDryingGoal(monitoring, { timber: 19 }, {});
    expect(result.failing).toHaveLength(0);
    expect(result.bases).toEqual(["guide"]);
  });
});
