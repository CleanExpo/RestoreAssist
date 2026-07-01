/**
 * POST /api/inspections/[id]/sign
 *
 * Captures e-signature sign-off for an inspection (RA-269).
 * Under the Australian Electronic Transactions Act 1999, a typed name + intent
 * constitutes a valid electronic signature.
 *
 * Body: {
 *   signatoryName: string   // Full name of person signing
 *   signatureUrl?: string   // Optional Supabase Storage URL for drawn SVG/PNG signature
 *   role?: string           // e.g. "Lead Technician", "Site Supervisor"
 * }
 *
 * Returns: { signedAt, signedByName, signatureUrl }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { withIdempotency } from "@/lib/idempotency";
import { onNextAction } from "@/lib/lifecycle/subscribers/next-action";
import { apiError, fromException } from "@/lib/api-errors";
import { InspectionStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id: inspectionId } = await params;

  // RA-1266: signature is a terminal electronic-signing event. The CAS
  // already prevents a double-sign at the DB layer, but idempotency
  // returns the original success response on retry instead of "already
  // signed" 409, which is cleaner for the client.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { signatoryName, signatureUrl, role } = body as {
        signatoryName?: string;
        signatureUrl?: string;
        role?: string;
      };

      if (!signatoryName?.trim()) {
        return apiError(request, {
          code: "VALIDATION",
          message: "signatoryName is required",
          status: 400,
        });
      }

      const displayName = role
        ? `${signatoryName.trim()} (${role.trim()})`
        : signatoryName.trim();

      const signedAt = new Date();

      // Atomic CAS — updateMany with signedAt: null prevents double-signature TOCTOU race
      const result = await prisma.inspection.updateMany({
        where: {
          id: inspectionId,
          userId: userId,
          ...({ signedAt: null } as any),
        },
        data: {
          ...({
            signedAt,
            signedByName: displayName,
            signatureUrl: signatureUrl?.trim() || null,
            status: "SUBMITTED",
            submittedAt: signedAt,
          } as any),
        },
      });

      if (result.count > 0) {
        // P1 #11.1 — fire-and-forget next-action nudge (CLAUDE.md rule #13).
        // Idempotent on (inspectionId, status) so duplicate dispatches across
        // submit/sign converge to a single notification.
        void onNextAction(inspectionId, InspectionStatus.SUBMITTED).catch(
          (err) => console.error("[next-action] SUBMITTED nudge failed:", err),
        );
      }

      if (result.count === 0) {
        // Distinguish "not found" from "already signed" for correct HTTP status
        const exists = await prisma.inspection.findFirst({
          where: { id: inspectionId, userId: userId },
          select: { id: true },
        });
        if (!exists) {
          return apiError(request, {
            code: "NOT_FOUND",
            message: "Inspection not found",
            status: 404,
          });
        }
        return apiError(request, {
          code: "CONFLICT",
          message: "Inspection has already been signed. Contact admin to reset.",
          status: 409,
        });
      }

      return NextResponse.json({
        success: true,
        signedAt,
        signedByName: displayName,
        signatureUrl: signatureUrl?.trim() || null,
        status: "SUBMITTED",
      });
    } catch (error) {
      return fromException(request, error, { stage: "sign-post" });
    }
  });
}

/**
 * DELETE /api/inspections/[id]/sign
 *
 * Resets the e-signature (admin-only). Allows re-signing after error.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { id: inspectionId } = await params;

    await prisma.inspection.updateMany({
      where: { id: inspectionId },
      data: { signedAt: null, signedByName: null, signatureUrl: null } as any,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(_request, error, { stage: "sign-delete" });
  }
}
