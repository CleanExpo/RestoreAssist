// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * RA-7710 — "No working path to an invoice".
 *
 * Production, 2026-09-23: Calculate Quote returned $3,104.75, then clicking
 * Create Invoice Draft issued ZERO requests and nothing visible happened. The
 * handler returns early when the quote has no client email and reports that only
 * through a 4-second toast. A toast is not a durable message; the operator saw
 * nothing and the invoice was never created.
 *
 * Billing → Invoices (POST /api/invoices) is the customer's invoice. These tests
 * hold the button to: reach that endpoint with the quote's figures, or say on the
 * page why it did not.
 *
 * Sabotage: re-add an early `return` before the fetch with only a toast — the
 * fail-loud test goes red. Drop the inline error render — the 4xx test goes red.
 */

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("react-hot-toast", () => ({
  default: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import QuotePage from "../page";

// $2,822.50 ex GST + $282.25 GST = $3,104.75 — the production figure.
// The two priced lines sum to $2,000.00; the minimum-charge top-up line must
// carry the remaining $822.50 so the invoice total equals the quote total.
function quoteResponse(email: string) {
  return {
    quoteNumber: "QTE-7710",
    quoteDate: new Date().toISOString(),
    jobType: "Water Damage Restoration",
    standardApplied: "",
    applicableStandards: [],
    safety: { mouldActive: false, airMoverQty: 4, advisories: [] },
    contractor: { businessName: "Test Co", abn: "", address: "", phone: "", email: "", logo: "" },
    client: { name: "Jane Client", address: "1 Test St", phone: "0400000000", email },
    lineItems: [
      { description: "Labour", qty: 16, unit: "hr", rate: 110, subtotal: 1760 },
      { description: "Air mover hire", qty: 4, unit: "day", rate: 60, subtotal: 240 },
    ],
    subtotalExGST: 2822.5,
    gst: 282.25,
    totalIncGST: 3104.75,
    minimumApplied: true,
    minimumChargeAmount: 2822.5,
    pricingSource: "default_rates",
    pricingNote: "",
    jobDescription: "",
  };
}

type Reply = { ok: boolean; status: number; body: unknown };

function mockFetch(email: string, invoiceReply: Reply) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/calculate") {
      return { ok: true, status: 200, json: async () => quoteResponse(email) };
    }
    if (url === "/api/invoices") {
      return {
        ok: invoiceReply.ok,
        status: invoiceReply.status,
        json: async () => invoiceReply.body,
      };
    }
    // /api/gst-treatment and anything else: not under test.
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function calculate() {
  fireEvent.click(screen.getAllByText(/Water Damage/i)[0]);
  await waitFor(() => expect(screen.getByText(/Calculate/i)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/Calculate/i));
  await waitFor(() => expect(screen.getByText(/Quote Generated/i)).toBeInTheDocument());
}

function invoiceCalls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls.filter(([url]) => url === "/api/invoices");
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RA-7710 quote page — Create Invoice Draft reaches Billing → Invoices", () => {
  it("POSTs the quote's client, lines and totals to /api/invoices and opens the invoice", async () => {
    const fetchMock = mockFetch("jane@example.com", {
      ok: true,
      status: 201,
      body: { invoice: { id: "inv_7710" } },
    });
    render(<QuotePage />);
    await calculate();

    fireEvent.click(screen.getByRole("button", { name: /Create Invoice Draft/i }));

    await waitFor(() => expect(invoiceCalls(fetchMock)).toHaveLength(1));
    const [, init] = invoiceCalls(fetchMock)[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.customerName).toBe("Jane Client");
    expect(body.customerEmail).toBe("jane@example.com");
    expect(body.source).toBe("quote_generator");
    expect(typeof body.dueDate).toBe("string");

    // The server recomputes totals from lineItems, so the lines ARE the totals.
    const exCents = body.lineItems.reduce(
      (sum: number, li: { quantity: number; unitPrice: number }) =>
        sum + Math.round(li.quantity * li.unitPrice),
      0,
    );
    expect(exCents).toBe(282250);
    expect(body.lineItems.map((li: { description: string }) => li.description)).toEqual([
      "Labour",
      "Air mover hire",
      "Minimum engagement charge (industry minimum)",
    ]);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/invoices/inv_7710"));
  });

  it("on a 4xx shows the server's error message as a toast AND on the page", async () => {
    mockFetch("jane@example.com", {
      ok: false,
      status: 400,
      body: { error: { code: "VALIDATION", message: "At least one line item is required" } },
    });
    render(<QuotePage />);
    await calculate();

    fireEvent.click(screen.getByRole("button", { name: /Create Invoice Draft/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining("At least one line item is required"),
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "At least one line item is required",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("fail-loud: with no client email the click still produces a request or a message on the page", async () => {
    const fetchMock = mockFetch("", {
      ok: false,
      status: 400,
      body: { error: { code: "VALIDATION", message: "Customer name and email are required" } },
    });
    render(<QuotePage />);
    await calculate();

    fireEvent.click(screen.getByRole("button", { name: /Create Invoice Draft/i }));

    await waitFor(() => {
      const requested = invoiceCalls(fetchMock).length > 0;
      const alert = screen.queryByRole("alert");
      expect(requested || (alert !== null && /email/i.test(alert.textContent ?? ""))).toBe(true);
    });
  });
});
