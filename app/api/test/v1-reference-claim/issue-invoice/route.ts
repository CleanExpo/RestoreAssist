/**
 * TEST-ONLY — mark the caller's DRAFT invoice SENT, standing in for
 * POST /api/invoices/[id]/send, whose only extra work is the client email.
 *
 * The send route answers 503 without an email provider (MAILTRAP_API_KEY +
 * SENDER_EMAIL), and the sketch-e2e job has none, so the reference claim's
 * invoice stayed DRAFT and the payments route refused it ("Cannot record
 * payment for draft or cancelled invoices"). Like finalize-exit beside it,
 * this simulates only the external step; the payment, reconciliation and
 * close the spec asserts still run through the real routes.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { testHelpersBlocked } from "../../_helpers";

export async function POST(req: NextRequest) {
  if (testHelpersBlocked()) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Test helpers are not enabled",
      status: 404,
    });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let body: { invoiceId?: string };
  try {
    body = JSON.parse(await req.text());
  } catch {
    body = {};
  }
  if (!body.invoiceId) {
    return apiError(req, {
      code: "VALIDATION",
      message: "invoiceId required",
      status: 400,
    });
  }

  // Only the caller's own DRAFT invoice moves; anything else is a 404, so this
  // can neither reach another tenant's invoice nor reopen a paid one.
  const updated = await prisma.invoice.updateMany({
    where: { id: body.invoiceId, userId: session.user.id, status: "DRAFT" },
    data: { status: "SENT", sentDate: new Date() },
  });
  if (updated.count === 0) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Draft invoice not found",
      status: 404,
    });
  }

  return NextResponse.json({ ok: true });
}
