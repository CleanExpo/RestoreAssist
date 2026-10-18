import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { isEmailServiceConfigured } from "@/lib/email/resolve-platform-config";
import { validateSubmission } from "@/lib/evidence/submission-gate";
import { normalizeClaimType } from "@/lib/evidence/claim-type";
import {
  CLIENT_PORTAL_LINK_EMAILED_ACTION,
  REPORT_DELIVERY_ACTIONS,
  type InspectionCommsReadiness,
} from "@/lib/dashboard/inspection-comms-readiness";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }
    const { id } = await params;
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      select: {
        reportId: true,
        claimType: true,
        clientId: true,
        client: { select: { email: true } },
        report: {
          select: {
            id: true,
            status: true,
            client: { select: { email: true } },
          },
        },
      },
    });

    const clientEmail =
      inspection?.client?.email?.trim() ||
      inspection?.report?.client?.email?.trim() ||
      null;
    const reportId = inspection?.reportId ?? inspection?.report?.id ?? null;
    const reportStatus = inspection?.report?.status ?? null;

    const [reportDelivery, portalDelivery] = reportId
      ? await Promise.all([
          prisma.auditLog.findFirst({
            where: {
              inspectionId: id,
              action: { in: [...REPORT_DELIVERY_ACTIONS] },
              entityType: "Report",
              entityId: reportId,
            },
            orderBy: { timestamp: "desc" },
            select: { timestamp: true },
          }),
          prisma.auditLog.findFirst({
            where: {
              inspectionId: id,
              action: CLIENT_PORTAL_LINK_EMAILED_ACTION,
            },
            orderBy: { timestamp: "desc" },
            select: { timestamp: true },
          }),
        ])
      : [
          null,
          await prisma.auditLog.findFirst({
            where: {
              inspectionId: id,
              action: CLIENT_PORTAL_LINK_EMAILED_ACTION,
            },
            orderBy: { timestamp: "desc" },
            select: { timestamp: true },
          }),
        ];

    let completenessBlockerCount = 0;
    try {
      const claimType = normalizeClaimType(
        inspection?.claimType ?? "water_damage",
      );
      if (claimType) {
        const validation = await validateSubmission(id, claimType);
        completenessBlockerCount = validation.gaps?.length ?? 0;
      }
    } catch {
      completenessBlockerCount = 0;
    }

    const reportDeliveredAt = reportDelivery?.timestamp?.toISOString() ?? null;
    const portalLinkEmailedAt =
      portalDelivery?.timestamp?.toISOString() ?? null;

    const data: InspectionCommsReadiness = {
      emailServiceConfigured: isEmailServiceConfigured(),
      clientHasEmail: Boolean(clientEmail),
      clientEmail,
      reportId,
      reportStatus,
      reportPdfReady: reportStatus === "COMPLETED",
      reportDeliveredAt,
      portalLinkEmailedAt,
      clientEmailSentAt: reportDeliveredAt ?? portalLinkEmailedAt,
      completenessBlockerCount,
    };

    return NextResponse.json({ data });
  } catch (e) {
    return fromException(request, e);
  }
}
