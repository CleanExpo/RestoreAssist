import { describe, expect, it } from "vitest";
import {
  chartReadingGoal,
  chartReferenceLines,
  getMoistureStatus,
  pickReferenceReadings,
} from "@/lib/iicrc-dry-standards";

// RA-8509: the moisture charts drew only the fixed guide line. These are the
// two rules every chart now calls: the job's reference reading wins, and the
// guide applies only when there is none.

describe("chartReadingGoal", () => {
  it("uses the material's reference reading when one exists", () => {
    // Timber guide: dry at 19. Reference from unaffected timber: 12.
    const goal = chartReadingGoal(
      { surfaceType: "Timber", moistureLevel: 14 },
      { timber: 12 },
    );
    expect(goal).toEqual({ target: 12, basis: "reference", status: "drying" });
  });

  it("falls back to the guide row when the material has no reference (clean twin)", () => {
    const goal = chartReadingGoal(
      { surfaceType: "Timber", moistureLevel: 14 },
      { plasterboard: 0.8 },
    );
    expect(goal).toEqual({ target: 19, basis: "guide", status: "dry" });
    // Same answer as the guide-only status the charts used before.
    expect(goal.status).toBe(getMoistureStatus(14, "timber"));
  });

  it("keeps the chart's own guide row when it passes one", () => {
    // The trend chart judges every location against the timber guide.
    const goal = chartReadingGoal(
      { surfaceType: "Plasterboard wall", moistureLevel: 18 },
      {},
      "timber",
    );
    expect(goal).toEqual({ target: 19, basis: "guide", status: "dry" });
  });

  it("never applies a moisture-content reference to an RH reading", () => {
    const goal = chartReadingGoal(
      { surfaceType: "timber", moistureLevel: 14, unit: "RH" },
      { timber: 12 },
    );
    expect(goal.basis).toBe("guide");
  });

  it("takes references from pickReferenceReadings, skipping an invalidated one", () => {
    const refs = pickReferenceReadings([
      { surfaceType: "timber", moistureLevel: 12, isBaseline: true, unit: null, invalidatedAt: null },
      { surfaceType: "plasterboard", moistureLevel: 0.5, isBaseline: true, unit: null, invalidatedAt: "2026-11-20T00:00:00Z" },
    ]);
    expect(chartReadingGoal({ surfaceType: "timber", moistureLevel: 13 }, refs).basis).toBe("reference");
    expect(chartReadingGoal({ surfaceType: "plasterboard", moistureLevel: 1 }, refs).basis).toBe("guide");
  });
});

describe("chartReferenceLines", () => {
  it("returns one line per material on the chart with a reference, first spelling kept", () => {
    expect(
      chartReferenceLines(["Timber", "timber ", "Plasterboard", "Carpet"], {
        timber: 12,
        carpet: 2,
        concrete: 3,
      }),
    ).toEqual([
      { material: "Timber", target: 12 },
      { material: "Carpet", target: 2 },
    ]);
  });

  it("is empty when no material on the chart has a reference (guide line case)", () => {
    expect(chartReferenceLines(["Timber"], { concrete: 3 })).toEqual([]);
    expect(chartReferenceLines(["Timber"])).toEqual([]);
  });
});
