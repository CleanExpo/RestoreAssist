import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  formAcceptsSignatureWhere,
  formSignatureRefusal,
  unsignedSlotWhere,
} from "@/lib/authority-forms/signed-record-guard";
import { clearedSigningLinkData } from "@/lib/authority-forms/signing-link";

/**
 * PATCH /api/authority-forms/:id/signatures/:signatureId
 *
 * RA-8589 — staff switch off an emailed signing link, or correct the email
 * of a signatory who has not signed yet. Both clear the token, so a link
 * already sent to a wrong address returns the same not-found reply as an
 * unknown token. Staff then press Send Request to mail a fresh link.
 *
 * Body: { action: "cancel_request" } or { signatoryEmail: string }.
 *
 * A signed slot is a closed legal record (RA-8400): the write carries
 * unsignedSlotWhere() and formAcceptsSignatureWhere(), so a signature that
 * lands between the read and the write still blocks it.
 */
const BodySchema = z.union([
  z.object({ action: z.literal("cancel_request") }).strict(),
  z
    .object({ signatoryEmail: z.string().trim().toLowerCase().email().max(254) })
    .strict(),
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; signatureId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const userId = session.user.id;
    const { id: formId, signatureId } = await params;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          'Send { "action": "cancel_request" } or { "signatoryEmail": "<valid email>" }',
        status: 400,
      });
    }

    const form = await prisma.authorityFormInstance.findUnique({
      where: { id: formId },
      select: {
        status: true,
        report: {
          select: {
            userId: true,
            assignedManagerId: true,
            assignedAdminId: true,
          },
        },
      },
    });
    if (!form) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Form not found",
        status: 404,
      });
    }
    if (
      form.report.userId !== userId &&
      form.report.assignedManagerId !== userId &&
      form.report.assignedAdminId !== userId
    ) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    const closedRefusal = formSignatureRefusal(form);
    if (closedRefusal) {
      return apiError(request, {
        code: "CONFLICT",
        message: closedRefusal,
        status: 409,
      });
    }

    const body = parsed.data;
    const data =
      "signatoryEmail" in body
        ? { ...clearedSigningLinkData(), signatoryEmail: body.signatoryEmail }
        : clearedSigningLinkData();

    // Scoped by instanceId: signatureId comes from the URL, and a foreign
    // signature must not be reachable through a form the caller owns.
    const result = await prisma.authorityFormSignature.updateMany({
      where: {
        id: signatureId,
        instanceId: formId,
        ...unsignedSlotWhere(),
        instance: formAcceptsSignatureWhere(),
      },
      data,
    });

    if (result.count === 0) {
      const existing = await prisma.authorityFormSignature.findFirst({
        where: { id: signatureId, instanceId: formId },
        select: { signedAt: true },
      });
      if (!existing) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Signature not found",
          status: 404,
        });
      }
      return apiError(request, {
        code: "CONFLICT",
        message: existing.signedAt
          ? "This signatory has already signed and can no longer be changed"
          : "This form can no longer be changed",
        status: 409,
      });
    }

    const signature = await prisma.authorityFormSignature.findFirst({
      where: { id: signatureId, instanceId: formId },
      select: {
        id: true,
        signatoryName: true,
        signatoryRole: true,
        signatoryEmail: true,
        signedAt: true,
        signatureRequestSent: true,
        signatureRequestSentAt: true,
      },
    });

    return NextResponse.json({ signature });
  } catch (error) {
    console.error("[Authority form signatory PATCH] Error:", error);
    return fromException(request, error, { stage: "update-signatory" });
  }
}
