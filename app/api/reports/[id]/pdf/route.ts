import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";
import { verifyInsurerToken } from "@/lib/portal-token";
import { applyRateLimit, getClientIp } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * GET /api/reports/[id]/pdf
 * Generates and streams an IICRC S500:2021-compliant PDF for a report.
 *
 * Auth modes:
 *   1. Authenticated user (contractor) — standard session auth
 *   2. Insurer share link — ?token=<insurerToken> query param (no login required)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const shareToken = searchParams.get("token");

    let authorised = false;

    // Fetch session once; reused for both auth and rate-limit key
    const session = await getServerSession(authOptions);

    // Mode 1: insurer share token (no session required)
    if (shareToken) {
      const verified = verifyInsurerToken(shareToken);
      if (verified?.reportId === id) {
        authorised = true;
      }
    }

    // Mode 2: authenticated session
    if (!authorised && session?.user?.id) {
      const owns = await prisma.report.findFirst({
        where: { id, userId: session.user.id },
        select: { id: true },
      });
      if (owns) authorised = true;
    }

    if (!authorised) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Rate limit: 10 PDFs per 5 minutes per user/IP to prevent DoS
    const rlKey = session?.user?.id ?? getClientIp(request);
    const rlError = await applyRateLimit(request, {
      windowMs: 5 * 60 * 1000,
      maxRequests: 10,
      prefix: "pdf",
      key: rlKey,
    });
    if (rlError) return rlError;

    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            businessName: true,
            businessAddress: true,
            businessABN: true,
          },
        },
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
            company: true,
          },
        },
      },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    // Parse JSON fields before passing to PDF generator
    const reportData = {
      ...report,
      moistureReadings: report.moistureReadings
        ? JSON.parse(report.moistureReadings as string)
        : null,
      psychrometricReadings: report.psychrometricReadings
        ? JSON.parse(report.psychrometricReadings as string)
        : null,
      psychrometricAssessment: report.psychrometricAssessment
        ? JSON.parse(report.psychrometricAssessment as string)
        : null,
      equipmentSelection: report.equipmentSelection
        ? JSON.parse(report.equipmentSelection as string)
        : null,
      scopeAreas: report.scopeAreas
        ? JSON.parse(report.scopeAreas as string)
        : null,
    };

    const pdfBytes = await generateIICRCReportPDF(reportData as any);

    // RA-1331: guard against OOM on very large reports (embedded photos can
    // reach 20-50 MB). 60 MB is a generous cap — beyond that, the Vercel
    // function would likely OOM under concurrent generation.
    const MAX_PDF_BYTES = 60 * 1024 * 1024; // 60 MB
    if (pdfBytes.length > MAX_PDF_BYTES) {
      console.warn(
        `[reports/pdf] PDF too large (${Math.round(pdfBytes.length / 1024 / 1024)} MB) for report ${id}`,
      );
      return apiError(request, {
        code: "VALIDATION",
        message:
          "This report is too large to generate inline. Please reduce the number of embedded photos and try again.",
        status: 413,
      });
    }

    const filename = `RestoreAssist-${report.reportNumber ?? id}.pdf`.replace(
      /[^a-zA-Z0-9.\-_]/g,
      "-",
    );

    // Stream via ReadableStream so Vercel can use chunked transfer encoding
    // rather than buffering the entire response body before sending.
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(pdfBytes);
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "report-pdf" });
  }
}
