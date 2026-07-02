/**
 * RA-6917 Phase 2 — getRestorationInsights N-anonymity contract.
 *
 * The load-bearing guarantee: any grouped cell below MIN_CELL_COUNT is dropped
 * from the published output, so a postcode+category can't re-identify one job.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { groupByMock } = vi.hoisted(() => ({ groupByMock: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { restorationIncident: { groupBy: groupByMock } },
}));

import {
  getRestorationInsights,
  MIN_CELL_COUNT,
} from "../restorationInsights";

beforeEach(() => vi.clearAllMocks());

describe("getRestorationInsights", () => {
  it("suppresses cells below the anonymity threshold and keeps the rest", async () => {
    groupByMock.mockResolvedValue([
      { state: "NSW", _count: { id: 12 }, _avg: { remediationDays: 4, floorAreaM2: 130 } },
      { state: "VIC", _count: { id: MIN_CELL_COUNT }, _avg: { remediationDays: 3, floorAreaM2: 90 } },
      { state: "NT", _count: { id: MIN_CELL_COUNT - 1 }, _avg: { remediationDays: 9, floorAreaM2: null } }, // suppressed
      { state: "TAS", _count: { id: 1 }, _avg: { remediationDays: 2, floorAreaM2: 200 } }, // suppressed
    ]);

    const result = await getRestorationInsights(["state"]);

    const states = result.cells.map((c) => c.key.state).sort();
    expect(states).toEqual(["NSW", "VIC"]); // NT and TAS dropped
    expect(result.suppressedCells).toBe(2);
    expect(result.totalIncidents).toBe(12 + MIN_CELL_COUNT); // surviving cells only
    expect(result.minCellCount).toBe(MIN_CELL_COUNT);
    // Phase 3 geometry passes through on surviving cells
    expect(result.cells.find((c) => c.key.state === "NSW")?.avgFloorAreaM2).toBe(130);
  });

  it("never emits a cell that could identify a single job (count of 1)", async () => {
    groupByMock.mockResolvedValue([
      { state: "NSW", postcode: "2000", _count: { id: 1 }, _avg: { remediationDays: 5, floorAreaM2: 110 } },
    ]);

    const result = await getRestorationInsights(["state", "postcode"]);

    expect(result.cells).toEqual([]);
    expect(result.suppressedCells).toBe(1);
    expect(result.totalIncidents).toBe(0);
  });

  it("defaults to grouping by state when no valid dimension is given", async () => {
    groupByMock.mockResolvedValue([]);
    await getRestorationInsights([]);
    expect(groupByMock.mock.calls[0][0].by).toEqual(["state"]);
  });

  it("drops unknown dimensions rather than passing them to prisma", async () => {
    groupByMock.mockResolvedValue([]);
    await getRestorationInsights([
      "waterCategory",
      // @ts-expect-error — intentionally invalid dimension
      "propertyAddress",
    ]);
    expect(groupByMock.mock.calls[0][0].by).toEqual(["waterCategory"]);
  });

  it("builds a capturedAt range filter from from/to", async () => {
    groupByMock.mockResolvedValue([]);
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-12-31T00:00:00Z");
    await getRestorationInsights(["state"], { state: "NSW", from, to });

    const arg = groupByMock.mock.calls[0][0];
    expect(arg.where.state).toBe("NSW");
    expect(arg.where.capturedAt.gte).toBe(from);
    expect(arg.where.capturedAt.lte).toBe(to);
  });
});
