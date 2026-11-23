// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RA-8598 — the revenue-leakage report is reachable from Analytics only for a
// caller the server says may see money (`mayViewMoney`, from canSeeMoney).

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

const LINK = { name: "Revenue leakage" };

describe("AnalyticsPage revenue-leakage link (RA-8598)", () => {
  it("shows the link when the server says the caller may see money", async () => {
    vi.stubGlobal("fetch", routeFetch(() => ok({ ...ANALYTICS, mayViewMoney: true })));
    render(<AnalyticsPage />);
    expect(await screen.findByText("KPI total reports: 42")).toBeInTheDocument();
    expect(screen.getByRole("link", LINK)).toHaveAttribute(
      "href",
      "/dashboard/analytics/revenue-leakage",
    );
  });

  it("hides the link from a refused role", async () => {
    vi.stubGlobal("fetch", routeFetch(() => ok({ ...ANALYTICS, mayViewMoney: false })));
    render(<AnalyticsPage />);
    expect(await screen.findByText("KPI total reports: 42")).toBeInTheDocument();
    expect(screen.queryByRole("link", LINK)).not.toBeInTheDocument();
  });

  it("hides the link when the flag is absent", async () => {
    vi.stubGlobal("fetch", routeFetch(() => ok(ANALYTICS)));
    render(<AnalyticsPage />);
    expect(await screen.findByText("KPI total reports: 42")).toBeInTheDocument();
    expect(screen.queryByRole("link", LINK)).not.toBeInTheDocument();
  });
});
