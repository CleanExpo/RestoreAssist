import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateInsurerToken } from "@/lib/portal-token";
import { apiError, fromException } from "@/lib/api-errors";

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
      select: { id: true, reportNumber: true, propertyAddress: true },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    const token = generateInsurerToken(report.id);
    const baseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
      "https://restoreassist.app";
    const url = `${baseUrl}/portal/insurer/${token}`;

    return NextResponse.json({
      url,
      token,
      expiresInDays: 30,
      reportNumber: report.reportNumber,
      propertyAddress: report.propertyAddress,
    });
  } catch (error) {
    return fromException(request, error, { stage: "insurer-link" });
  }
}
