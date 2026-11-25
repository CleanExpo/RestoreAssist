// @vitest-environment jsdom
/**
 * RA-8494: a user who may not see money gets no Revenue view. The monthly
 * volume API withholds revenue as null for them; the chart must not offer a
 * toggle that opens an empty revenue series.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MonthlyVolumeChart from "../MonthlyVolumeChart";

function serve(totalRevenue: number | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        monthlyData: [
          { month: "2026-09", monthLabel: "Sep", reports: 1, revenue: totalRevenue == null ? null : 250, completed: 1, pending: 0 },
          { month: "2026-10", monthLabel: "Oct", reports: 2, revenue: totalRevenue == null ? null : 500, completed: 1, pending: 1 },
        ],
        summary: {
          totalReports: 3,
          totalRevenue,
          avgMonthlyReports: 1.5,
          avgMonthlyRevenue: totalRevenue == null ? null : 375,
          growthRate: 100,
          bestMonth: { label: "Oct", reports: 2 },
          worstMonth: { label: "Sep", reports: 1 },
          ytd: { reports: 3, revenue: totalRevenue },
        },
      }),
    ),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MonthlyVolumeChart money view (RA-8494)", () => {
  it("offers no Revenue toggle when revenue is withheld", async () => {
    serve(null);
    render(<MonthlyVolumeChart />);
    expect(await screen.findByRole("button", { name: "Reports" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revenue" })).not.toBeInTheDocument();
  });

  it("positive control: a caller who may see money keeps the Revenue toggle", async () => {
    serve(500);
    render(<MonthlyVolumeChart />);
    expect(await screen.findByRole("button", { name: "Revenue" })).toBeInTheDocument();
  });
});
