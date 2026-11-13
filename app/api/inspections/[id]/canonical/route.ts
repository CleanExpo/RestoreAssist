import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import { linkInspectionToReport } from "@/lib/canonical/link-report-inspection";
import { isValidInsurerId } from "@/lib/insurer-profiles";
import { sanitizeString } from "@/lib/sanitize";

/**
 * PATCH /api/inspections/[id]/canonical — V1 Phase 3 spine updates.
 * Body: { clientId?, reportId?, claimNumber?, insurerTemplateId? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;
    const tenancy = await resolveInspectionWrite(session, id);
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
    const userId = session!.user!.id;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (typeof body.reportId === "string" && body.reportId.trim()) {
      const linked = await linkInspectionToReport(prisma, {
        inspectionId: id,
        reportId: body.reportId.trim(),
        userId,
        clientId:
          typeof body.clientId === "string" ? body.clientId.trim() : undefined,
      });
      if (!linked.linked) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Could not link report — check ownership",
          status: 422,
        });
      }
    }

    const data: Record<string, unknown> = {};

    if (typeof body.clientId === "string") {
      const cid = body.clientId.trim();
      if (cid) {
        const client = await prisma.client.findFirst({
          where: { id: cid, userId },
          select: { id: true },
        });
        if (!client) {
          return apiError(request, {
            code: "NOT_FOUND",
            message: "Client not found",
            status: 404,
          });
        }
        data.clientId = cid;
      } else {
        data.clientId = null;
      }
    }

    if (typeof body.claimNumber === "string") {
      data.claimNumber = sanitizeString(body.claimNumber.trim(), 120) || null;
    }

    if (typeof body.insurerTemplateId === "string") {
      const tid = body.insurerTemplateId.trim();
      if (tid && !isValidInsurerId(tid)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid insurerTemplateId",
          status: 400,
        });
      }
      data.insurerTemplateId = tid || null;
      if (tid) {
        const dbProfile = await prisma.insurerProfile.findFirst({
          where: { slug: tid, isActive: true },
          select: { id: true },
        });
        data.insurerProfileId = dbProfile?.id ?? null;
      } else {
        data.insurerProfileId = null;
      }
    }

    if (Object.keys(data).length > 0) {
      await prisma.inspection.updateMany({
        where: { id, userId },
        data,
      });
    }

    const inspection = await prisma.inspection.findFirst({
      where: { id, userId },
      select: {
        id: true,
        reportId: true,
        clientId: true,
        claimNumber: true,
        insurerTemplateId: true,
        insurerProfileId: true,
      },
    });

    return NextResponse.json({ data: inspection });
  } catch (error) {
    return fromException(request, error, { stage: "inspection-canonical-patch" });
  }
}
