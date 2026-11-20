import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { canManageAppointments } from "@/lib/scheduling/can-manage-appointments";
import {
  renderAuditExportCsv,
  type AuditExportRow,
} from "@/lib/operations/audit-export-csv";
import { parseIsoQueryParam } from "@/lib/api/parse-iso-query";
import { applyRateLimit } from "@/lib/rate-limiter";

/** GET — org audit trail CSV (Wave 6, manager/owner). */
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

    const rateLimited = await applyRateLimit(request, {
      maxRequests: 10,
      windowMs: 60 * 1000,
      prefix: "audit-export",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    const caller = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true },
    });
    const orgId = caller?.organizationId;
    if (!orgId) {
      return apiError(request, {
        code: "CONFLICT",
        message: "No organisation linked to this user",
        status: 409,
      });
    }

    const sinceParsed = parseIsoQueryParam(
      request.nextUrl.searchParams.get("since"),
    );
    if (!sinceParsed.ok) {
      return apiError(request, {
        code: "VALIDATION_ERROR",
        message: sinceParsed.reason,
        status: 400,
      });
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        inspection: {
          user: { organizationId: orgId },
        },
        ...(sinceParsed.value
          ? { timestamp: { gte: sinceParsed.value } }
          : {}),
      },
      orderBy: { timestamp: "desc" },
      take: 500,
      select: {
        timestamp: true,
        inspectionId: true,
        action: true,
        entityType: true,
        entityId: true,
        userId: true,
        device: true,
        inspection: { select: { inspectionNumber: true } },
      },
    });

    const rows: AuditExportRow[] = logs.map((log) => ({
      timestamp: log.timestamp.toISOString(),
      inspectionId: log.inspectionId,
      inspectionNumber: log.inspection.inspectionNumber,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      userId: log.userId,
      device: log.device,
    }));

    const csv = renderAuditExportCsv(rows);
    const filename = `audit-export-${orgId.slice(0, 8)}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "audit-export" });
  }
}