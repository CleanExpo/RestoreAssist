// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RA-8084: a failed invoice-analytics load must not read as "No invoice data yet".

const ok = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });
const fail = () =>
  Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import InvoiceAnalyticsPage from "../page";

describe("InvoiceAnalyticsPage load failure (RA-8084)", () => {
  it("shows the error and Retry, not the empty-account state, when the load fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => fail()));
    render(<InvoiceAnalyticsPage />);

    expect(await screen.findByText("Failed to load analytics")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryAllByText("No invoice data yet")).toHaveLength(0);
    expect(screen.queryAllByText("Create Invoice")).toHaveLength(0);
  });

  it("Retry reloads, and the empty state shows only once a load succeeded empty", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL) => fail());
    vi.stubGlobal("fetch", fetchMock);
    render(<InvoiceAnalyticsPage />);
    const retry = await screen.findByRole("button", { name: "Retry" });

    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).includes("/api/invoices/analytics")
        ? ok({ stats: { totalRevenue: 0 }, monthlyRevenue: [] })
        : ok({ invoices: [] }),
    );
    fireEvent.click(retry);

    expect(await screen.findByText("No invoice data yet")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load analytics")).not.toBeInTheDocument();
  });
});
