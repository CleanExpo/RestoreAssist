// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formLinePrices } from "@/lib/invoices/__tests__/fixtures/mixed-gst-lines";

/**
 * RA-7896 — each recurring-invoice template line shows its price ex GST and
 * inc GST, per line. 0.69 x $22.50 -> $15.53 ex GST, $17.08 inc GST (by hand).
 *
 * Sabotage: show the ex-GST amount as inc GST — the inc figure goes red.
 */

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import NewRecurringInvoicePage from "../page";

afterEach(() => vi.unstubAllGlobals());

describe("RA-7896 new recurring invoice — line prices ex GST and inc GST", () => {
  it("shows the line ex GST and inc GST once the GST rate is known", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/gst-treatment") {
          return { ok: true, status: 200, json: async () => ({ data: { country: "AU" } }) };
        }
        return { ok: true, status: 200, json: async () => ({ clients: [] }) };
      }),
    );
    const { container } = render(<NewRecurringInvoicePage />);

    fireEvent.change(screen.getByPlaceholderText("Qty"), { target: { value: "0.69" } });
    fireEvent.change(screen.getByPlaceholderText("Unit price ($)"), {
      target: { value: "22.50" },
    });

    await waitFor(() => expect(formLinePrices(container)).toEqual([["$15.53", "$17.08"]]));
  });
});
