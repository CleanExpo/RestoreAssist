// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "invoice-token" }),
}));

import PublicInvoicePage from "@/app/invoices/public/[token]/page";

describe("PublicInvoicePage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          invoice: {
            invoiceNumber: "INV-1001",
            status: "SENT",
            invoiceDate: "2026-08-09T00:00:00.000Z",
            dueDate: "2026-08-23T00:00:00.000Z",
            customerName: "Mock Customer",
            customerEmail: "mock@example.com",
            subtotalExGST: 10_000,
            gstAmount: 1_000,
            totalIncGST: 11_000,
            amountPaid: 0,
            amountDue: 11_000,
            currency: "AUD",
            notes: "Please quote the claim number when paying.",
            lineItems: [],
          },
        }),
      }),
    );
  });

  it("renders customer-visible invoice notes", async () => {
    render(<PublicInvoicePage />);

    expect(
      await screen.findByText("Please quote the claim number when paying."),
    ).toBeInTheDocument();
    expect(screen.getByText("Notes:")).toBeInTheDocument();
  });
});
