import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveClientRecipient } from "@/lib/client-recipient";
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
import { auditInspectionById } from "@/lib/evidence/field-evidence-audit";
import { requiredFieldEvidenceGapCount as countRequiredFieldEvidenceGaps } from "@/lib/reports/field-evidence-send-gate";

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
      resolveClientRecipient({
        reportClient: inspection?.report?.client,
        inspectionClient: inspection?.client,
      })?.email ?? null;
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

    // A check that could not run is unknown, never "no blockers".
    let completenessBlockerCount: number | null = 0;
    let completenessCheckError = false;
    try {
      const claimType = normalizeClaimType(
        inspection?.claimType ?? "water_damage",
      );
      if (claimType) {
        const validation = await validateSubmission(id, claimType);
        completenessBlockerCount = validation.gaps?.length ?? 0;
      } else {
        // CONTENTS / ASBESTOS and other unmapped types have no workflow.
        // That is unchecked, not "no blockers".
        completenessBlockerCount = null;
      }
    } catch (error) {
      console.error("[comms-readiness] completeness check failed:", error);
      completenessBlockerCount = null;
      completenessCheckError = true;
    }

    const reportDeliveredAt = reportDelivery?.timestamp?.toISOString() ?? null;
    const portalLinkEmailedAt =
      portalDelivery?.timestamp?.toISOString() ?? null;

    let requiredFieldEvidenceGapCount: number | null = 0;
    let fieldEvidenceCheckError = false;
    try {
      const fieldChecklist = await auditInspectionById(id);
      requiredFieldEvidenceGapCount = countRequiredFieldEvidenceGaps(
        fieldChecklist,
      );
    } catch (error) {
      console.error("[comms-readiness] field evidence audit failed:", error);
      requiredFieldEvidenceGapCount = null;
      fieldEvidenceCheckError = true;
    }

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
      completenessCheckError,
      requiredFieldEvidenceGapCount,
      fieldEvidenceCheckError,
      inspectionId: id,
    };

    return NextResponse.json({ data });
  } catch (e) {
    return fromException(request, e);
  }
}
