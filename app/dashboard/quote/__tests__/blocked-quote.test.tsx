// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  blockedPricing,
  TOTAL_NOT_AVAILABLE_NOTE,
} from "@/lib/pricing/blocked-line";

/**
 * RA-8281 (B2): when /api/calculate answers with a blocked quote, the quote
 * page lists the lines, marks the one whose rate is not set, and gives no
 * total. It is not an error toast and no quote is shown.
 *
 * Sabotage: drop the readBlockedPricing branch in handleCalculate and the
 * first test goes red (the answer becomes a toast).
 */

const toastError = vi.hoisted(() => vi.fn());
vi.mock("react-hot-toast", () => ({
  default: { error: toastError, success: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import QuotePage from "../page";

const BLOCKED = blockedPricing(
  [
    {
      description: "Labour",
      quantity: 16,
      unit: "hr",
      rate: null,
      subtotal: null,
      pricingStatus: "rate_not_set",
      rateField: "masterQualifiedNormalHours",
      pricingNote: "Rate not set. Set masterQualifiedNormalHours in your price list.",
    },
    {
      description: "Air mover hire",
      quantity: 4,
      unit: "day",
      rate: 60,
      subtotal: 240,
      pricingStatus: "priced",
    },
  ],
  [],
);

function mockFetch(calculate: { ok: boolean; status: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/calculate") {
        return { ok: calculate.ok, status: calculate.status, json: async () => calculate.body };
      }
      if (url === "/api/gst-treatment") {
        return { ok: true, status: 200, json: async () => ({ data: { country: "AU" } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

async function calculate() {
  render(<QuotePage />);
  fireEvent.click(screen.getAllByText(/Water Damage/i)[0]);
  await waitFor(() => expect(screen.getByText(/Calculate/i)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/Calculate/i));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockClear();
});

describe("RA-8281 B2 quote page: a blocked quote", () => {
  it("shows the blocked line with no national range and a blocked total, not a toast or a quote", async () => {
    mockFetch({
      ok: false,
      status: 422,
      body: {
        error: { code: "RATE_NOT_SET", message: TOTAL_NOT_AVAILABLE_NOTE },
        blocked: BLOCKED,
      },
    });
    await calculate();
    const notice = await screen.findByTestId("blocked-pricing");
    const row = notice.querySelector('tr[data-pricing-status="rate_not_set"]')!;
    const cells = Array.from(row.querySelectorAll("td")).map((td) => td.textContent);
    expect(cells).toEqual([
      "Labour",
      "16 hr",
      "Rate not set",
      "—",
    ]);
    expect(notice.querySelector("tfoot")?.textContent).toBe(
      `Total${TOTAL_NOT_AVAILABLE_NOTE}`,
    );
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.queryByText(/Quote Generated/i)).toBeNull();
  });

  it("control: another failure is an error toast with no blocked lines", async () => {
    mockFetch({ ok: false, status: 500, body: { error: "Calculation failed badly" } });
    await calculate();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Calculation failed badly"));
    expect(screen.queryByTestId("blocked-pricing")).toBeNull();
  });
});
