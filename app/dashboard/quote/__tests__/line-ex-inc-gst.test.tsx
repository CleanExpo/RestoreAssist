// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * RA-7896 — the quote table shows every row ex GST and inc GST, including the
 * minimum-charge top-up row, so the rows add up to the totals underneath.
 *
 * Sabotage: render `item.exGST` in the Inc GST cell — the labour row goes red.
 * Drop the top-up row — its row lookup goes red.
 */

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import QuotePage from "../page";

// $2,000.00 of lines + $822.50 top-up = $2,822.50 ex GST; $3,104.75 inc GST.
const QUOTE = {
  quoteNumber: "QTE-7896",
  quoteDate: new Date().toISOString(),
  jobType: "Water Damage Restoration",
  standardApplied: "",
  applicableStandards: [],
  safety: { mouldActive: false, airMoverQty: 4, advisories: [] },
  contractor: { businessName: "Test Co", abn: "", address: "", phone: "", email: "", logo: "" },
  client: { name: "Jane Client", address: "", phone: "", email: "jane@example.com" },
  lineItems: [
    { description: "Labour", qty: 16, unit: "hr", rate: 110, subtotal: 1760, exGST: 1760, incGST: 1936 },
    { description: "Air mover hire", qty: 4, unit: "day", rate: 60, subtotal: 240, exGST: 240, incGST: 264 },
  ],
  minimumChargeLine: {
    description: "Minimum engagement charge (industry minimum)",
    exGST: 822.5,
    incGST: 904.75,
  },
  subtotalExGST: 2822.5,
  gst: 282.25,
  totalIncGST: 3104.75,
  minimumApplied: true,
  minimumChargeAmount: 2822.5,
  jobDescription: "",
};

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/calculate") return { ok: true, status: 200, json: async () => QUOTE };
      if (url === "/api/gst-treatment") {
        return { ok: true, status: 200, json: async () => ({ data: { country: "AU" } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

/** The Ex GST and Inc GST cells of the row whose first cell is `description`. */
function exInc(description: string) {
  const row = screen.getByText(description, { selector: "td" }).closest("tr")!;
  const cells = Array.from(row.querySelectorAll("td")).map((td) => td.textContent!.trim());
  return cells.slice(-2);
}

afterEach(() => vi.unstubAllGlobals());

describe("RA-7896 quote page — line prices ex GST and inc GST", () => {
  it("shows each row and the top-up row ex GST and inc GST under labelled columns", async () => {
    mockFetch();
    render(<QuotePage />);
    fireEvent.click(screen.getAllByText(/Water Damage/i)[0]);
    await waitFor(() => expect(screen.getByText(/Calculate/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Calculate/i));
    await waitFor(() => expect(screen.getByText(/Quote Generated/i)).toBeInTheDocument());

    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent!.trim());
    expect(headers.slice(-2)).toEqual(["Ex GST", "Inc GST"]);

    expect(exInc("Labour")).toEqual(["$1,760.00", "$1,936.00"]);
    expect(exInc("Air mover hire")).toEqual(["$240.00", "$264.00"]);
    expect(exInc("Minimum engagement charge (industry minimum)")).toEqual([
      "$822.50",
      "$904.75",
    ]);
    expect(screen.getByText("$3,104.75")).toBeInTheDocument();
  });
});
