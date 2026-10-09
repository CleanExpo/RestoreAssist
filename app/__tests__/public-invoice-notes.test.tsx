// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "invoice-token" }),
}));

// A unique marker the API would never return (and which the dashboard
// would not generate as ordinary copy). It anchors a single-field
// regression: if `notes` ever leaks into the public DTO again, the
// marker follows it into the rendered page and trips this test.
const INTERNAL_NOTES_MARKER =
  "INTERNAL_NOTES_LEAK_MARKER_RA_PAID_TR2_page_xyz9";

import PublicInvoicePage from "@/app/invoices/public/[token]/page";

describe("PublicInvoicePage — internal notes must not be rendered", () => {
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
            // `notes` is internal. The mock simulates a malformed or
            // legacy response that still carries it, so we can prove
            // the page refuses to render it. The current public DTO
            // (lib/invoices/public-invoice-dto.ts) and the explicit
            // allowlisted transformer in the API route mean the
            // server should never send this field; this test pins
            // defence-in-depth at the render layer.
            notes: INTERNAL_NOTES_MARKER,
            lineItems: [],
          },
        }),
      }),
    );
  });

  it("does not render internal notes (marker must not appear) and the invoice is loaded", async () => {
    render(<PublicInvoicePage />);

    // Positive: the page loaded and rendered the customer-visible
    // invoice number. This is the "invoice loaded" assertion the
    // brief requires, and it proves the test is not silently passing
    // because nothing was rendered.
    expect(
      await screen.findByText("INV-1001"),
    ).toBeInTheDocument();

    // Negative: the internal notes marker must not appear anywhere in
    // the rendered page. The page no longer has a "Notes" label, the
    // type no longer has a `notes` field, and the API no longer sends
    // one — this test pins the end-to-end customer-facing surface.
    expect(
      screen.queryByText(INTERNAL_NOTES_MARKER),
    ).not.toBeInTheDocument();

    // The "Notes:" label itself is gone — there is no customer-facing
    // notes block to render any more.
    expect(screen.queryByText("Notes:")).not.toBeInTheDocument();

    // Defence-in-depth: the marker must not appear as a substring of
    // any text node. queryByText is exact-match; this catches a
    // split/joined render that still contains the marker.
    const root = document.body.textContent ?? "";
    expect(root).not.toContain(INTERNAL_NOTES_MARKER);
  });
});
