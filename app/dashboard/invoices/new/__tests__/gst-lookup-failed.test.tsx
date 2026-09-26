// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * RA-7743 — a failed GST lookup must stop the invoice, not assume 10%.
 *
 * useOrganizationGst() starts at the AU default and reports `failed` when
 * /api/gst-treatment cannot be read (RA-7725). This page ignored `failed`, so
 * an NZ business whose lookup failed saw, and could save, Australian 10% GST.
 *
 * Sabotage: drop `!gstFailed` from `gstKnown` — the failed-lookup test goes red.
 */

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import NewInvoicePage from "../page";

function mockFetch(gst: "fail" | "AU") {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/gst-treatment") {
      return gst === "fail"
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ data: { country: "AU" } }) };
    }
    if (url.startsWith("/api/clients")) {
      return { ok: true, status: 200, json: async () => ({ clients: [] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Enter a $100 unit price so a 10% assumption would show as $10.00. */
function enterUnitPrice() {
  const input = screen
    .getByText("Unit Price ($) *")
    .parentElement!.querySelector("input")!;
  fireEvent.change(input, { target: { value: "100" } });
}

function gstFigure() {
  return screen.getByText("GST", { selector: "span" }).nextElementSibling!
    .textContent!.trim();
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("RA-7743 new invoice page — GST lookup", () => {
  it("on a failed lookup shows the error, no GST figure, and cannot be saved", async () => {
    const fetchMock = mockFetch("fail");
    render(<NewInvoicePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn.t load your GST settings/i,
    );
    enterUnitPrice();

    expect(gstFigure()).not.toMatch(/\$/);
    expect(gstFigure()).toBe("Unavailable");
    expect(document.body.textContent).not.toContain("$10.00");

    const submit = screen.getByRole("button", { name: /Tax settings unavailable|Create Invoice/i });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/invoices")).toBe(false);
  });

  it("with the tenant's treatment loaded shows the GST and allows saving", async () => {
    mockFetch("AU");
    render(<NewInvoicePage />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create Invoice" })).not.toBeDisabled(),
    );
    enterUnitPrice();
    expect(gstFigure()).toBe("$10.00");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
