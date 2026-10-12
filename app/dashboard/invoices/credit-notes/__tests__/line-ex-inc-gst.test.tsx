// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIXED_GST_EXPECTED,
  MIXED_GST_LINES,
  MIXED_GST_TOTALS,
  exIncCells,
} from "@/lib/invoices/__tests__/fixtures/mixed-gst-lines";

/**
 * RA-7896 — an opened credit note shows every saved line ex GST and inc GST.
 * Sabotage: render `item.subtotal` in the Inc GST cell — labour goes red.
 */

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: "u1" } } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import CreditNotesPage from "../page";

afterEach(() => vi.unstubAllGlobals());

describe("RA-7896 credit notes — line prices ex GST and inc GST", () => {
  it("shows each stored credit line ex GST and inc GST", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          creditNotes: [
            {
              id: "cn_7896",
              creditNoteNumber: "CN-7896",
              status: "ISSUED",
              creditDate: "2026-10-03T00:00:00.000Z",
              appliedDate: null,
              ...MIXED_GST_TOTALS,
              reason: "OTHER",
              reasonNotes: null,
              refundMethod: null,
              refundReference: null,
              refundedAt: null,
              invoiceId: "inv_7896",
              invoice: { invoiceNumber: "INV-7896", customerName: "Mock Customer" },
              lineItems: MIXED_GST_LINES.map((l, i) => ({ ...l, sortOrder: i })),
            },
          ],
        }),
      }),
    );
    const { container } = render(<CreditNotesPage />);
    fireEvent.click(await screen.findByText("CN-7896"));
    expect(await screen.findByText("Dehumidifier hire")).toBeInTheDocument();

    MIXED_GST_LINES.forEach((line, i) => {
      expect(exIncCells(container, line.description)).toEqual(MIXED_GST_EXPECTED[i]);
    });
  });
});
