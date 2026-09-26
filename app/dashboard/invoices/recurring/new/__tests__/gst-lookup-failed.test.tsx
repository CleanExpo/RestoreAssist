// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * RA-7743 — a failed GST lookup must stop the recurring invoice, not assume 10%.
 *
 * useOrganizationGst() starts at the AU default and reports `failed` when
 * /api/gst-treatment cannot be read (RA-7725). This page ignored `failed` and
 * also printed a literal "10%" beside every line, so an NZ business whose
 * lookup failed saw, and could save, Australian GST on every future invoice.
 *
 * Sabotage: drop `!gstFailed` from `gstKnown` — the failed-lookup test goes red.
 */

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import NewRecurringInvoicePage from "../page";

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

/** Fill the form so only the GST state can stop the submit. */
function fillForm() {
  fireEvent.change(screen.getByPlaceholderText(/Monthly/i), {
    target: { value: "Synthetic template" },
  });
  fireEvent.change(screen.getByPlaceholderText("Unit price ($)"), {
    target: { value: "100" },
  });
}

function gstFigure() {
  return screen.getByText("GST", { selector: "span" }).nextElementSibling!
    .textContent!.trim();
}

function submitButton() {
  return screen.getByRole("button", { name: /Create Recurring Invoice/i });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("RA-7743 new recurring invoice page — GST lookup", () => {
  it("on a failed lookup shows the error, no GST figure or 10%, and cannot be saved", async () => {
    const fetchMock = mockFetch("fail");
    render(<NewRecurringInvoicePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn.t load your GST settings/i,
    );
    fillForm();

    expect(gstFigure()).toBe("Unavailable");
    expect(document.body.textContent).not.toContain("10%");
    expect(document.body.textContent).not.toContain("$10.00");

    expect(submitButton()).toBeDisabled();
    fireEvent.submit(submitButton().closest("form")!);
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/invoices/recurring"),
    ).toBe(false);
  });

  it("with the tenant's treatment loaded shows the GST and allows saving", async () => {
    mockFetch("AU");
    render(<NewRecurringInvoicePage />);
    fillForm();

    await waitFor(() => expect(submitButton()).not.toBeDisabled());
    expect(gstFigure()).toBe("$10.00");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
