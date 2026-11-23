// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RA-8384 — "Last job" used to be text the server built with no country set,
// so a US-default server sent 11/3/2026 for 3 November. The API now sends the
// ISO moment (lastReportAt) and the screen formats it as dd/mm/yyyy.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/components/mobile/MobilePullToRefresh", () => ({
  useMobilePullRefreshHandler: () => undefined,
}));
vi.mock("@/components/dashboard/SyncedClientsPanel", () => ({
  SyncedClientsPanel: () => null,
}));

import ClientsPage from "../page";

const BASE = {
  email: "x@example.com",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  totalRevenue: 0,
  reportsCount: 1,
};

// 12:00 Brisbane on 3 Nov 2026: the same calendar day in UTC and in AU zones.
const WITH_JOB = {
  ...BASE,
  id: "with-job",
  name: "Alpha Restorations",
  lastReportAt: "2026-11-03T02:00:00.000Z",
};
const NO_JOB = {
  ...BASE,
  id: "no-job",
  name: "Bravo Restorations",
  reportsCount: 0,
  lastReportAt: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ClientsPage last job date (RA-8384)", () => {
  it("shows the last job as dd/mm/yyyy from lastReportAt, and an empty state when there is none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ clients: [WITH_JOB, NO_JOB] }),
        }),
      ),
    );
    render(<ClientsPage />);

    expect((await screen.findAllByText("Alpha Restorations")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("03/11/2026").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("11/3/2026")).toHaveLength(0);
    expect(
      screen.queryAllByText("No jobs yet").length + screen.queryAllByText("—").length,
    ).toBeGreaterThan(0);
  });
});
