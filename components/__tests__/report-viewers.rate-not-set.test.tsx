// @vitest-environment jsdom
/**
 * RA-8281 B1 class fix: the report viewers render the structured report the
 * builder produces. A line whose price-list rate is not set carries a null
 * rate and total; Intl.NumberFormat would print null as $0.00. Both viewers
 * must read "Rate not set" for that line and for the equipment total.
 *
 * The data is the real builder output for a stored selection with a cached 0
 * whose current price-list rate is cleared, so builder and viewer are tested
 * together on the path a user sees.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { buildStructuredBasicReport } from "@/lib/reports/build-structured-report";
import RestorationInspectionReportViewer from "../RestorationInspectionReportViewer";
import VisualDashboardReport from "../VisualDashboardReport";

function structured(currentRate: number | null) {
  return buildStructuredBasicReport({
    report: { id: "abcdef1234567890", estimatedDryingDuration: 4 },
    analysis: null,
    stateInfo: null,
    equipmentSelection: [{ groupId: "lgr-85", quantity: 1, dailyRate: 0 }],
    pricingConfig: { dehumidifierLGRDailyRate: currentRate },
  } as Parameters<typeof buildStructuredBasicReport>[0]);
}

/** The text of every table row that names the LGR or the equipment total. */
function equipmentRows(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("tr"))
    .map((tr) => tr.textContent ?? "")
    .filter((t) => /85L\/Day|Total Equipment Cost/.test(t));
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RestorationInspectionReportViewer", () => {
  it("an unset equipment rate reads Rate not set, never $0.00", () => {
    const { container } = render(
      <RestorationInspectionReportViewer data={structured(null)} />,
    );
    const rows = equipmentRows(container);
    // Positive control: the equipment table and its total row rendered.
    expect(rows.some((r) => /Total Equipment Cost/.test(r))).toBe(true);
    expect(rows.some((r) => /85L\/Day/.test(r))).toBe(true);
    for (const row of rows) {
      expect(row).toMatch(/Rate not set/);
      expect(row).not.toMatch(/\$0\.00/);
    }
  });

  it("control: a set rate renders the contractor's own figure", () => {
    const { container } = render(
      <RestorationInspectionReportViewer data={structured(70)} />,
    );
    const rows = equipmentRows(container).join(" ");
    expect(rows).toMatch(/\$70\.00/);
    expect(rows).toMatch(/\$280\.00/);
    expect(rows).not.toMatch(/Rate not set/);
  });
});

describe("VisualDashboardReport detailed pages", () => {
  const visual = (fullData: unknown) => ({ fullData }) as never;

  it("an unset equipment rate reads Rate not set, never $0.00", () => {
    const { container } = render(
      <VisualDashboardReport data={visual(structured(null))} />,
    );
    const rows = equipmentRows(container);
    expect(rows.some((r) => /Total Equipment Cost/.test(r))).toBe(true);
    expect(rows.some((r) => /85L\/Day/.test(r))).toBe(true);
    for (const row of rows) {
      expect(row).toMatch(/Rate not set/);
      expect(row).not.toMatch(/\$0\.00/);
    }
  });

  it("control: a set rate renders the contractor's own figure", () => {
    const { container } = render(
      <VisualDashboardReport data={visual(structured(70))} />,
    );
    const rows = equipmentRows(container).join(" ");
    expect(rows).toMatch(/\$70\.00/);
    expect(rows).not.toMatch(/Rate not set/);
  });
});
