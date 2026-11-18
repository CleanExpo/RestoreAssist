// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RA-8084: when the metrics request fails, the provider cards must not say
// "Not connected", and a failed feed must not say "No sync events recorded yet".

const fail = () =>
  Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import SyncHistoryPage from "../page";

describe("SyncHistoryPage load failure (RA-8084)", () => {
  it("does not mark any provider 'Not connected' when metrics fail", async () => {
    vi.stubGlobal("fetch", vi.fn(() => fail()));
    render(<SyncHistoryPage />);

    expect(await screen.findByText(/Failed to load sync history/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryAllByText("Not connected")).toHaveLength(0);
    expect(screen.queryAllByText("No sync events recorded yet")).toHaveLength(0);
    expect(screen.getAllByText("Status unavailable").length).toBeGreaterThan(0);
  });
});
