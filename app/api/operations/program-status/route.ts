import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { canManageAppointments } from "@/lib/scheduling/can-manage-appointments";
import { PROGRAM_WAVE_MANIFEST } from "@/lib/operations/program-wave-manifest";
import { loadOperationalMetrics } from "@/lib/operations/load-operational-metrics";
import { getSloTargets } from "@/lib/operations/slo-targets";
import { readSloLastRun } from "@/lib/operations/read-slo-last-run";

/** GET — leadership program + stall metrics (Wave 5). */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const role = (session.user as { role?: string }).role;
    if (!canManageAppointments(role)) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Manager or owner role required",
        status: 403,
      });
    }

    const caller = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true },
    });

    const metrics = await loadOperationalMetrics(prisma, {
      userId: session.user.id,
      organizationId: caller?.organizationId,
    });

    return NextResponse.json({
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      waves: PROGRAM_WAVE_MANIFEST,
      operations: metrics,
      slo: {
        targets: getSloTargets(),
        lastRun: readSloLastRun(),
      },
      links: {
        completenessInbox: "/dashboard/operations/completeness-inbox",
        integrationHealth: "/dashboard/integrations/health",
        syncErrors: "/dashboard/integrations/sync-errors",
        auditExport: "/api/operations/audit-export",
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "program-status" });
  }
}