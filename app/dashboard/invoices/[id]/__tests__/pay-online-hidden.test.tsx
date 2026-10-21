// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * P1-MNY-00 — the invoice view offers no Pay Online button until firms are
 * paid into their own Stripe account (P1-MNY-01). Recording a payment by
 * hand stays available.
 * Sabotage: render the Pay Online button again — this test goes red.
 */

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import InvoiceDetailPage from "../page";

afterEach(() => vi.unstubAllGlobals());

describe("P1-MNY-00 invoice view — Pay Online hidden", () => {
  it("shows Record Payment but not Pay Online on a sent, unpaid invoice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/invoices/inv_mny00") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              invoice: {
                id: "inv_mny00",
                invoiceNumber: "INV-MNY00",
                status: "SENT",
                invoiceDate: "2026-10-03T00:00:00.000Z",
                dueDate: "2026-10-17T00:00:00.000Z",
                customerName: "Mock Customer",
                customerEmail: "mock@example.com",
                subtotalExGST: 10000,
                gstAmount: 1000,
                totalIncGST: 11000,
                amountPaid: 0,
                amountDue: 11000,
                currency: "AUD",
                lineItems: [],
                payments: [],
                auditLogs: [],
              },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ variations: [] }) };
      }),
    );
    await act(async () => {
      render(<InvoiceDetailPage params={Promise.resolve({ id: "inv_mny00" })} />);
    });
    expect(await screen.findByText("Record Payment")).toBeInTheDocument();
    expect(screen.queryByText("Pay Online")).not.toBeInTheDocument();
  });
});
