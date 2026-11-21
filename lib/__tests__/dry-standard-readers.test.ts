/**
 * RA-8508 review round (discovery sweep, 21/11/2026). Three kinds of defect:
 *
 *  1. A reader decided a drying goal or a dry/wet status without calling the
 *     owner in lib/iicrc-dry-standards.ts (PDF Section 4 bands, PDF Section 9
 *     table, the daily monitoring report's own threshold copy, the trend chart).
 *  2. The set of readings that count (progress vs reference, invalidated, unit)
 *     was decided separately by each reader.
 *  3. The attribution guard was a term list over source lines and missed
 *     wording such as "target thresholds per §11.4" (see the attribution test).
 *
 * Each test here asserts on the owner's output, so a reader that stops calling
 * the owner, or an owner that loses a rule, turns these red.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dryingGoalTableRows,
  evaluateDryingGoal,
  getDryStandard,
  isProgressReading,
  moistureRowGoal,
  pickReferenceReadings,
  readingGoalStatus,
  resolveDryingGoal,
} from "@/lib/iicrc-dry-standards";
import { isMoistureContentUnit } from "@/lib/moisture/units";
import { relationalMoistureToPdfRows } from "@/lib/reports/pdf-moisture-readings";
import { buildDryingTimeline, isAreaAtDryingGoal } from "@/lib/portal/drying-timeline";

const t = (iso: string) => new Date(iso);

describe("kind 2: one rule for which readings count", () => {
  it("a progress reading is neither a reference nor invalidated", () => {
    expect(isProgressReading({ isBaseline: false })).toBe(true);
    expect(isProgressReading({ isBaseline: true })).toBe(false);
    expect(isProgressReading({ isBaseline: false, invalidatedAt: t("2026-11-01T00:00:00Z") })).toBe(false);
  });

  it("moisture-content units: no unit, PERCENT_MC and WME count; RH and CELSIUS do not", () => {
    expect(isMoistureContentUnit(null)).toBe(true);
    expect(isMoistureContentUnit("PERCENT_MC")).toBe(true);
    expect(isMoistureContentUnit("WME")).toBe(true);
    expect(isMoistureContentUnit("RH")).toBe(false);
    expect(isMoistureContentUnit("CELSIUS")).toBe(false);
  });

  it("a WME baseline is a reference; an RH baseline is not", () => {
    expect(
      pickReferenceReadings([
        { surfaceType: "timber", moistureLevel: 12, isBaseline: true, unit: "WME" },
        { surfaceType: "carpet", moistureLevel: 55, isBaseline: true, unit: "RH" },
      ]),
    ).toEqual({ timber: 12 });
  });

  it("a reference never sets the goal for a non-moisture-content reading", () => {
    const result = evaluateDryingGoal(
      [{ location: "Lounge", surfaceType: "timber", moistureLevel: 10, unit: "RH" }],
      {},
      { timber: 12.5 },
    );
    expect(result.snapshot[0]).toMatchObject({ targetBasis: "guide" });
  });

  it("the portal timeline ignores invalidated readings", () => {
    const [state] = buildDryingTimeline({
      areas: [{ id: "a1", roomZoneId: "Lounge" }],
      now: t("2026-11-05T00:00:00Z"),
      readings: [
        { location: "Lounge", surfaceType: "timber", moistureLevel: 22, recordedAt: t("2026-11-03T00:00:00Z") },
        // later reading, invalidated: it must not make the area look dry
        { location: "Lounge", surfaceType: "timber", moistureLevel: 10, recordedAt: t("2026-11-04T00:00:00Z"), invalidatedAt: t("2026-11-04T01:00:00Z") },
        { location: "Hallway", surfaceType: "timber", moistureLevel: 12.5, recordedAt: t("2026-11-01T00:00:00Z"), isBaseline: true },
      ],
    });
    expect(isAreaAtDryingGoal(state)).toBe(false);
  });
});

describe("kind 2: no reader re-writes the progress-reading rule", () => {
  it("only the owner filters on isBaseline and invalidatedAt together", () => {
    const root = join(__dirname, "..", "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) files.push(p);
      }
    };
    for (const d of ["app", "lib", "components"]) walk(join(root, d));
    const rule = /isBaseline\s*&&\s*!\s*[\w.?]*invalidatedAt|invalidatedAt\s*&&\s*!\s*[\w.?]*isBaseline/;
    const hits = files
      .filter((f) => !f.endsWith(join("lib", "iicrc-dry-standards.ts")))
      .filter((f) => rule.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(hits).toEqual([]);
    // positive control: the rule sees the hand-written form
    expect(rule.test("(r) => !r.isBaseline && !r.invalidatedAt")).toBe(true);
  });
});

describe("kind 1: every reader gets the goal from the owner", () => {
  it("guide and stored-target lookups ignore case and spaces", () => {
    expect(getDryStandard(" Plasterboard").material).toBe("plasterboard");
    const result = evaluateDryingGoal(
      [{ location: "Bath", surfaceType: "Plasterboard", moistureLevel: 10 }],
      { plasterboard: 1.5 },
      {},
    );
    expect(result.failing).toHaveLength(1);
    expect(result.failing[0]).toMatchObject({ target: 1.5, basis: "guide" });
  });

  it("PDF Section 4 rows judge a reading against the job's reference, not fixed bands", () => {
    const refs = { timber: 12.5 };
    const row = moistureRowGoal({ material: "timber", moistureLevel: 15 }, refs);
    expect(row.goalText).toBe("≤12.5%");
    expect(row.status).not.toBe("WITHIN GOAL");
    expect(moistureRowGoal({ material: "timber", moistureLevel: 12 }, refs).status).toBe("WITHIN GOAL");
    // a reference reading is labelled as such, never judged against itself
    expect(moistureRowGoal({ material: "timber", moistureLevel: 12.5, isBaseline: true }, refs).status).toBe("REFERENCE");
    // no reference: the guide value, not a hard-coded 14% / 18%
    expect(moistureRowGoal({ material: "plasterboard", moistureLevel: 1 }, refs).goalText).toBe(
      `≤${getDryStandard("plasterboard").dryThreshold}%`,
    );
  });

  it("PDF Section 9 lists a guide row for every monitored material without a reference", () => {
    const rows = dryingGoalTableRows([
      { surfaceType: "timber", moistureLevel: 12.5, isBaseline: true },
      { surfaceType: "timber", moistureLevel: 15 },
      { surfaceType: "carpet", moistureLevel: 8 },
    ]);
    expect(rows).toEqual([
      { material: "timber", target: 12.5, basis: "reference" },
      { material: "carpet", target: getDryStandard("carpet").dryThreshold, basis: "guide" },
    ]);
  });

  it("PDF Section 9 shows the full guide table, marked as a guide, when nothing was measured", () => {
    const rows = dryingGoalTableRows([]);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((r) => r.basis === "guide")).toBe(true);
  });

  it("PDF rows keep the unit, so an RH baseline never becomes a moisture goal (verdict round)", () => {
    const rows = relationalMoistureToPdfRows([
      { location: "Hallway", surfaceType: "timber", moistureLevel: 55, unit: "RH", isBaseline: true },
      { location: "Lounge", surfaceType: "timber", moistureLevel: 20, unit: null },
    ]);
    expect(rows[0].unit).toBe("RH");
    const goal = dryingGoalTableRows(rows as never);
    expect(goal).toEqual([{ material: "timber", target: getDryStandard("timber").dryThreshold, basis: "guide" }]);
  });

  it("water assessment counts readings with the owner's status, not its own comparison", () => {
    const refs = { timber: 12.5 };
    // 15% timber against a 12.5% reference is not dry; an RH reading ignores the reference.
    expect(readingGoalStatus({ surfaceType: "timber", moistureLevel: 15, unit: null }, refs).status).not.toBe("dry");
    expect(readingGoalStatus({ surfaceType: "timber", moistureLevel: 15, unit: "RH" }, refs).goal.basis).toBe("guide");
  });

  it("resolveDryingGoal applies a reference only to moisture-content readings", () => {
    expect(resolveDryingGoal("timber", { timber: 12.5 }, undefined, "WME").basis).toBe("reference");
    expect(resolveDryingGoal("timber", { timber: 12.5 }, undefined, "RH").basis).toBe("guide");
  });
});
