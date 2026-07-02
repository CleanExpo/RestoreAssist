/**
 * RA-6917 Phase 2.5 — buildAnnualReport + toAnnualReportCsv.
 *
 * Two privacy guarantees under test:
 *   1. Whole-report suppression when the year has < MIN_CELL_COUNT incidents.
 *   2. Per-cell N-anonymity flows through from getRestorationInsights.
 * Plus CSV shape + spreadsheet formula-injection neutralisation.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { countMock, groupByMock } = vi.hoisted(() => ({
  countMock: vi.fn(),
  groupByMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    restorationIncident: { count: countMock, groupBy: groupByMock },
  },
}));

import {
  buildAnnualReport,
  toAnnualReportCsv,
} from "../annualReport";
import { MIN_CELL_COUNT } from "../restorationInsights";

beforeEach(() => vi.clearAllMocks());

describe("buildAnnualReport", () => {
  it("suppresses the whole report when the year has too few incidents", async () => {
    countMock.mockResolvedValue(MIN_CELL_COUNT - 1);

    const report = await buildAnnualReport(2026);

    expect(report.suppressed).toBe(true);
    expect(report.sections).toEqual([]);
    expect(report.totalIncidents).toBe(0); // true count withheld
    expect(groupByMock).not.toHaveBeenCalled(); // no breakdowns computed
  });

  it("builds suppressed breakdowns and a headline total when data is sufficient", async () => {
    countMock.mockResolvedValue(120);
    // Every breakdown groupBy returns one publishable + one sub-threshold cell.
    groupByMock.mockResolvedValue([
      { state: "NSW", waterCategory: "CAT_2", _count: { id: 40 }, _avg: { remediationDays: 4, floorAreaM2: 140 } },
      { state: "NT", waterCategory: "CAT_3", _count: { id: 2 }, _avg: { remediationDays: 8, floorAreaM2: 90 } },
    ]);

    const report = await buildAnnualReport(2026, { state: undefined });

    expect(report.suppressed).toBe(false);
    expect(report.totalIncidents).toBe(120);
    expect(report.sections.length).toBeGreaterThanOrEqual(5);
    // sub-threshold cell dropped in every section
    for (const s of report.sections) {
      expect(s.suppressedCells).toBeGreaterThanOrEqual(1);
      for (const cell of s.cells) expect(cell.count).toBeGreaterThanOrEqual(MIN_CELL_COUNT);
    }
    // the count query is scoped to the calendar year
    const whereArg = countMock.mock.calls[0][0].where;
    expect(whereArg.capturedAt.gte.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("toAnnualReportCsv", () => {
  it("emits a header, a total row, and one row per published cell", () => {
    const csv = toAnnualReportCsv({
      year: 2026,
      state: null,
      minCellCount: MIN_CELL_COUNT,
      totalIncidents: 42,
      suppressed: false,
      notes: [],
      sections: [
        {
          breakdown: "by_state",
          dimensions: ["state"],
          suppressedCells: 0,
          cells: [
            { key: { state: "NSW" }, count: 30, avgRemediationDays: 4.25, avgFloorAreaM2: 132 },
            { key: { state: "VIC" }, count: 12, avgRemediationDays: null, avgFloorAreaM2: null },
          ],
        },
      ],
    });

    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toContain("breakdown");
    expect(lines[0]).toContain("avgFloorAreaM2");
    expect(lines[1]).toContain('"total"');
    expect(lines[1]).toContain('"42"');
    expect(lines.some((l) => l.includes('"NSW"') && l.includes('"30"'))).toBe(true);
    expect(lines.some((l) => l.includes('"4.2"') || l.includes('"4.3"'))).toBe(true); // rounded
    expect(lines.some((l) => l.includes('"132"'))).toBe(true); // avg floor area
  });

  it("neutralises spreadsheet formula injection in string fields", () => {
    const csv = toAnnualReportCsv({
      year: 2026,
      state: null,
      minCellCount: MIN_CELL_COUNT,
      totalIncidents: 10,
      suppressed: false,
      notes: [],
      sections: [
        {
          breakdown: "by_state",
          dimensions: ["state"],
          suppressedCells: 0,
          // a hostile value that a spreadsheet might interpret as a formula
          cells: [{ key: { state: "=cmd|calc" }, count: 7, avgRemediationDays: 1, avgFloorAreaM2: null }],
        },
      ],
    });
    // the leading = is quoted-out
    expect(csv).toContain("\"'=cmd|calc\"");
  });
});
