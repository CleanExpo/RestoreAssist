// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formLinePrices,
  shownCents,
} from "@/lib/invoices/__tests__/fixtures/mixed-gst-lines";

/**
 * RA-7896 — each credit-note line shows its price ex GST and inc GST, per
 * line, and the inc-GST prices add up to Total Credit. Worked by hand:
 *   0.69 x $22.50 -> $15.53 ex, $17.08 inc;  3 x $19.99 -> $59.97 ex, $65.97 inc.
 *
 * Sabotage: show the ex-GST amount as inc GST — both lines go red.
 */

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import NewCreditNotePage from "../page";

afterEach(() => vi.unstubAllGlobals());

describe("RA-7896 new credit note — line prices ex GST and inc GST", () => {
  it("prices each line per line and the lines sum to Total Credit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/gst-treatment") {
          return { ok: true, status: 200, json: async () => ({ data: { country: "AU" } }) };
        }
        return { ok: true, status: 200, json: async () => ({ invoices: [] }) };
      }),
    );
    const { container } = render(<NewCreditNotePage />);

    fireEvent.click(screen.getByRole("button", { name: /Add Item/i }));
    const qty = screen.getAllByPlaceholderText("Qty");
    const price = screen.getAllByPlaceholderText("Unit price");
    fireEvent.change(qty[0], { target: { value: "0.69" } });
    fireEvent.change(price[0], { target: { value: "22.50" } });
    fireEvent.change(qty[1], { target: { value: "3" } });
    fireEvent.change(price[1], { target: { value: "19.99" } });

    await waitFor(() =>
      expect(formLinePrices(container)).toEqual([
        ["$15.53", "$17.08"],
        ["$59.97", "$65.97"],
      ]),
    );
    const total = screen.getByText("Total Credit").nextElementSibling!;
    const sumInc = formLinePrices(container).reduce((s, [, inc]) => s + shownCents(inc), 0);
    expect(sumInc).toBe(shownCents(total.textContent!));
  });
});
