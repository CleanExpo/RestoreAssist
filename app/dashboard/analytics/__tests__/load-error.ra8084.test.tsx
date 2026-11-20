// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RA-8084 — a failed analytics load must never read as "No reports yet", and a
// failed refetch after a filter change must not leave the previous filter's
// numbers on screen under the new filter.

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "USER" } } }),
}));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("../components/AnalyticsFilters", () => ({
  default: ({
    onFiltersChange,
  }: {
    onFiltersChange: (f: { dateRange: string }) => void;
  }) => (
    <button type="button" onClick={() => onFiltersChange({ dateRange: "7days" })}>
      Last 7 days
    </button>
  ),
}));
vi.mock("../components/KPICards", () => ({
  default: ({ data }: { data: { totalReports: { value: number } } | null }) => (
    <p>KPI total reports: {data?.totalReports.value ?? "none"}</p>
  ),
}));
const stub = vi.hoisted(() => () => ({ default: () => null }));
vi.mock("../components/RevenueChart", stub);
vi.mock("../components/DamageTypesChart", stub);
vi.mock("../components/RevenueProjection", stub);
vi.mock("../components/TopClientsTable", stub);
vi.mock("../components/CompletionMetrics", stub);
vi.mock("../components/MonthlyVolumeChart", stub);
vi.mock("../components/BillingOverview", stub);
vi.mock("../components/ActivityFeed", stub);
vi.mock("../components/ExecutiveSummary", stub);
vi.mock("../components/StatusPipeline", stub);
vi.mock("../components/ActivityByDay", stub);
vi.mock("../components/PeriodComparison", stub);
vi.mock("../components/InsightsMovers", stub);
vi.mock("../components/AINarrativeCard", stub);

import AnalyticsPage from "../page";

const ANALYTICS = {
  kpis: {
    totalReports: { value: 42, change: "+5%" },
    totalRevenue: { value: 1000, formatted: "$1,000", change: "+1%" },
    avgReportValue: { value: 100, formatted: "$100", change: "0%" },
    avgCompletion: { value: "2", formatted: "2 days", change: "0%" },
  },
  reportTrendData: [{ date: "2026-10-01", reports: 42, revenue: 1000 }],
  hazardDistribution: [],
  insuranceTypeData: [],
  statePerformance: [],
  turnaroundTime: [],
  topClients: [],
};

const ok = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });
const fail = () =>
  Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

function routeFetch(analytics: () => Promise<unknown>) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/analytics?") || url.endsWith("/api/analytics")) {
      return analytics();
    }
    return fail();
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AnalyticsPage load failure (RA-8084)", () => {
  it("does not show 'No reports yet' when the analytics load fails", async () => {
    vi.stubGlobal("fetch", routeFetch(fail));
    render(<AnalyticsPage />);

    expect(await screen.findByText("Failed to load analytics")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryAllByText("No reports yet")).toHaveLength(0);
    expect(screen.queryAllByText("Create your first report")).toHaveLength(0);
  });

  it("drops the previous filter's numbers when a refetch fails", async () => {
    let analytics: () => Promise<unknown> = () => ok(ANALYTICS);
    vi.stubGlobal("fetch", routeFetch(() => analytics()));
    render(<AnalyticsPage />);
    expect(await screen.findByText("KPI total reports: 42")).toBeInTheDocument();

    analytics = fail;
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));

    expect(await screen.findByText("Failed to load analytics")).toBeInTheDocument();
    expect(screen.queryByText("KPI total reports: 42")).not.toBeInTheDocument();
    expect(screen.queryAllByText("No reports yet")).toHaveLength(0);
  });
});
