// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { shownCents } from "@/lib/invoices/__tests__/fixtures/mixed-gst-lines";

/**
 * RA-7896 — the restoration tax invoice shows every line ex GST and inc GST,
 * per line in integer cents, and its totals are the sums of those lines, so
 * the inc-GST column adds up to TOTAL AMOUNT (inc GST). Worked by hand:
 *   0.69 hr x $22.50 = $15.525 -> $15.53 ex, GST $1.55, $17.08 inc
 *   3 day x $19.99   = $59.97 ex, GST $6.00, $65.97 inc
 *   total $83.05 inc GST
 *
 * Sabotage: show the ex-GST amount in the Inc GST column — both lines go red.
 */

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import RestorationInvoiceForm, {
  type RestorationInvoiceFormData,
} from "../RestorationInvoiceForm";

function columnTexts(label: string): string[] {
  const th = screen.getByText(label, { selector: "th" });
  const table = th.closest("table")!;
  const i = Array.from(table.querySelectorAll("thead th")).indexOf(th);
  return Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
    tr.querySelectorAll("td")[i].textContent!.trim(),
  );
}

describe("RA-7896 restoration invoice — line prices ex GST and inc GST", () => {
  it("prices each line per line and the inc-GST column sums to the total", () => {
    render(
      <RestorationInvoiceForm
        initialSavedData={
          {
            lineItems: [
              { description: "Labour", qty: "0.69", unit: "hr", rate: "22.50" },
              { description: "Dehumidifier hire", qty: "3", unit: "day", rate: "19.99" },
            ],
          } as unknown as RestorationInvoiceFormData
        }
      />,
    );

    expect(columnTexts("Ex GST")).toEqual(["$15.53", "$59.97"]);
    expect(columnTexts("Inc GST")).toEqual(["$17.08", "$65.97"]);

    const total = screen.getByText("TOTAL AMOUNT (inc GST):").nextElementSibling!;
    expect(total).toHaveTextContent("$83.05");
    const sumInc = columnTexts("Inc GST").reduce((s, t) => s + shownCents(t), 0);
    expect(sumInc).toBe(shownCents(total.textContent!));
  });
});
