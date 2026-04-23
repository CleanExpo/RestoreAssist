/**
 * RA-1596 — POST /api/invoices/[id]/rotate-public-token
 *
 * Forces rotation of the public share token on an invoice. Any
 * previously-sent share link stops working at the next viewer
 * request. Use-cases:
 *   - recipient says the link was forwarded / leaked
 *   - customer wants to re-issue after cancel/reissue flow
 *
 * Owner-only (invoice.userId === session.user.id). Rate-limited
 * per-user to prevent rotation-spam from being used to inconvenience
 * an active viewer.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";
import { mintPublicToken } from "@/lib/invoices/public-token";
import { recordMutationAudit } from "@/lib/audit-log";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfErr = validateCsrf(request);
  if (csrfErr) return csrfErr;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Sign in required",
      status: 401,
    });
  }

  const rateLimited = await applyRateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    prefix: "invoice:rotate-public-token",
    key: session.user.id,
  });
  if (rateLimited) return rateLimited;

  const { id } = await params;
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, invoiceNumber: true },
    });
    if (!invoice) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Invoice not found",
        status: 404,
      });
    }

    const { token, expiresAt, rotatedAt } = mintPublicToken();

    await prisma.invoice.update({
      where: { id },
      data: {
        publicToken: token,
        publicTokenExpiresAt: expiresAt,
        publicTokenRotatedAt: rotatedAt,
      } as any,
    });

    await recordMutationAudit({
      resource: "invoice",
      resourceId: id,
      verb: "UPDATE",
      action: "invoice.publicToken.rotate",
      actorUserId: session.user.id,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        newExpiresAt: expiresAt.toISOString(),
      },
      request,
    });

    return NextResponse.json({
      ok: true,
      publicToken: token,
      expiresAt: expiresAt.toISOString(),
      rotatedAt: rotatedAt.toISOString(),
      message:
        "New share link generated. Previous link is now invalid.",
    });
  } catch (err) {
    return fromException(request, err, { stage: "rotate-public-token" });
  }
}
