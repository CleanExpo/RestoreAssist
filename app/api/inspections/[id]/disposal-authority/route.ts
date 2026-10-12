import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import { sanitizeString } from "@/lib/sanitize";
import { DISPOSAL_AUTHORITY_AUDIT_ACTION } from "@/lib/compliance/disposal-authority-gate";

/**
 * POST — record signed disposal / strip-out authority (P2 / V1 P1-11).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const { id: inspectionId } = await params;
    const tenancy = await resolveInspectionWrite(session, inspectionId);
    if (!tenancy.ok) {
      return apiError(request, {
        code:
          tenancy.status === 401
            ? "UNAUTHORIZED"
            : tenancy.status === 403
              ? "FORBIDDEN"
              : "NOT_FOUND",
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const signerName =
      typeof body.signerName === "string" ? body.signerName.trim() : "";
    const reference =
      typeof body.reference === "string" ? body.reference.trim() : "";
    if (!signerName || signerName.length < 2) {
      return apiError(request, {
        code: "VALIDATION",
        message: "signerName is required",
        status: 400,
      });
    }

    const userId = session!.user!.id;
    const audit = await prisma.auditLog.create({
      data: {
        inspectionId,
        userId,
        action: DISPOSAL_AUTHORITY_AUDIT_ACTION,
        entityType: "Inspection",
        entityId: inspectionId,
        changes: JSON.stringify({
          signerName: sanitizeString(signerName, 200),
          reference: reference ? sanitizeString(reference, 500) : null,
          recordedAt: new Date().toISOString(),
        }),
      },
      select: { id: true, createdAt: true },
    });

    return NextResponse.json({
      success: true,
      disposalAuthority: {
        auditLogId: audit.id,
        recordedAt: audit.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "disposal-authority-post" });
  }
}
