/**
 * POST /api/inspections/[id]/accept
 *
 * Tradie taps "Accept & Start" on the dashboard inbound-job alert
 * (<InboundJobAlert>) for a DR/NRPG-sourced inspection sitting in DRAFT.
 *
 * Behaviour:
 *  - sets Inspection.acceptedAt = now()
 *  - flips Inspection.status DRAFT → PROCESSING
 *  - writes an AuditLog row (action: "DR_NRPG_INSPECTION_ACCEPTED")
 *
 * Notes:
 *  - InspectionStatus enum has no IN_PROGRESS value (DRAFT, SUBMITTED,
 *    PROCESSING, CLASSIFIED, SCOPED, ESTIMATED, COMPLETED, REJECTED), so
 *    "in progress" is represented by PROCESSING. [ASSUMPTION]
 *  - Authority: any authenticated session.user that owns the inspection
 *    can accept. Role gating (USER vs ADMIN) is NOT enforced here —
 *    ownership via userId is sufficient for v1. [ASSUMPTION]
 *  - CAS prevents double-accept: updateMany with `acceptedAt: null` in the
 *    WHERE clause flips at most one row. If count === 0 we distinguish
 *    "already accepted" (409) from "not found" (404).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

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

  try {
    const acceptedAt = new Date();

    // Atomic CAS — only flip if not yet accepted. Prevents the
    // dashboard-alert TOCTOU race where two tabs both tap Accept.
    const result = await prisma.inspection.updateMany({
      where: {
        id: inspectionId,
        userId,
        ...({ acceptedAt: null } as any),
      },
      data: {
        ...({
          acceptedAt,
          status: "PROCESSING",
        } as any),
      },
    });

    if (result.count === 0) {
      const exists = await prisma.inspection.findFirst({
        where: { id: inspectionId, userId },
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
        message: "Inspection already accepted",
        status: 409,
      });
    }

    // Audit trail — record who accepted, when, and (best-effort) source IP.
    // Non-fatal: audit-write failure must not undo the accept.
    try {
      await prisma.auditLog.create({
        data: {
          inspectionId,
          userId,
          action: "DR_NRPG_INSPECTION_ACCEPTED",
          entityType: "Inspection",
          entityId: inspectionId,
          ipAddress:
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            null,
          userAgent: request.headers.get("user-agent") ?? null,
          newValue: JSON.stringify({
            status: "PROCESSING",
            acceptedAt: acceptedAt.toISOString(),
          }),
        },
      });
    } catch (auditErr) {
      console.warn(
        "[inspections/accept] AuditLog write failed (non-fatal):",
        auditErr instanceof Error ? auditErr.message : auditErr,
      );
    }

    return NextResponse.json({
      success: true,
      status: "PROCESSING",
      acceptedAt: acceptedAt.toISOString(),
    });
  } catch (error) {
    return fromException(request, error, { stage: "inspection-accept" });
  }
}
