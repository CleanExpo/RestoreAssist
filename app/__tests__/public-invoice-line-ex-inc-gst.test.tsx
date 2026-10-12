// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIXED_GST_EXPECTED,
  MIXED_GST_LINES,
  MIXED_GST_TOTALS,
  exIncCells,
} from "@/lib/invoices/__tests__/fixtures/mixed-gst-lines";

/**
 * RA-7896 — the customer's invoice link shows every line ex GST and inc GST:
 * the stored line subtotal and total. A GST-free line shows the same amount
 * twice. Sabotage: render `li.subtotal` in the Inc GST cell — labour goes red.
 */

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "invoice-token" }),
}));

import PublicInvoicePage from "@/app/invoices/public/[token]/page";

afterEach(() => vi.unstubAllGlobals());

describe("RA-7896 public invoice — line prices ex GST and inc GST", () => {
  it("shows each stored line ex GST and inc GST", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          invoice: {
            invoiceNumber: "INV-7896",
            status: "SENT",
            invoiceDate: "2026-10-03T00:00:00.000Z",
            dueDate: "2026-10-17T00:00:00.000Z",
            customerName: "Mock Customer",
            customerEmail: "mock@example.com",
            ...MIXED_GST_TOTALS,
            amountPaid: 0,
            amountDue: MIXED_GST_TOTALS.totalIncGST,
            currency: "AUD",
            lineItems: MIXED_GST_LINES,
          },
        }),
      }),
    );
    const { container } = render(<PublicInvoicePage />);
    expect(await screen.findByText("Labour")).toBeInTheDocument();

    MIXED_GST_LINES.forEach((line, i) => {
      expect(exIncCells(container, line.description)).toEqual(MIXED_GST_EXPECTED[i]);
    });
  });
});
