/**
 * RA-8281 B1 class fix (review round 9): every reader of a STORED equipment
 * selection prices it from the CURRENT price list. A rate cached on the
 * selection is never money: not a cached 0 (older rows stored 0 for an unset
 * rate), and not a stale positive rate the contractor has since cleared.
 * An unset rate reads "Rate not set" and blocks the equipment total.
 *
 * Each describe block is one reader path. Every "unset" case was run against
 * the pre-fix code and failed (red first); see the PR body for the run.
 */
import { describe, expect, it } from "vitest";
import { buildStructuredBasicReport } from "@/lib/reports/build-structured-report";
import { buildInspectionReportPrompt } from "@/lib/reports/generate-report-ai";
import { generateSingleReportExcel } from "@/lib/excel-export";
import { selectionDailyRate } from "@/lib/equipment-matrix";
import { RateNotSetError } from "@/lib/pricing/rate-not-set";
import { getStateInfo } from "@/lib/state-detection";

const DAYS = 4;

/** The price list as it is NOW: the LGR rate has been cleared. */
const CLEARED = { dehumidifierLGRDailyRate: null };
/** Control: the LGR rate is set to the contractor's own 70. */
const SET = { dehumidifierLGRDailyRate: 70 };

/** Stored selections as older rows hold them. */
const CACHED_ZERO = [{ groupId: "lgr-85", quantity: 1, dailyRate: 0 }];
const CACHED_STALE = [{ groupId: "lgr-85", quantity: 1, dailyRate: 61 }];

const CASES = [
  { label: "cached 0", selections: CACHED_ZERO },
  { label: "stale cached 61", selections: CACHED_STALE },
] as const;

// ---------------------------------------------------------------- structured

function structured(selections: unknown[], pricingConfig: unknown) {
  return buildStructuredBasicReport({
    report: { id: "abcdef1234567890", estimatedDryingDuration: DAYS },
    analysis: null,
    stateInfo: null,
    equipmentSelection: selections,
    pricingConfig,
  } as Parameters<typeof buildStructuredBasicReport>[0]);
}

describe("structured report (generate-inspection-report basic/enhanced)", () => {
  it.each(CASES)(
    "$label with the current rate cleared: line and totals are null, never $0 or the cache",
    ({ selections }) => {
      const r = structured([...selections], CLEARED);
      expect(r.equipment).toHaveLength(1);
      expect(r.equipment[0].dailyRate).toBeNull();
      expect(r.equipment[0].totalCost).toBeNull();
      expect(r.equipment[0].rateNote).toMatch(/Rate not set/);
      expect(r.equipmentTotal).toBeNull();
      expect(r.costEstimates).toHaveLength(1);
      expect(r.costEstimates[0].total).toBeNull();
      expect(r.summary.totalCost).toBeNull();
    },
  );

  it.each(CASES)(
    "$label with no price list loaded: blocked, never $0 or the cache",
    ({ selections }) => {
      const r = structured([...selections], null);
      expect(r.equipment[0].dailyRate).toBeNull();
      expect(r.summary.totalCost).toBeNull();
    },
  );

  it.each(CASES)(
    "control, $label: a set current rate prices at the contractor's own 70",
    ({ selections }) => {
      const r = structured([...selections], SET);
      expect(r.equipment[0].dailyRate).toBe(70);
      expect(r.equipment[0].totalCost).toBe(70 * DAYS);
      expect(r.equipmentTotal).toBe(70 * DAYS);
      expect(r.summary.totalCost).toBe(70 * DAYS);
    },
  );
});

// ---------------------------------------------------------------- AI prompt

function prompt(reportType: string, selections: unknown[], pricingConfig: unknown) {
  return buildInspectionReportPrompt({
    report: {
      propertyAddress: "1 Test St",
      reportNumber: "TEST-1",
      estimatedDryingDuration: DAYS,
      // A cached total from the old screen; it must never be read back.
      equipmentCostTotal: 244,
    },
    analysis: {},
    tier1: {},
    tier2: {},
    tier3: {},
    stateInfo: getStateInfo("NSW"),
    reportType,
    equipmentSelection: selections as any[],
    pricingConfig,
  });
}

/** The prompt's lines that carry equipment money. */
function equipmentMoneyLines(text: string): string[] {
  return text
    .split("\n")
    .filter((l) =>
      /LGR|Equipment Cost|Daily Cost|Total Cost|RATE\/DAY|daily rate/i.test(l),
    )
    .filter((l) => /\$|rate not set/i.test(l));
}

describe.each(["basic", "enhanced"])("AI report prompt (%s)", (reportType) => {
  it.each(CASES)(
    "$label with the current rate cleared: says the rate is not set, no figure",
    ({ selections }) => {
      const text = prompt(reportType, [...selections], CLEARED);
      const lines = equipmentMoneyLines(text);
      // Positive control: the equipment section was really built.
      expect(lines.length).toBeGreaterThan(0);
      expect(text).toMatch(/Rate not set/);
      for (const line of lines) {
        expect(line).not.toMatch(/\$0\.00|\$61\.00|\$244|\$2,320/);
      }
    },
  );

  it("control: a set current rate states the contractor's own figure", () => {
    const text = prompt(reportType, [...CACHED_STALE], SET);
    expect(text).toContain("$70.00");
    expect(text).toContain(`$${(70 * DAYS).toFixed(2)}`);
    expect(text).not.toContain("$61.00");
    // The total is the current price list's, never the cached report total.
    expect(text).toContain(`Total Equipment Cost: $${(70 * DAYS).toFixed(2)}`);
    expect(text).not.toMatch(/\$244/);
  });
});

// ---------------------------------------------------------------- Excel

async function excelCells(selections: unknown[], pricingConfig: unknown) {
  const wb = await generateSingleReportExcel(
    {
      id: "synthetic-report",
      title: "Synthetic report",
      status: "DRAFT",
      clientName: "Synthetic client",
      propertyAddress: "1 Synthetic Street",
      hazardType: "Water",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      estimatedDryingDuration: DAYS,
      equipmentCostTotal: 244,
      equipmentSelection: JSON.stringify(selections),
    } as Parameters<typeof generateSingleReportExcel>[0],
    { pricingConfig },
  );
  const sheetValues = (name: string) => {
    const out: string[] = [];
    wb.getWorksheet(name)?.eachRow((row) =>
      row.eachCell((cell) => out.push(String(cell.value))),
    );
    return out;
  };
  return {
    deploy: sheetValues("Equipment Deployment"),
    selection: sheetValues("Equipment Selection"),
    all: wb.worksheets.flatMap((ws) => sheetValues(ws.name)),
  };
}

describe("Excel export (single report)", () => {
  it.each(CASES)(
    "$label with the current rate cleared: every equipment money cell reads Rate not set",
    async ({ selections }) => {
      const { deploy, selection, all } = await excelCells([...selections], CLEARED);
      // Positive control: both equipment sheets were written.
      expect(deploy).toContain("Rate not set");
      expect(selection).toContain("Rate not set");
      expect(deploy).not.toContain("$0.00");
      expect(selection).not.toContain("$0.00");
      expect(all).not.toContain("$61.00");
      expect(all).not.toContain("$244.00");
    },
  );

  it("control: a set current rate prices at the contractor's own 70", async () => {
    const { deploy, all } = await excelCells([...CACHED_STALE], SET);
    expect(deploy).toContain("$70.00");
    expect(deploy).toContain(`$${(70 * DAYS).toFixed(2)}`);
    expect(all).not.toContain("$61.00");
  });
});

// ---------------------------------------------------------------- shared rate

describe("selectionDailyRate, group with no price-list field", () => {
  it("a cached 0 is unset (RateNotSetError), never $0", () => {
    expect(() =>
      selectionDailyRate({ groupId: "no-such-group", dailyRate: 0 }, SET),
    ).toThrow(RateNotSetError);
  });

  it("control: a positive cached rate is still used where no field exists", () => {
    expect(
      selectionDailyRate({ groupId: "no-such-group", dailyRate: 61 }, SET),
    ).toBe(61);
  });
});
