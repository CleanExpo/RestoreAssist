import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";
import { loadClaimContext } from "@/lib/margot/claim-context";
import { evaluateWaterDamageCompleteness } from "@/lib/completeness/water-damage-pack";

/** GET — V1 Phase 4 claim context + completeness pack for an inspection. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
    const { id } = await params;
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    const context = await loadClaimContext(prisma, { inspectionId: id });
    if (!context) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const [wdc, photoCount] = await Promise.all([
      prisma.waterDamageClassification.findUnique({
        where: { inspectionId: id },
        select: { waterCategory: true, damageClass: true },
      }),
      prisma.inspectionPhoto.count({ where: { inspectionId: id } }),
    ]);

    const inspection = await prisma.inspection.findFirst({
      where: { id },
      select: {
        clientId: true,
        report: { select: { incidentDate: true } },
      },
    });

    const pack = evaluateWaterDamageCompleteness({
      hasClient: Boolean(inspection?.clientId),
      hasCategoryClass: Boolean(wdc?.waterCategory && wdc?.damageClass),
      hasIncidentDate: Boolean(inspection?.report?.incidentDate),
      hasBaseline: context.baselineCaptured,
      hasMonitoringPoint: context.monitoringPointCount > 0,
      photoCount,
    });

    return NextResponse.json({ data: { context, completeness: pack } });
  } catch (error) {
    return fromException(request, error, { stage: "claim-context-get" });
  }
}
