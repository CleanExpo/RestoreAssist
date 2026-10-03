// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIXED_GST_EXPECTED,
  MIXED_GST_LINES,
  MIXED_GST_TOTALS,
  exIncCells,
} from "@/lib/invoices/__tests__/fixtures/mixed-gst-lines";

/**
 * RA-7896 — the invoice view shows every saved line ex GST and inc GST.
 * Sabotage: render `item.subtotal` in the Inc GST cell — labour goes red.
 */

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import InvoiceDetailPage from "../page";

afterEach(() => vi.unstubAllGlobals());

describe("RA-7896 invoice view — line prices ex GST and inc GST", () => {
  it("shows each stored line ex GST and inc GST", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/invoices/inv_7896") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              invoice: {
                id: "inv_7896",
                invoiceNumber: "INV-7896",
                status: "DRAFT",
                invoiceDate: "2026-10-03T00:00:00.000Z",
                dueDate: "2026-10-17T00:00:00.000Z",
                customerName: "Mock Customer",
                customerEmail: "mock@example.com",
                ...MIXED_GST_TOTALS,
                amountPaid: 0,
                amountDue: MIXED_GST_TOTALS.totalIncGST,
                lineItems: MIXED_GST_LINES,
                payments: [],
                auditLogs: [],
              },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ variations: [] }) };
      }),
    );
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <InvoiceDetailPage params={Promise.resolve({ id: "inv_7896" })} />,
      ));
    });
    expect(await screen.findByText("Dehumidifier hire")).toBeInTheDocument();

    MIXED_GST_LINES.forEach((line, i) => {
      expect(exIncCells(container, line.description)).toEqual(MIXED_GST_EXPECTED[i]);
    });
  });
});
