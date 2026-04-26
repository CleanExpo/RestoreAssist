import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const tx = {
    progressTransition: { findMany: vi.fn() },
    overrideGovernanceReport: { upsert: vi.fn() },
  };
  return { prisma: tx };
});

import { prisma } from "@/lib/prisma";
import {
  parseGapArray,
  runOverrideGovernance,
  __M15_INTERNAL,
} from "../override-governance";

const findMany = (prisma as unknown as {
  progressTransition: { findMany: ReturnType<typeof vi.fn> };
}).progressTransition.findMany;

const upsert = (prisma as unknown as {
  overrideGovernanceReport: { upsert: ReturnType<typeof vi.fn> };
}).overrideGovernanceReport.upsert;

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({});
});

describe("parseGapArray", () => {
  it("returns [] on null / undefined", () => {
    expect(parseGapArray(null)).toEqual([]);
    expect(parseGapArray(undefined)).toEqual([]);
  });

  it("filters non-string entries defensively", () => {
    expect(parseGapArray(["a", 1, null, "b"])).toEqual(["a", "b"]);
  });

  it("returns [] for non-array stored shapes", () => {
    expect(parseGapArray({})).toEqual([]);
    expect(parseGapArray("oops")).toEqual([]);
  });

  it("returns the array when shape is correct", () => {
    expect(parseGapArray(["evidence.photo.coverage"])).toEqual([
      "evidence.photo.coverage",
    ]);
  });
});

describe("runOverrideGovernance", () => {
  it("returns no rows for an empty month", async () => {
    findMany.mockResolvedValueOnce([]);

    const r = await runOverrideGovernance(new Date(Date.UTC(2026, 3, 1)));

    expect(r.rows).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("aggregates SOFT-gap counts across transitions", async () => {
    findMany.mockResolvedValueOnce([
      { id: "t1", softGaps: ["evidence.photo.coverage"] },
      { id: "t2", softGaps: ["evidence.photo.coverage", "evidence.note.populated"] },
      { id: "t3", softGaps: null },
    ]);

    const r = await runOverrideGovernance(new Date(Date.UTC(2026, 3, 1)));

    const photo = r.rows.find((x) => x.gateKey === "evidence.photo.coverage");
    const note = r.rows.find((x) => x.gateKey === "evidence.note.populated");
    expect(photo?.transitionCount).toBe(3);
    expect(photo?.overrideCount).toBe(2);
    expect(photo?.overrideRate).toBeCloseTo(2 / 3);
    expect(note?.overrideCount).toBe(1);
    expect(note?.overrideRate).toBeCloseTo(1 / 3);
  });

  it("flags isBreached when the rate exceeds 5%", async () => {
    // 100 transitions, 6 overrides → 6% > 5% → breach
    const arr = [];
    for (let i = 0; i < 6; i++)
      arr.push({ id: `t${i}`, softGaps: ["evidence.photo.coverage"] });
    for (let i = 6; i < 100; i++) arr.push({ id: `t${i}`, softGaps: null });
    findMany.mockResolvedValueOnce(arr);

    const r = await runOverrideGovernance(new Date(Date.UTC(2026, 3, 1)));

    const row = r.rows.find((x) => x.gateKey === "evidence.photo.coverage");
    expect(row?.isBreached).toBe(true);
  });

  it("does NOT flag breach exactly at 5%", async () => {
    // 20 transitions, 1 override → 5% (not greater than 5%)
    const arr = [{ id: "t0", softGaps: ["evidence.photo.coverage"] }];
    for (let i = 1; i < 20; i++) arr.push({ id: `t${i}`, softGaps: null });
    findMany.mockResolvedValueOnce(arr);

    const r = await runOverrideGovernance(new Date(Date.UTC(2026, 3, 1)));

    expect(r.rows[0].overrideRate).toBeCloseTo(0.05);
    expect(r.rows[0].isBreached).toBe(false);
  });

  it("upserts one row per gate seen", async () => {
    findMany.mockResolvedValueOnce([
      { id: "t1", softGaps: ["a", "b"] },
      { id: "t2", softGaps: ["a"] },
    ]);

    await runOverrideGovernance(new Date(Date.UTC(2026, 3, 1)));

    expect(upsert).toHaveBeenCalledTimes(2);
    const keys = upsert.mock.calls.map(
      (c) => c[0].where.reportMonth_gateKey.gateKey,
    );
    expect(keys.sort()).toEqual(["a", "b"]);
  });

  it("uses the prior month when called with no argument", async () => {
    // Validate the helper directly — doesn't depend on system clock
    // beyond the call moment.
    const before = __M15_INTERNAL.priorMonthStart();
    const now = new Date();
    const expectedYear =
      now.getUTCMonth() === 0
        ? now.getUTCFullYear() - 1
        : now.getUTCFullYear();
    const expectedMonth =
      now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
    expect(before.getUTCFullYear()).toBe(expectedYear);
    expect(before.getUTCMonth()).toBe(expectedMonth);
    expect(before.getUTCDate()).toBe(1);
  });

  it("BREACH_THRESHOLD is 0.05", () => {
    expect(__M15_INTERNAL.BREACH_THRESHOLD).toBe(0.05);
  });
});
