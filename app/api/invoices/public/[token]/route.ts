/**
 * GET /api/invoices/public/[token]
 * Unauthenticated public invoice viewer data (token + expiry gated).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { applyRateLimit } from "@/lib/rate-limiter";
import { isPublicTokenValid } from "@/lib/invoices/public-token";
import {
  PUBLIC_INVOICE_SELECT,
  type PublicInvoiceDto,
} from "@/lib/invoices/public-invoice-dto";

type SelectedInvoice = NonNullable<
  Awaited<ReturnType<typeof prisma.invoice.findFirst<{ select: typeof PUBLIC_INVOICE_SELECT }>>>
>;

/**
 * Build the public response shape by picking each allowlisted field by
 * name. Never rest-spread the Prisma result — a new column on the
 * Invoice model is not automatically included here, and the explicit
 * allowlist catches the "I added a field to Invoice, where did it
 * appear" foot-gun.
 *
 * `publicToken` is consumed for validation only; it is never emitted.
 * `publicTokenExpiresAt` is renamed to `expiresAt`. `user` is renamed
 * to `contractor`.
 */
function toPublicInvoiceDto(invoice: SelectedInvoice): PublicInvoiceDto {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail,
    customerAddress: invoice.customerAddress,
    customerABN: invoice.customerABN,
    subtotalExGST: invoice.subtotalExGST,
    gstAmount: invoice.gstAmount,
    totalIncGST: invoice.totalIncGST,
    amountPaid: invoice.amountPaid,
    amountDue: invoice.amountDue,
    currency: invoice.currency,
    terms: invoice.terms,
    footer: invoice.footer,
    lineItems: invoice.lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      category: li.category,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      subtotal: li.subtotal,
      gstRate: li.gstRate,
      gstAmount: li.gstAmount,
      total: li.total,
      sortOrder: li.sortOrder,
    })),
    contractor: invoice.user
      ? {
          businessName: invoice.user.businessName,
          businessABN: invoice.user.businessABN,
          businessAddress: invoice.user.businessAddress,
          businessPhone: invoice.user.businessPhone,
          businessEmail: invoice.user.businessEmail,
          businessLogo: invoice.user.businessLogo,
        }
      : null,
    expiresAt: invoice.publicTokenExpiresAt,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 60,
      prefix: "invoice-public",
    });
    if (rateLimited) return rateLimited;

    const { token } = await params;
    if (!token?.trim() || token.length < 16 || token.length > 128) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Invoice not found",
        status: 404,
      });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { publicToken: token },
      // Narrow public DTO — see lib/invoices/public-invoice-dto.ts.
      // The SELECT shape is one of two lines of defence. The second is
      // the explicit allowlisted transformer `toPublicInvoiceDto` above,
      // which picks fields by name rather than rest-spreading the
      // Prisma result. A new column on the Invoice model is not
      // automatically included; if a future field is added to the
      // SELECT, the regression test in this folder pins the
      // forbidden-field complement to catch staff-only leaks.
      select: PUBLIC_INVOICE_SELECT,
    });

    const check = isPublicTokenValid(invoice, token);
    if (!check.valid) {
      return apiError(request, {
        code: "NOT_FOUND",
        message:
          check.reason === "expired"
            ? "This invoice link has expired. Contact the sender for a new link."
            : "Invoice not found",
        status: 404,
      });
    }

    // Soft-mark viewed (best-effort; never fail the response)
    if (invoice && invoice.status !== "CANCELLED") {
      void prisma.invoice
        .updateMany({
          where: {
            id: invoice.id,
            viewedDate: null,
            status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] },
          },
          data: {
            viewedDate: new Date(),
            ...(invoice.status === "SENT" ? { status: "VIEWED" } : {}),
          },
        })
        .catch(() => undefined);
    }

    return NextResponse.json({ invoice: toPublicInvoiceDto(invoice!) });
  } catch (err) {
    return fromException(request, err, { stage: "invoice-public-get" });
  }
}
