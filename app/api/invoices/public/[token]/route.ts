/**
 * GET /api/invoices/public/[token]
 * Unauthenticated public invoice viewer data (token + expiry gated).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { applyRateLimit } from "@/lib/rate-limiter";
import { isPublicTokenValid } from "@/lib/invoices/public-token";

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
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        invoiceDate: true,
        dueDate: true,
        customerName: true,
        customerEmail: true,
        customerAddress: true,
        customerABN: true,
        subtotalExGST: true,
        gstAmount: true,
        totalIncGST: true,
        amountPaid: true,
        amountDue: true,
        currency: true,
        notes: true,
        terms: true,
        footer: true,
        publicToken: true,
        publicTokenExpiresAt: true,
        user: {
          select: {
            businessName: true,
            businessABN: true,
            businessAddress: true,
            businessPhone: true,
            businessEmail: true,
            businessLogo: true,
          },
        },
        lineItems: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            description: true,
            category: true,
            quantity: true,
            unitPrice: true,
            subtotal: true,
            gstRate: true,
            gstAmount: true,
            total: true,
            sortOrder: true,
          },
        },
      },
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

    const { publicToken: _t, publicTokenExpiresAt: _e, user, ...publicFields } =
      invoice!;

    return NextResponse.json({
      invoice: {
        ...publicFields,
        contractor: user,
        expiresAt: invoice!.publicTokenExpiresAt,
      },
    });
  } catch (err) {
    return fromException(request, err, { stage: "invoice-public-get" });
  }
}
