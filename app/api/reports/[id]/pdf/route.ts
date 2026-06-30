import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";
import { resolveOrgBrandTheme } from "@/lib/clients/brand";
import { claimSketchesToFloors } from "@/lib/reports/claim-sketch-floors";
import { appendSketchPages } from "@/lib/reports/append-sketch-pages";
import { inspectionPhotosToImages } from "@/lib/reports/inspection-photos-to-images";
import { appendPhotoPages } from "@/lib/reports/append-photo-pages";
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
            // Firm branding (setup BrandCard) → drives the report's logo + accent.
            organization: {
              select: { logoUrl: true, primaryColor: true },
            },
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
        // RA-120 (PR2): per-floor sketches (underlay + annotations) embedded
        // into the report. Only floors with a rendered PNG can be drawn.
        inspection: {
          select: {
            claimSketches: {
              select: {
                floorNumber: true,
                floorLabel: true,
                renderedPngUrl: true,
                sketchData: true,
              },
            },
            // RA-120 (PR3): inspection evidence photos → captioned grid at the
            // end of the report.
            photos: {
              select: {
                url: true,
                thumbnailUrl: true,
                description: true,
                location: true,
                roomType: true,
                mimeType: true,
              },
              orderBy: { timestamp: "asc" },
            },
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

    // Brand the report with the contractor's own firm identity (logo + accent
    // colour). Falls back to RestoreAssist defaults when the org has no branding.
    const theme = resolveOrgBrandTheme(report.user?.organization);
    let pdfBytes = await generateIICRCReportPDF(reportData as any, { theme });

    // RA-120 (PR2): embed each floor's sketch (underlay + annotations) as its
    // own page so the floor plan lives inside the canonical report. A failed
    // image fetch skips that floor — it must never block the download.
    const floors = await claimSketchesToFloors(
      report.inspection?.claimSketches ?? [],
    );
    pdfBytes = await appendSketchPages(pdfBytes, floors, {
      propertyAddress: report.propertyAddress ?? undefined,
      reportNumber: report.reportNumber ?? undefined,
    });

    // RA-120 (PR3): append the inspection's evidence photos as a captioned
    // grid. A broken image is skipped — it must never block the download.
    const photos = await inspectionPhotosToImages(
      report.inspection?.photos ?? [],
    );
    pdfBytes = await appendPhotoPages(pdfBytes, photos, {
      propertyAddress: report.propertyAddress ?? undefined,
      reportNumber: report.reportNumber ?? undefined,
    });

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
