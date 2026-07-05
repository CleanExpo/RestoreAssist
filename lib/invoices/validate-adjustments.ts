/**
 * Numeric validation for invoice-level adjustment fields.
 *
 * Shared by the invoice create (POST `app/api/invoices/route.ts`) and edit
 * (PUT `app/api/invoices/[id]/route.ts`) handlers, which both apply these
 * fields directly into money arithmetic. A non-finite / negative / oversized
 * discount or shipping value would corrupt the persisted subtotal, GST and
 * total, so we reject it with a 400 VALIDATION before any total is computed.
 *
 * All money is in integer cents; percentages are 0–100.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";

export interface InvoiceAdjustments {
  discountAmount?: unknown;
  discountPercentage?: unknown;
  shippingAmount?: unknown;
}

/**
 * Returns a 400 `apiError` NextResponse when an adjustment field is invalid,
 * or `null` when every provided field is acceptable.
 *
 * @param subtotalExGST computed line-item subtotal (cents); a fixed
 *   discountAmount may not exceed it.
 */
export function validateAdjustments(
  request: NextRequest,
  { discountAmount, discountPercentage, shippingAmount }: InvoiceAdjustments,
  subtotalExGST: number,
): NextResponse | null {
  if (discountAmount !== undefined && discountAmount !== null) {
    const amount = Number(discountAmount);
    if (!Number.isFinite(amount) || amount < 0 || amount > subtotalExGST) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "discountAmount must be a non-negative number no greater than the subtotal",
        status: 400,
        fields: {
          discountAmount: "Must be between 0 and the subtotal",
        },
      });
    }
  }

  if (discountPercentage !== undefined && discountPercentage !== null) {
    const percent = Number(discountPercentage);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return apiError(request, {
        code: "VALIDATION",
        message: "discountPercentage must be a number between 0 and 100",
        status: 400,
        fields: {
          discountPercentage: "Must be between 0 and 100",
        },
      });
    }
  }

  if (shippingAmount !== undefined && shippingAmount !== null) {
    const shipping = Number(shippingAmount);
    if (!Number.isFinite(shipping) || shipping < 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "shippingAmount must be a non-negative number",
        status: 400,
        fields: {
          shippingAmount: "Must be a non-negative number",
        },
      });
    }
  }

  return null;
}
