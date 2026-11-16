/**
 * RA-8398: the one line check for every route that takes invoice-style lines
 * (quantity, unit price, GST rate) and turns them into money.
 *
 * Before this, the check was copied by hand into three routes (invoice create,
 * invoice edit, variation create) and missing from two (credit-note create,
 * recurring template create), so those two saved negative or NaN totals.
 * Call this; never copy it. `app/api/invoices/__tests__/money-lines-coverage.test.ts`
 * fails when a route that reads `lineItems` from the body does not call it.
 *
 * Rules, per line:
 * - quantity: a finite number, 0 or more.
 * - unitPrice: a finite number, 0 or more, unless `allowNegativePrice`.
 * - gstRate: optional (null, undefined or "" means "use the default rate");
 *   when given, a finite number, 0 or more.
 *
 * A number may arrive as a JSON number or a numeric string. A string must be
 * wholly numeric ("12abc" and "" are rejected), so a value the route later
 * reads with `Number()` can never turn into NaN after passing this check.
 *
 * Decision on negative prices (RA-8398): only an invoice variation may carry a
 * negative unit price. A variation can reduce the agreed scope (a credit
 * variation), and the variation route has accepted negative prices since it
 * was written. Invoices, credit notes and recurring templates may not: a credit
 * note is already a credit, so a negative line would flip it into a charge.
 * Change this only with an owner decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";

export interface MoneyLineOptions {
  /** Variation lines only; see the decision above. Defaults to false. */
  allowNegativePrice?: boolean;
}

export interface MoneyLineIssue {
  /** Zero-based line index; -1 when the list itself is missing or empty. */
  index: number;
  field: "lineItems" | "quantity" | "unitPrice" | "gstRate";
  message: string;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

/**
 * Returns the first bad line and field, or null when every line is valid.
 * An absent or empty list is an issue: every caller needs at least one line.
 */
export function findInvalidMoneyLine(
  lineItems: unknown,
  { allowNegativePrice = false }: MoneyLineOptions = {},
): MoneyLineIssue | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return {
      index: -1,
      field: "lineItems",
      message: "At least one line item is required",
    };
  }

  for (let index = 0; index < lineItems.length; index++) {
    const raw: unknown = lineItems[index];
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    const line = `Line item ${index + 1}`;

    const quantity = toFiniteNumber(item.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return {
        index,
        field: "quantity",
        message: `${line} has an invalid quantity — must be a non-negative number`,
      };
    }

    const unitPrice = toFiniteNumber(item.unitPrice);
    if (!Number.isFinite(unitPrice) || (!allowNegativePrice && unitPrice < 0)) {
      return {
        index,
        field: "unitPrice",
        message: allowNegativePrice
          ? `${line} has an invalid unit price — must be a number`
          : `${line} has an invalid unit price — must be a non-negative number`,
      };
    }

    const gstRate = item.gstRate;
    if (gstRate !== null && gstRate !== undefined && gstRate !== "") {
      const rate = toFiniteNumber(gstRate);
      if (!Number.isFinite(rate) || rate < 0) {
        return {
          index,
          field: "gstRate",
          message: `${line} has an invalid GST rate — must be a non-negative number`,
        };
      }
    }
  }

  return null;
}

/**
 * Route wrapper: a 400 VALIDATION response naming the bad line and field, or
 * null when the lines are valid.
 */
export function validateMoneyLines(
  request: NextRequest,
  lineItems: unknown,
  options: MoneyLineOptions = {},
): NextResponse | null {
  const issue = findInvalidMoneyLine(lineItems, options);
  if (!issue) return null;
  const fieldKey =
    issue.index < 0 ? "lineItems" : `lineItems.${issue.index}.${issue.field}`;
  return apiError(request, {
    code: "VALIDATION",
    message: issue.message,
    status: 400,
    fields: { [fieldKey]: issue.message },
  });
}
