import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateInsurerToken } from "@/lib/portal-token";
import { apiError, fromException } from "@/lib/api-errors";
import { REPORT_INSURER_LINK_GENERATED_ACTION } from "@/lib/lifecycle/report-delivery";

/**
 * POST /api/reports/[id]/insurer-link
 * Generates a signed, tokenised insurer share link for a report.
 * Token is HMAC-signed, valid for 30 days.
 * The resulting URL (/portal/insurer/[token]) requires no login.
 */
export async function POST(
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

    const report = await prisma.report.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        reportNumber: true,
        propertyAddress: true,
        status: true,
        inspection: { select: { id: true } },
      },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    if (report.status !== "COMPLETED") {
      return apiError(request, {
        code: "CONFLICT",
        message: "Complete the report before sharing it with an insurer",
        status: 409,
      });
    }

    if (!report.inspection) {
      return apiError(request, {
        code: "CONFLICT",
        message: "Report is not linked to an inspection",
        status: 409,
      });
    }

    const token = generateInsurerToken(report.id);
    const baseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
      "https://restoreassist.app";
    const url = `${baseUrl}/portal/insurer/${token}`;

    // Persist link-generation evidence before returning the bearer URL. This
    // does not prove the link was sent, opened, delivered, or acknowledged.
    // Never store the bearer token itself in the audit trail.
    await prisma.auditLog.create({
      data: {
        inspectionId: report.inspection.id,
        userId: session.user.id,
        action: REPORT_INSURER_LINK_GENERATED_ACTION,
        entityType: "Report",
        entityId: report.id,
        changes: JSON.stringify({
          channel: "signed_insurer_link",
          audience: "insurer",
          deliveryStatus: "not_sent",
          reportStatus: report.status,
          expiresInDays: 30,
        }),
      },
      select: { id: true, timestamp: true },
    });

    return NextResponse.json({
      url,
      token,
      expiresInDays: 30,
      reportNumber: report.reportNumber,
      propertyAddress: report.propertyAddress,
      deliveryRecorded: false,
    });
  } catch (error) {
    return fromException(request, error, { stage: "insurer-link" });
  }
}
