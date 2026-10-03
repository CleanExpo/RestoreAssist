// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIXED_GST_EXPECTED,
  MIXED_GST_LINES,
  MIXED_GST_TOTALS,
  formLinePrices,
  shownCents,
} from "@/lib/invoices/__tests__/fixtures/mixed-gst-lines";

/**
 * RA-7896 — editing a draft invoice shows every line ex GST and inc GST,
 * worked out per line by the rule the server saves, and the inc-GST prices
 * on screen add up to the Total on screen. The fixture mixes taxable lines
 * with a GST-free line, whose inc GST equals its ex GST.
 *
 * Sabotage: pass `{ subtotal, total: subtotal }` to the price block — every
 * taxable line and the sum go red.
 */

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import EditInvoicePage from "../page";

afterEach(() => vi.unstubAllGlobals());

describe("RA-7896 edit invoice — line prices ex GST and inc GST", () => {
  it("prices each line per line and the inc-GST prices sum to the total (mixed GST-free and taxable)", async () => {
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
                currency: "AUD",
                invoiceDate: "2026-10-03T00:00:00.000Z",
                dueDate: "2026-10-17T00:00:00.000Z",
                customerName: "Mock Customer",
                customerEmail: "mock@example.com",
                ...MIXED_GST_TOTALS,
                lineItems: MIXED_GST_LINES,
              },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ clients: [] }) };
      }),
    );
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <EditInvoicePage params={Promise.resolve({ id: "inv_7896" })} />,
      ));
    });
    await waitFor(() => expect(screen.getByDisplayValue("Dehumidifier hire")).toBeInTheDocument());

    const prices = formLinePrices(container);
    expect(prices).toEqual(MIXED_GST_EXPECTED);

    const total = screen.getByText("Total", { selector: "span" }).nextElementSibling!;
    expect(total).toHaveTextContent("$203.05");
    const sumInc = prices.reduce((s, [, inc]) => s + shownCents(inc), 0);
    expect(sumInc).toBe(shownCents(total.textContent!));
    expect(sumInc).toBe(MIXED_GST_TOTALS.totalIncGST);
  });
});
