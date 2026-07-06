import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * GET /api/reports/[id]/download
 *
 * RA-7003 Wave 1: this route previously built its own ad-hoc pdf-lib document
 * (~1,300 lines) that skipped the IICRC generator entirely — no branding, no
 * floor-plan pages, no photo grid, no narrative. The canonical artifact-aware
 * exporter is /api/reports/[id]/pdf (IICRC layout + org branding + sketch
 * pages + captioned photo grid). This route now keeps its own contract —
 * session auth + active-subscription gate + ownership — and delegates the
 * rendering there, so there is exactly one client-facing PDF pipeline.
 */
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

    const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
    const sessionUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, subscriptionStatus: true },
    });
    if (!sessionUser) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(
        sessionUser.subscriptionStatus ?? "",
      )
    ) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Active subscription required",
        status: 402,
      });
    }

    const { id } = await params;

    const owns = await prisma.report.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!owns) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // 307 preserves the session cookie; the pdf route re-authorises and
    // rate-limits (10 per 5 min) before streaming the branded IICRC PDF.
    return NextResponse.redirect(
      new URL(`/api/reports/${id}/pdf`, request.url),
      307,
    );
  } catch (error) {
    return fromException(request, error, { stage: "reports/download" });
  }
}
