// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RA-8084 — a failed client-list load must never read as an empty account.
// The page showed the red banner AND "No clients yet / Add your first client"
// because the empty state only looked at the list length.

const pullRefresh = vi.hoisted(() => ({
  handler: null as null | (() => Promise<unknown>),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/components/mobile/MobilePullToRefresh", () => ({
  useMobilePullRefreshHandler: (fn: () => Promise<unknown>) => {
    pullRefresh.handler = fn;
  },
}));
vi.mock("@/components/dashboard/SyncedClientsPanel", () => ({
  SyncedClientsPanel: () => null,
}));

import ClientsPage from "../page";

const CLIENT = {
  id: "client-a",
  name: "Alpha Restorations",
  email: "alpha@example.com",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  totalRevenue: 1000,
  lastJob: null,
  reportsCount: 0,
};

const ok = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });
const fail = () =>
  Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

beforeEach(() => {
  pullRefresh.handler = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ClientsPage load failure (RA-8084)", () => {
  it("does not tell the user they have no clients when the first load fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => fail()));
    render(<ClientsPage />);

    expect(await screen.findByText("Failed to load clients")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryAllByText("No clients yet")).toHaveLength(0);
    expect(
      screen.queryAllByText("Add your first client to get started."),
    ).toHaveLength(0);
  });

  it("keeps the last good list on a failed refetch, with no empty state", async () => {
    const fetchMock = vi.fn(() => ok({ clients: [CLIENT] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientsPage />);
    expect((await screen.findAllByText("Alpha Restorations")).length).toBeGreaterThan(0);

    fetchMock.mockImplementation(() => fail());
    await act(async () => {
      await pullRefresh.handler?.();
    });

    expect(await screen.findByText("Failed to load clients")).toBeInTheDocument();
    expect(screen.getAllByText("Alpha Restorations").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("No clients yet")).toHaveLength(0);
  });
});
