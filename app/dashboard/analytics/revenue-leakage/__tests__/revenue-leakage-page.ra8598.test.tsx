// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RA-8598 — the RA-7026 revenue-leakage report screen. Each route answer has
// its own state; a failed load is never an empty report, and "not connected"
// never shows zeros as a result.

const m = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  getServerSession: vi.fn(),
  canSeeMoney: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: m.notFound, redirect: m.redirect }));
vi.mock("next-auth", () => ({ getServerSession: m.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/redact-money", () => ({ canSeeMoney: m.canSeeMoney }));

import RevenueLeakagePage from "../page";
import RevenueLeakageReport, { leakageCsv } from "../RevenueLeakageReport";

const REPORT = {
  jobsAnalyzed: 12,
  linesAnalyzed: 40,
  linesMatched: 30,
  linesUnmatched: 10,
  totalActualExTax: 9000,
  totalBenchmarkExTax: 10000,
  totalLeakage: 1234.5,
  leakagePct: 0.1235,
  byClaimType: [
    { claimType: "Water", jobCount: 7, actualExTax: 6000, benchmarkExTax: 7000, leakage: 1000, leakagePct: 0.1429 },
  ],
  topUnderpricedParts: [
    { partNumber: "=HYPERLINK(1)", description: 'Air mover "axial"', lineCount: 3, totalQuantity: 9, actualAvgUnitPrice: 30, benchmarkUnitPrice: 45, gapPerUnit: 15, totalGap: 135 },
  ],
};
const CATEGORY = {
  byCategory: [
    { category: "afd", lines: 4, chargedTotal: 800, avgUnitPrice: 100, targetRate: 120, underCharge: 80 },
  ],
  totalUnderCharge: 80,
  totalCharged: 800,
  benchmarkedCharged: 800,
  linesAnalyzed: 4,
};
const connected = (truncated: boolean) => ({
  connected: true,
  totalJobsImported: 12,
  lastSyncAt: null,
  truncated,
  benchmarkPartsLoaded: 100,
  report: REPORT,
  categoryLeakage: CATEGORY,
});

function answer(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: status < 400, status, json: async () => body })),
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RevenueLeakageReport states (RA-8598)", () => {
  it("connected: shows total, claim types, parts, categories and a CSV control", async () => {
    answer(200, connected(false));
    render(<RevenueLeakageReport />);
    expect(await screen.findByText("$1,234.50")).toBeInTheDocument();
    expect(screen.getByText("Water")).toBeInTheDocument();
    expect(screen.getByText('Air mover "axial"')).toBeInTheDocument();
    expect(screen.getByText("Air filtration (AFD)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
    expect(screen.queryByText(/first 5,000 jobs only/)).not.toBeInTheDocument();
  });

  it("not connected: shows the message and a connect link, never zeros", async () => {
    answer(200, { connected: false, message: "No Ascora integration — connect Ascora and run a sync first." });
    render(<RevenueLeakageReport />);
    expect(await screen.findByText("Ascora is not connected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Ascora" })).toHaveAttribute("href", "/dashboard/integrations");
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download CSV" })).not.toBeInTheDocument();
  });

  it("truncated: says the figure covers the first 5000 jobs only", async () => {
    answer(200, connected(true));
    render(<RevenueLeakageReport />);
    expect(await screen.findByText(/first 5,000 jobs only/)).toBeInTheDocument();
  });

  it("load failure: shows an error state, not an empty report", async () => {
    answer(500, {});
    render(<RevenueLeakageReport />);
    expect(await screen.findByText(/Failed to load the revenue leakage report/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("Total leakage")).not.toBeInTheDocument();
    expect(screen.queryByText("Ascora is not connected")).not.toBeInTheDocument();
  });
});

describe("leakageCsv (RA-8598)", () => {
  it("exports the claim-type and part rows on screen, formula-guarded", () => {
    const lines = leakageCsv(REPORT as never).split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Water"');
    expect(lines[1]).toContain('"1000.00"');
    expect(lines[2]).toContain(`"'=HYPERLINK(1)"`);
    expect(lines[2]).toContain('"Air mover ""axial"""');
  });
});

describe("RevenueLeakagePage money gate (RA-8494, RA-8598)", () => {
  it("a refused role gets a 404 and no report content", async () => {
    m.getServerSession.mockResolvedValue({ user: { id: "tech-1", role: "USER" } });
    m.canSeeMoney.mockResolvedValue(false);
    await expect(RevenueLeakagePage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.notFound).toHaveBeenCalled();
  });

  it("no session is sent to sign in", async () => {
    m.getServerSession.mockResolvedValue(null);
    await expect(RevenueLeakagePage()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(m.canSeeMoney).not.toHaveBeenCalled();
  });

  it("a money viewer gets the report", async () => {
    m.getServerSession.mockResolvedValue({ user: { id: "owner-1", role: "ADMIN" } });
    m.canSeeMoney.mockResolvedValue(true);
    const el = await RevenueLeakagePage();
    expect(m.notFound).not.toHaveBeenCalled();
    expect(el.type).toBe(RevenueLeakageReport);
  });
});
