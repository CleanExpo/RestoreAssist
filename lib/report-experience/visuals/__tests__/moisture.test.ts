import { describe, expect, it } from "vitest";
import { buildMoistureSeries, type MoistureInputReading } from "../moisture";

const TZ = "Australia/Brisbane";

function r(id: string, roomId: string, observedAt: string, value: number, unit: MoistureInputReading["unit"] = "WME"): MoistureInputReading {
  return { id, roomId, observedAt, value, unit };
}

const opts = { timeZone: TZ, targets: { WME: 16 } as const, roomLabels: { kitchen: "Kitchen", hall: "Hall" } };

describe("buildMoistureSeries grouping and time zone", () => {
  it("keeps rooms and units apart", () => {
    const s = buildMoistureSeries(
      [
        r("a", "kitchen", "2026-03-02T09:00:00+10:00", 30),
        r("b", "hall", "2026-03-02T09:00:00+10:00", 28),
        r("c", "kitchen", "2026-03-02T09:00:00+10:00", 14.2, "G_PER_KG"),
      ],
      opts,
    );
    expect(s.map((x) => `${x.roomId}/${x.unit}`).sort()).toEqual(["hall/WME", "kitchen/G_PER_KG", "kitchen/WME"]);
    expect(s.find((x) => x.roomId === "kitchen" && x.unit === "WME")!.roomLabel).toBe("Kitchen");
  });

  it("assigns the calendar day in the report zone (a 23:30 UTC reading is the next Brisbane day)", () => {
    const s = buildMoistureSeries([r("a", "kitchen", "2026-03-02T23:30:00Z", 30)], opts);
    expect(s[0].points[0].localDate).toBe("2026-03-03");
  });

  it("sorts by time regardless of input order", () => {
    const s = buildMoistureSeries(
      [r("b", "kitchen", "2026-03-03T09:00:00+10:00", 26), r("a", "kitchen", "2026-03-02T09:00:00+10:00", 30)],
      opts,
    );
    expect(s[0].points.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("rejects a reading time with no offset", () => {
    expect(() => buildMoistureSeries([r("a", "kitchen", "2026-03-02T09:00:00", 30)], opts)).toThrow(/offset/i);
  });
});

describe("buildMoistureSeries missing and repeated readings", () => {
  it("lists days with no reading as gaps and never interpolates a value for them", () => {
    const s = buildMoistureSeries(
      [r("a", "kitchen", "2026-03-02T09:00:00+10:00", 30), r("b", "kitchen", "2026-03-05T09:00:00+10:00", 22)],
      opts,
    )[0];
    expect(s.missingDays).toEqual(["2026-03-03", "2026-03-04"]);
    expect(s.points).toHaveLength(2);
  });

  it("collapses an identical repeat at the same instant and says so", () => {
    const s = buildMoistureSeries(
      [r("a", "kitchen", "2026-03-02T09:00:00+10:00", 30), r("a2", "kitchen", "2026-03-02T09:00:00+10:00", 30)],
      opts,
    )[0];
    expect(s.points).toHaveLength(1);
    expect(s.repeatsCollapsed).toBe(1);
    expect(s.conflicts).toHaveLength(0);
  });

  it("does not pick between different values at the same instant: both go to the table, neither is plotted", () => {
    const s = buildMoistureSeries(
      [
        r("a", "kitchen", "2026-03-02T09:00:00+10:00", 30),
        r("b", "kitchen", "2026-03-02T09:00:00+10:00", 24),
        r("c", "kitchen", "2026-03-03T09:00:00+10:00", 22),
      ],
      opts,
    )[0];
    expect(s.conflicts).toHaveLength(1);
    expect(s.conflicts[0].values).toEqual([30, 24]);
    expect(s.points.map((p) => p.id)).toEqual(["c"]);
    expect(s.table.filter((row) => row.conflict)).toHaveLength(2);
  });

  it("returns an empty list for no readings", () => {
    expect(buildMoistureSeries([], opts)).toEqual([]);
  });
});

describe("buildMoistureSeries dry-target evidence and the safe no-date state", () => {
  it("states a dry date only when the reading at or below target is the evidence", () => {
    const s = buildMoistureSeries(
      [
        r("a", "kitchen", "2026-03-02T09:00:00+10:00", 30),
        r("b", "kitchen", "2026-03-04T09:00:00+10:00", 16),
        r("c", "kitchen", "2026-03-05T09:00:00+10:00", 15),
      ],
      opts,
    )[0];
    expect(s.dry).toEqual({ state: "evidenced", date: "2026-03-04", readingId: "b", target: 16 });
  });

  it("no date while the latest reading is above target", () => {
    const s = buildMoistureSeries(
      [r("a", "kitchen", "2026-03-02T09:00:00+10:00", 30), r("b", "kitchen", "2026-03-04T09:00:00+10:00", 20)],
      opts,
    )[0];
    expect(s.dry).toEqual({ state: "no-date", reason: "above-target", target: 16 });
  });

  it("no date after a rebound above target", () => {
    const s = buildMoistureSeries(
      [
        r("a", "kitchen", "2026-03-02T09:00:00+10:00", 30),
        r("b", "kitchen", "2026-03-03T09:00:00+10:00", 15),
        r("c", "kitchen", "2026-03-04T09:00:00+10:00", 19),
      ],
      opts,
    )[0];
    expect(s.dry.state).toBe("no-date");
    expect(s.dry).toMatchObject({ reason: "above-target" });
  });

  it("dry date is the first reading of the final run at or below target", () => {
    const s = buildMoistureSeries(
      [
        r("a", "kitchen", "2026-03-02T09:00:00+10:00", 15),
        r("b", "kitchen", "2026-03-03T09:00:00+10:00", 19),
        r("c", "kitchen", "2026-03-04T09:00:00+10:00", 15),
        r("d", "kitchen", "2026-03-05T09:00:00+10:00", 14),
      ],
      opts,
    )[0];
    expect(s.dry).toMatchObject({ state: "evidenced", readingId: "c", date: "2026-03-04" });
  });

  it("no date when no target is recorded for the unit (WME needs a stated goal)", () => {
    const s = buildMoistureSeries([r("a", "kitchen", "2026-03-02T09:00:00+10:00", 10)], { ...opts, targets: {} })[0];
    expect(s.dry).toEqual({ state: "no-date", reason: "no-target", target: null });
  });

  it("g/kg is ambient air, not a drying goal: never gives a dry date", () => {
    const s = buildMoistureSeries([r("a", "kitchen", "2026-03-02T09:00:00+10:00", 5, "G_PER_KG")], { ...opts, targets: { WME: 16, G_PER_KG: 8 } })[0];
    expect(s.dry).toEqual({ state: "not-applicable" });
  });

  it("ignores a non-finite or non-positive target", () => {
    const s = buildMoistureSeries([r("a", "kitchen", "2026-03-02T09:00:00+10:00", 10)], { ...opts, targets: { WME: Number.NaN } })[0];
    expect(s.dry).toMatchObject({ state: "no-date", reason: "no-target" });
  });
});

describe("buildMoistureSeries stall flag", () => {
  const base = (values: number[]) =>
    values.map((v, i) => r(`r${i}`, "kitchen", `2026-03-0${i + 2}T09:00:00+10:00`, v));

  it("flags three visits above target with under 5% total fall", () => {
    const s = buildMoistureSeries(base([30, 29.5, 29.4]), opts)[0];
    expect(s.stall).toBe(true);
  });

  it("flags a rise", () => {
    expect(buildMoistureSeries(base([30, 31, 32]), opts)[0].stall).toBe(true);
  });

  it("does not flag steady progress", () => {
    expect(buildMoistureSeries(base([30, 26, 22]), opts)[0].stall).toBe(false);
  });

  it("does not flag two visits (too little evidence) or a series already dry", () => {
    expect(buildMoistureSeries(base([30, 30]), opts)[0].stall).toBe(false);
    expect(buildMoistureSeries(base([16, 15.9, 15.8]), opts)[0].stall).toBe(false);
  });

  it("does not flag when there is no target to be above", () => {
    expect(buildMoistureSeries(base([30, 30, 30]), { ...opts, targets: {} })[0].stall).toBe(false);
  });
});

describe("buildMoistureSeries table alternative", () => {
  it("gives every reading with its local date, room and unit", () => {
    const s = buildMoistureSeries([r("a", "kitchen", "2026-03-02T09:00:00+10:00", 30)], opts)[0];
    expect(s.table).toEqual([
      { id: "a", localDate: "2026-03-02", observedAt: "2026-03-02T09:00:00+10:00", value: 30, conflict: false },
    ]);
  });
});
