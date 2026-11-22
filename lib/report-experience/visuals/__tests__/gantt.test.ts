import { describe, expect, it } from "vitest";
import { buildGantt, type GanttRevision } from "../gantt";

const TZ = "Australia/Brisbane"; // UTC+10, no daylight saving

const plan: GanttRevision = {
  revision: "plan-1",
  createdAt: "2026-03-01T00:00:00+10:00",
  tasks: [
    { id: "t1", label: "Extraction", start: "2026-03-02", end: "2026-03-03", status: "complete" },
    { id: "t2", label: "Drying", start: "2026-03-03", end: "2026-03-07", status: "in-progress" },
    { id: "t3", label: "Repairs", start: "2026-03-08", end: "2026-03-10", status: "planned" },
    { id: "t4", label: "Final inspection", start: "2026-03-11", end: "2026-03-11", status: "planned" },
  ],
};

const current: GanttRevision = {
  revision: "plan-2",
  createdAt: "2026-03-05T09:00:00+10:00",
  tasks: [
    { id: "t1", label: "Extraction", start: "2026-03-02", end: "2026-03-03", status: "complete" },
    { id: "t2", label: "Drying", start: "2026-03-03", end: "2026-03-09", status: "in-progress" },
    { id: "t3", label: "Repairs", start: "2026-03-10", end: "2026-03-12", status: "planned" },
    { id: "t5", label: "Mould clearance check", start: "2026-03-12", end: "2026-03-12", status: "planned" },
  ],
};

const byId = (g: ReturnType<typeof buildGantt>, id: string) => g.rows.find((r) => r.id === id)!;

describe("buildGantt changes against the plan", () => {
  const g = buildGantt({ plan, current, now: "2026-03-06T10:00:00+10:00", timeZone: TZ });

  it("labels both revisions so the reader can see which plan is shown", () => {
    expect(g.planRevision).toBe("plan-1");
    expect(g.currentRevision).toBe("plan-2");
  });

  it("classifies unchanged, resized, moved, added and removed tasks", () => {
    expect(byId(g, "t1").change).toBe("unchanged");
    expect(byId(g, "t2").change).toBe("resized");
    expect(byId(g, "t2").durationDeltaDays).toBe(2);
    expect(byId(g, "t3").change).toBe("moved");
    expect(byId(g, "t3").startShiftDays).toBe(2);
    expect(byId(g, "t5").change).toBe("added");
    expect(byId(g, "t4").change).toBe("removed");
  });

  it("keeps removed tasks visible (a deletion must not hide a slip)", () => {
    expect(g.rows.map((r) => r.id)).toContain("t4");
    expect(byId(g, "t4").current).toBeNull();
    expect(byId(g, "t4").plan).not.toBeNull();
  });

  it("flags a task late only when its end day has passed and it is not complete", () => {
    expect(byId(g, "t1").late).toBe(false);
    expect(byId(g, "t2").late).toBe(false); // ends 9 Mar, today is 6 Mar
    const later = buildGantt({ plan, current, now: "2026-03-10T10:00:00+10:00", timeZone: TZ });
    expect(byId(later, "t2").late).toBe(true);
    expect(byId(later, "t1").late).toBe(false); // complete
  });

  it("gives a table alternative with every task, its dates and its change", () => {
    expect(g.table).toHaveLength(5);
    expect(g.table.find((r) => r.id === "t3")).toMatchObject({
      label: "Repairs",
      planned: "8 Mar 2026 to 10 Mar 2026",
      current: "10 Mar 2026 to 12 Mar 2026",
      change: "moved",
    });
  });
});

describe("buildGantt time zone and day maths", () => {
  it("counts days in the report zone, not UTC", () => {
    // 2026-03-02T23:30+10:00 is still 2 Mar in Brisbane but 2 Mar 13:30 UTC; the
    // next case crosses UTC midnight the other way.
    const p: GanttRevision = {
      revision: "a",
      createdAt: "2026-03-01T00:00:00+10:00",
      tasks: [{ id: "x", label: "Visit", start: "2026-03-02T05:00:00+10:00", end: "2026-03-02T23:30:00+10:00", status: "planned" }],
    };
    const g = buildGantt({ plan: p, current: p, now: "2026-03-02T12:00:00+10:00", timeZone: TZ });
    // 05:00+10:00 is 19:00 UTC on 1 Mar; the Brisbane day is 2 Mar.
    expect(g.rows[0].plan).toMatchObject({ start: "2026-03-02", end: "2026-03-02", days: 1 });
  });

  it("refuses a time with no offset instead of guessing a zone", () => {
    const p: GanttRevision = {
      revision: "a",
      createdAt: "2026-03-01T00:00:00+10:00",
      tasks: [{ id: "x", label: "Visit", start: "2026-03-02T05:00:00", end: "2026-03-03", status: "planned" }],
    };
    const g = buildGantt({ plan: p, current: p, now: "2026-03-02T12:00:00+10:00", timeZone: TZ });
    expect(g.rows[0].current).toBeNull();
    expect(g.rows[0].dateState).toBe("no-date");
    expect(g.rows[0].dateProblem).toBe("start-or-end-missing-or-invalid");
  });

  it("rejects an unknown time zone", () => {
    expect(() => buildGantt({ plan, current, now: "2026-03-06T10:00:00+10:00", timeZone: "Mars/Olympus" })).toThrow(RangeError);
  });
});

describe("buildGantt safe no-date state", () => {
  it("shows a task with no dates as no-date, never as an invented bar", () => {
    const c: GanttRevision = {
      ...current,
      tasks: [...current.tasks, { id: "t6", label: "Insurer approval", start: null, end: null, status: "planned" }],
    };
    const g = buildGantt({ plan, current: c, now: "2026-03-06T10:00:00+10:00", timeZone: TZ });
    const row = byId(g, "t6");
    expect(row.dateState).toBe("no-date");
    expect(row.current).toBeNull();
    expect(row.late).toBe(false);
    expect(row.leftPct).toBeNull();
    expect(g.table.find((r) => r.id === "t6")!.current).toBe("No date recorded");
  });

  it("treats an end before the start as a recorded problem, not a negative bar", () => {
    const c: GanttRevision = {
      ...current,
      tasks: [{ id: "t2", label: "Drying", start: "2026-03-09", end: "2026-03-03", status: "planned" }],
    };
    const g = buildGantt({ plan, current: c, now: "2026-03-06T10:00:00+10:00", timeZone: TZ });
    expect(byId(g, "t2").dateProblem).toBe("end-before-start");
    expect(byId(g, "t2").current).toBeNull();
  });

  it("returns an empty axis when no task has a date", () => {
    const c: GanttRevision = { revision: "p", createdAt: "2026-03-01T00:00:00+10:00", tasks: [{ id: "n", label: "N", start: null, end: null }] };
    const g = buildGantt({ plan: c, current: c, now: "2026-03-06T10:00:00+10:00", timeZone: TZ });
    expect(g.axis).toBeNull();
  });

  it("throws on a duplicate task id in one revision (evidence integrity)", () => {
    const c: GanttRevision = { ...current, tasks: [current.tasks[0], current.tasks[0]] };
    expect(() => buildGantt({ plan, current: c, now: "2026-03-06T10:00:00+10:00", timeZone: TZ })).toThrow(/duplicate/i);
  });
});

describe("buildGantt bar geometry", () => {
  it("positions bars as percentages of one shared axis", () => {
    const g = buildGantt({ plan, current, now: "2026-03-06T10:00:00+10:00", timeZone: TZ });
    expect(g.axis).toEqual({ start: "2026-03-02", end: "2026-03-12", days: 11 });
    const t1 = byId(g, "t1");
    expect(t1.leftPct).toBeCloseTo(0, 5);
    expect(t1.widthPct).toBeCloseTo((2 / 11) * 100, 5);
    const t5 = byId(g, "t5");
    expect(t5.leftPct! + t5.widthPct!).toBeCloseTo(100, 5);
  });
});

describe("buildGantt review findings (RA-8107 discovery sweep)", () => {
  const now = "2026-03-06T10:00:00+10:00";

  it("shows dates newly recorded on a task that had none as a change", () => {
    const p: GanttRevision = { revision: "p", createdAt: "2026-03-01T00:00:00+10:00", tasks: [{ id: "x", label: "X", start: null, end: null }] };
    const c: GanttRevision = { revision: "c", createdAt: "2026-03-02T00:00:00+10:00", tasks: [{ id: "x", label: "X", start: "2026-03-04", end: "2026-03-05" }] };
    const g = buildGantt({ plan: p, current: c, now, timeZone: TZ });
    expect(g.rows[0].change).toBe("dates-added");
  });

  it("requires the clock to be an instant with an offset, not a date or a rolled-over date", () => {
    for (const bad of ["2026-03-02", "2026-03-02T10:00:00", "2026-02-30T10:00:00+10:00"]) {
      expect(() => buildGantt({ plan, current, now: bad, timeZone: TZ })).toThrow(/offset/i);
    }
  });

  it("treats an impossible task date as no date", () => {
    const c: GanttRevision = { ...current, tasks: [{ id: "t2", label: "Drying", start: "2026-02-30T09:00:00+10:00", end: "2026-03-09" }] };
    const g = buildGantt({ plan, current: c, now, timeZone: TZ });
    expect(g.rows.find((r) => r.id === "t2")!.dateState).toBe("no-date");
  });
});
