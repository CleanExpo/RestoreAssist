// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formLinePrices } from "@/lib/invoices/__tests__/fixtures/mixed-gst-lines";

/**
 * RA-7896 — a new invoice line shows its price ex GST and inc GST, by the
 * per-line rule the server saves. 0.69 hr x $22.50 = $15.525 -> $15.53 ex GST,
 * GST $1.55, $17.08 inc GST (worked by hand).
 *
 * Sabotage: show the ex-GST amount as inc GST — the inc figure goes red.
 */

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import NewInvoicePage from "../page";

afterEach(() => vi.unstubAllGlobals());

function inputAfterLabel(label: string) {
  return screen.getByText(label, { selector: "label" }).nextElementSibling as HTMLInputElement;
}

describe("RA-7896 new invoice — line prices ex GST and inc GST", () => {
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
    const { container } = render(<NewInvoicePage />);

    fireEvent.change(inputAfterLabel("Quantity *"), { target: { value: "0.69" } });
    fireEvent.change(inputAfterLabel("Unit Price ($) *"), { target: { value: "22.50" } });

    await waitFor(() => expect(formLinePrices(container)).toEqual([["$15.53", "$17.08"]]));
  });
});
