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
 * RA-7896 — the inspection's draft invoice shows every saved line ex GST and
 * inc GST. Sabotage: render `item.subtotal` in the Inc GST cell — labour goes red.
 */

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import InspectionInvoicePage from "../page";

afterEach(() => vi.unstubAllGlobals());

describe("RA-7896 inspection invoice — line prices ex GST and inc GST", () => {
  it("shows each stored line ex GST and inc GST", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          invoice: {
            id: "inv_7896",
            invoiceNumber: "INV-7896",
            status: "DRAFT",
            customerName: "Mock Customer",
            ...MIXED_GST_TOTALS,
            customerEmail: "mock@example.com",
            amountDue: MIXED_GST_TOTALS.totalIncGST,
            dueDate: "2026-10-17T00:00:00.000Z",
            lineItems: MIXED_GST_LINES,
          },
        }),
      }),
    );
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <InspectionInvoicePage params={Promise.resolve({ id: "insp_7896" })} />,
      ));
    });
    expect(await screen.findByText("Dehumidifier hire")).toBeInTheDocument();

    MIXED_GST_LINES.forEach((line, i) => {
      expect(exIncCells(container, line.description)).toEqual(MIXED_GST_EXPECTED[i]);
    });
  });
});
