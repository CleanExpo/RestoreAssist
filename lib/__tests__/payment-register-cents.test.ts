import { describe, it, expect } from "vitest";

/**
 * Regression test for the Payment Register money-display bug.
 *
 * `app/dashboard/invoices/payments/page.tsx` previously normalised amounts
 * with a `> 1000` heuristic that only divided API cents by 100 when the value
 * looked "large". Because the payments API stores `InvoicePayment.amount` as
 * `Int // Amount in cents` (Prisma schema), a real $9.50 payment (950 cents)
 * was NOT divided and rendered as "$950.00" — ~100x too large. The month-to-date
 * total and CSV export both read the same normalised value, so they inherited
 * the error.
 *
 * API amounts ALWAYS divide by 100. There is no mock-dollar path.
 */

import { paymentAmountToDollars } from "@/app/dashboard/invoices/payments/page";

// Mirror of the page's display formatter ($X.XX).
const formatCurrency = (amount: number): string => `$${amount.toFixed(2)}`;

describe("paymentAmountToDollars — Payment Register cents normalisation", () => {
  it("converts a sub-$10 API payment (950 cents) to $9.50, not $950.00", () => {
    const dollars = paymentAmountToDollars(950);
    expect(dollars).toBe(9.5);
    expect(formatCurrency(dollars)).toBe("$9.50");
    expect(formatCurrency(dollars)).not.toBe("$950.00");
  });

  it("converts a large API payment (485000 cents) to $4850.00", () => {
    const dollars = paymentAmountToDollars(485000);
    expect(dollars).toBe(4850);
    expect(formatCurrency(dollars)).toBe("$4850.00");
  });

  it("converts a boundary API payment of exactly $10.00 (1000 cents) to $10.00", () => {
    // The old heuristic only divided when amount > 1000, so exactly 1000 cents
    // ($10.00) wrongly rendered as "$1000.00". This is the off-by-one edge.
    const dollars = paymentAmountToDollars(1000);
    expect(dollars).toBe(10);
    expect(formatCurrency(dollars)).toBe("$10.00");
  });

  it("MTD total sums corrected dollar values (3 sub-$10 payments = $28.50, not $2850)", () => {
    // 950c + 950c + 950c = 2850 cents = $28.50
    const apiCents = [950, 950, 950];
    const total = apiCents
      .map((c) => paymentAmountToDollars(c))
      .reduce((sum, d) => sum + d, 0);
    expect(total).toBeCloseTo(28.5, 10);
    expect(formatCurrency(total)).toBe("$28.50");
  });

  it("CSV export amount column uses the corrected dollar value", () => {
    // CSV rows render p.amount.toFixed(2); p.amount is already normalised.
    const csvCell = paymentAmountToDollars(950).toFixed(2);
    expect(csvCell).toBe("9.50");
  });
});

describe("payments page source no longer uses the >1000 heuristic", () => {
  it("does not reintroduce the `amount > 1000` conditional division", async () => {
    const fs = await import("fs/promises");
    const src = await fs.readFile(
      "app/dashboard/invoices/payments/page.tsx",
      "utf-8",
    );
    expect(src).not.toMatch(/amount\s*>\s*1000/);
    expect(src).not.toMatch(/MOCK_PAYMENTS/);
  });
});
